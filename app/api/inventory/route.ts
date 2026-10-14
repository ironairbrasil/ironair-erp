import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';

export async function GET(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const balances=await db.inventoryBalance.findMany({where:{tenantId},include:{variant:{include:{product:true}},warehouse:true},orderBy:[{variant:{sku:'asc'}},{warehouse:{code:'asc'}}]});
    const movements=await db.inventoryMovement.findMany({where:{tenantId},take:1000,orderBy:{createdAt:'desc'},include:{variant:true,warehouse:true,order:{select:{channel:true}}}});
    return NextResponse.json({
      balances:balances.map(r=>({...r,available:Math.max(0,r.onHand-r.reserved)})),
      movements:movements.map(m=>({...m,sku:m.variant.sku,warehouseCode:m.warehouse.code,orderChannel:m.order?.channel||null}))
    });
  }catch(e:any){
    return NextResponse.json({ok:false,error:e?.message||'inventory_error'},{status:500});
  }
}
