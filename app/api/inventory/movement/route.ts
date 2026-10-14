import { NextResponse } from 'next/server';
import { moveStock } from '@/lib/inventory';
import { getTenantId } from '@/lib/tenant';
import { auditLog } from '@/lib/audit';

const typeMap:Record<string,any>={
  'Entrada manual':'PURCHASE',
  'Saída manual':'ADJUSTMENT',
  'Transferência':'TRANSFER_OUT',
  'Avaria':'DAMAGE',
  'Devolução':'RETURN',
  'Ajuste de inventário':'ADJUSTMENT'
};

export async function POST(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const body=await req.json();
    const type=typeMap[body.type]||body.type;
    const rawQuantity=Math.abs(Math.trunc(Number(body.quantity??body.qty)));
    const quantity=['SALE','TRANSFER_OUT','DAMAGE'].includes(type)||body.type==='Saída manual'?-rawQuantity:rawQuantity;
    const movement=await moveStock({
      tenantId,
      sku:String(body.sku||''),
      warehouseCode:String(body.warehouseCode||body.from||'CENTRAL').replaceAll(' ','_').toUpperCase(),
      quantity,
      type,
      reference:body.reference||body.ref,
      note:body.note,
      createdAt:body.date||body.createdAt,
      idempotencyKey:body.idempotencyKey||`manual:${body.sku}:${type}:${body.reference||body.ref||Date.now()}:${quantity}`
    });
    await auditLog({
      tenantId,
      entityType:'InventoryMovement',
      entityId:movement.id,
      action:'create_manual_movement',
      after:{sku:body.sku,type,quantity,reference:body.reference||body.ref,date:body.date||body.createdAt},
      metadata:{warehouseCode:body.warehouseCode||body.from||'CENTRAL'}
    });
    return NextResponse.json({ok:true,id:movement.id});
  }catch(e:any){
    return NextResponse.json({ok:false,error:e?.message||'error'},{status:400});
  }
}
