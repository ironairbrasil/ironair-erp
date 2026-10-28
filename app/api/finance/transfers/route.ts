import { NextResponse } from 'next/server';
import { getTenantId } from '@/lib/tenant';
import { listAmazonTransfers } from '@/lib/amazon';
import { listMercadoPagoWithdrawals } from '@/lib/mercado-pago';
import { listAsaasTransfers } from '@/lib/asaas';

export const runtime = 'nodejs';
const cache = new Map<string, { expires: number; data: unknown }>();

export async function GET(req: Request) {
  try {
    const tenantId = await getTenantId(req);
    const cached = cache.get(tenantId);
    if (cached && cached.expires > Date.now() && new URL(req.url).searchParams.get('fresh') !== '1') return NextResponse.json(cached.data);
    const amazonPromise = listAmazonTransfers(tenantId).then(
      (rows) => ({ status: 'connected' as const, rows }),
      (error: unknown) => ({ status: 'unavailable' as const, rows: [], error: error instanceof Error ? error.message : 'Consulta indisponível' })
    );
    const [currentAmazon, currentMercadoPago, currentAsaas] = await Promise.all([amazonPromise, listMercadoPagoWithdrawals(tenantId), listAsaasTransfers(tenantId)]);
    const previous = cached?.data as any;
    const amazon = currentAmazon.status === 'unavailable' && !currentAmazon.rows.length && previous?.amazon?.rows?.length ? { ...currentAmazon, rows: previous.amazon.rows, stale: true } : currentAmazon;
    const mercadoPago = (currentMercadoPago.status === 'unavailable' || currentMercadoPago.status === 'processing') && !currentMercadoPago.rows.length && previous?.mercadoPago?.rows?.length ? { ...currentMercadoPago, rows: previous.mercadoPago.rows, stale: true } : currentMercadoPago;
    const asaas = currentAsaas.status === 'unavailable' && !currentAsaas.rows.length && previous?.asaas?.rows?.length ? { ...currentAsaas, rows: previous.asaas.rows, stale: true } : currentAsaas;
    const amazonCashRows = amazon.rows.filter((row: any) => row.currency === 'BRL');
    const cashAmounts = [
      ...amazonCashRows.map((row: any) => Number(row.amount || 0)),
      ...mercadoPago.rows.map((row: any) => Number(row.amount || 0)),
      ...asaas.rows.map((row: any) => Number(row.amount || 0)),
    ];
    const data = {
      ok: true,
      amazon,
      companyCash: {
        amount: cashAmounts.reduce((total, amount) => total + amount, 0),
        transfers: cashAmounts.length,
        complete: amazon.status === 'connected' && mercadoPago.status === 'connected' && asaas.status === 'connected'
      },
      mercadoPago,
      asaas,
      bankConfirmationAvailable: false,
      updatedAt: new Date().toISOString()
    };
    cache.set(tenantId, { expires: Date.now() + 5 * 60_000, data });
    return NextResponse.json(data);
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Falha ao consultar repasses' }, { status: 401 });
  }
}
