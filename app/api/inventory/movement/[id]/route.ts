import { NextResponse } from 'next/server';
import type { InventoryMovementType } from '@prisma/client';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';
import { auditLog } from '@/lib/audit';

const movementTypes = new Set<InventoryMovementType>(['PURCHASE', 'SALE', 'RESERVE', 'RELEASE', 'TRANSFER_IN', 'TRANSFER_OUT', 'RETURN', 'DAMAGE', 'ADJUSTMENT']);
const effect = (type: InventoryMovementType, quantity: number) => ({
  onHand: type === 'RESERVE' || type === 'RELEASE' ? 0 : quantity,
  reserved: type === 'RESERVE' ? Math.abs(quantity) : type === 'RELEASE' ? -Math.abs(quantity) : 0,
});
const parseDate = (value: unknown) => {
  const text = String(value || '');
  const localized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text) ? `${text}:00-03:00` : /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T12:00:00-03:00` : text;
  const date = new Date(localized);
  if (Number.isNaN(date.getTime())) throw new Error('Data inválida');
  return date;
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenantId = await getTenantId(req);
    const { id } = await params;
    const body = await req.json();
    const sku = String(body.sku || '').trim();
    const type = String(body.type || '') as InventoryMovementType;
    const quantity = Number(body.quantity);
    const reference = String(body.reference || '').trim() || null;
    const note = String(body.note || '').trim() || null;
    const createdAt = parseDate(body.createdAt);
    if (!sku || !movementTypes.has(type) || !Number.isInteger(quantity) || quantity === 0) throw new Error('Preencha SKU, tipo e quantidade inteira diferente de zero');
    if (['SALE', 'DAMAGE', 'TRANSFER_OUT'].includes(type) && quantity >= 0) throw new Error('Este movimento deve ter quantidade negativa');
    if (['PURCHASE', 'RETURN', 'TRANSFER_IN'].includes(type) && quantity <= 0) throw new Error('Este movimento deve ter quantidade positiva');

    const before = await db.inventoryMovement.findFirst({ where: { id, tenantId }, include: { variant: true, warehouse: true } });
    if (!before) return NextResponse.json({ ok: false, error: 'Movimento não encontrado' }, { status: 404 });
    const transfer = before.type === 'TRANSFER_IN' || before.type === 'TRANSFER_OUT';
    if (transfer !== (type === 'TRANSFER_IN' || type === 'TRANSFER_OUT')) throw new Error('Transferência deve continuar como transferência; edite origem, destino e quantidade');

    const result = await db.$transaction(async (tx) => {
      const variant = await tx.productVariant.findUnique({ where: { tenantId_sku: { tenantId, sku } } });
      if (!variant) throw new Error(`SKU desconhecido: ${sku}`);
      const code = String(body.warehouseCode || before.warehouse.code);
      const fromCode = String(body.fromWarehouseCode || (before.type === 'TRANSFER_OUT' ? before.warehouse.code : 'CENTRAL'));
      const toCode = String(body.toWarehouseCode || (before.type === 'TRANSFER_IN' ? before.warehouse.code : 'AMAZON_FBA'));
      const codes = transfer ? [fromCode, toCode] : [code];
      const warehouses = await tx.warehouse.findMany({ where: { tenantId, code: { in: codes } } });
      const warehouseByCode = new Map(warehouses.map((warehouse) => [warehouse.code, warehouse]));
      if (codes.some((warehouseCode) => !warehouseByCode.has(warehouseCode))) throw new Error('Depósito inválido');
      if (transfer && fromCode === toCode) throw new Error('Origem e destino devem ser diferentes');

      const key = String(before.idempotencyKey || '');
      const pairKey = key.endsWith(':in') ? key.slice(0, -3) : key;
      const pair = transfer && pairKey ? await tx.inventoryMovement.findMany({ where: { tenantId, idempotencyKey: { in: [pairKey, `${pairKey}:in`] } } }) : [];
      const paired = pair.length === 2 && pair.some((row) => row.type === 'TRANSFER_IN') && pair.some((row) => row.type === 'TRANSFER_OUT');
      const originals = paired ? pair : [before];
      const edits = originals.map((row) => {
        const isIn = row.type === 'TRANSFER_IN';
        return {
          row,
          variantId: variant.id,
          warehouseId: transfer ? warehouseByCode.get(isIn ? toCode : fromCode)!.id : warehouseByCode.get(code)!.id,
          type: paired ? row.type : type,
          quantity: paired ? (isIn ? Math.abs(quantity) : -Math.abs(quantity)) : quantity,
        };
      });
      const deltas = new Map<string, { variantId: string; warehouseId: string; onHand: number; reserved: number }>();
      const add = (variantId: string, warehouseId: string, type: InventoryMovementType, amount: number, sign: number) => {
        const key = `${variantId}:${warehouseId}`;
        const previous = deltas.get(key) || { variantId, warehouseId, onHand: 0, reserved: 0 };
        const change = effect(type, amount);
        previous.onHand += sign * change.onHand;
        previous.reserved += sign * change.reserved;
        deltas.set(key, previous);
      };
      for (const original of originals) add(original.variantId, original.warehouseId, original.type, original.quantity, -1);
      for (const edit of edits) add(edit.variantId, edit.warehouseId, edit.type, edit.quantity, 1);
      for (const delta of deltas.values()) {
        const balance = await tx.inventoryBalance.upsert({
          where: { tenantId_variantId_warehouseId: { tenantId, variantId: delta.variantId, warehouseId: delta.warehouseId } },
          create: { tenantId, variantId: delta.variantId, warehouseId: delta.warehouseId, onHand: 0, reserved: 0 },
          update: {},
        });
        const onHand = balance.onHand + delta.onHand;
        const reserved = balance.reserved + delta.reserved;
        if (onHand < 0 || reserved < 0 || reserved > onHand) throw new Error('A edição deixaria o estoque ou a reserva com saldo inválido');
        await tx.inventoryBalance.update({ where: { id: balance.id }, data: { onHand, reserved } });
      }
      for (const edit of edits) await tx.inventoryMovement.update({
        where: { id: edit.row.id },
        data: {
          variantId: edit.variantId, warehouseId: edit.warehouseId, type: edit.type, quantity: edit.quantity,
          reference, note, createdAt, source: 'MANUAL',
          metadata: { ...((edit.row.metadata && typeof edit.row.metadata === 'object' && !Array.isArray(edit.row.metadata)) ? edit.row.metadata as object : {}), manuallyEditedAt: new Date().toISOString() },
        },
      });
      return { updated: edits.length, before: originals.map((row) => ({ id: row.id, variantId: row.variantId, warehouseId: row.warehouseId, type: row.type, quantity: row.quantity, reference: row.reference, note: row.note, createdAt: row.createdAt })) };
    });
    try {
      await auditLog({ tenantId, entityType: 'InventoryMovement', entityId: id, action: 'update_manual_movement', before: result.before, after: { sku, type, quantity, reference, note, createdAt, warehouseCode: body.warehouseCode, fromWarehouseCode: body.fromWarehouseCode, toWarehouseCode: body.toWarehouseCode } });
    } catch (auditError) {
      console.error('Falha ao registrar auditoria da movimentação', auditError);
    }
    return NextResponse.json({ ok: true, updated: result.updated });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Falha ao editar movimentação' }, { status: 400 });
  }
}
