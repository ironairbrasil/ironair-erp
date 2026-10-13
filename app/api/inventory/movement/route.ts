import { NextResponse } from 'next/server';
import { moveStock } from '@/lib/inventory';
import { getTenantId } from '@/lib/tenant';

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
      idempotencyKey:body.idempotencyKey||`manual:${body.sku}:${type}:${body.reference||body.ref||Date.now()}:${quantity}`
    });
    return NextResponse.json({ok:true,id:movement.id});
  }catch(e:any){
    return NextResponse.json({ok:false,error:e?.message||'error'},{status:400});
  }
}
