import { NextResponse } from 'next/server';
import { moveStock, transferStock } from '@/lib/inventory';
import { getTenantId } from '@/lib/tenant';
import { auditLog } from '@/lib/audit';
import { db } from '@/lib/db';

const typeMap:Record<string,any>={
  'Entrada manual':'ADJUSTMENT',
  'Saída manual':'ADJUSTMENT',
  'Transferência':'TRANSFER_OUT',
  'Avaria':'DAMAGE',
  'Devolução':'RETURN',
  'Ajuste de inventário':'ADJUSTMENT'
};

function movementDate(value:string|Date|undefined){
  if(typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T12:00:00-03:00`;
  return value;
}

export async function POST(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const body=await req.json();
    let sku=String(body.sku||'').trim();
    if(body.folderId){
      const folder=await db.inventoryFolder.findFirst({where:{id:String(body.folderId),tenantId},include:{variants:{where:{active:true},orderBy:{sku:'asc'},take:1}}});
      if(!folder) throw new Error('Pasta não encontrada');
      if(!folder.variants[0]) throw new Error('A pasta não possui produtos');
      sku=folder.variants[0].sku;
    }
    if(!sku) throw new Error('Selecione um produto ou pasta');
    const type=typeMap[body.type]||body.type;
    const rawQuantity=Math.abs(Math.trunc(Number(body.quantity??body.qty)));
    const quantity=['SALE','TRANSFER_OUT','DAMAGE'].includes(type)||body.type==='Saída manual'?-rawQuantity:rawQuantity;
    const destination=String(body.warehouseCode||'CENTRAL').replaceAll(' ','_').toUpperCase();
    if(type==='TRANSFER_OUT'&&destination==='CENTRAL') throw new Error('Escolha Amazon FBA ou Mercado Livre Full para a transferência');
    const idempotencyKey=body.idempotencyKey||`manual:${body.folderId?`folder-${body.folderId}`:sku}:${type}:${body.reference||body.ref||Date.now()}:${quantity}`;
    const createdAt=movementDate(body.date||body.createdAt);
    const movement=(destination==='AMAZON_FBA'||destination==='ML_FULL')?await transferStock({tenantId,sku,toWarehouseCode:destination,quantity:rawQuantity,reference:body.reference||body.ref,createdAt,idempotencyKey}):await moveStock({
      tenantId,
      sku,
      warehouseCode:destination,
      quantity,
      type,
      reference:body.reference||body.ref,
      note:body.note,
      createdAt,
      idempotencyKey,
      metadata:body.folderId?{folderId:String(body.folderId),scope:'FOLDER'}:undefined
    });
    await auditLog({
      tenantId,
      entityType:'InventoryMovement',
      entityId:movement.id,
      action:'create_manual_movement',
      after:{sku,folderId:body.folderId||null,type,quantity,reference:body.reference||body.ref,date:body.date||body.createdAt},
      metadata:{warehouseCode:destination,folderId:body.folderId||null}
    });
    return NextResponse.json({ok:true,id:movement.id});
  }catch(e:any){
    return NextResponse.json({ok:false,error:e?.message||'error'},{status:400});
  }
}
