import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';

export async function GET(req:Request){
  const tenantId=await getTenantId(req);
  const variants=await db.productVariant.findMany({where:{tenantId,active:true,product:{active:true}},orderBy:{sku:'asc'},include:{product:true,balances:{where:{tenantId},include:{warehouse:true}}}});
  return NextResponse.json(variants.map(v=>({
    id:v.id,
    productId:v.productId,
    product:v.product.name,
    sku:v.sku,
    name:v.name,
    voltage:v.voltage,
    salePrice:Number(v.salePrice),
    unitCost:Number(v.unitCost),
    safetyStock:v.safetyStock,
    active:v.active,
    balances:v.balances.map(b=>({warehouseCode:b.warehouse.code,onHand:b.onHand,reserved:b.reserved,available:Math.max(0,b.onHand-b.reserved-v.safetyStock)}))
  })));
}

export async function DELETE(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const sku=new URL(req.url).searchParams.get('sku');
    if(!sku) return NextResponse.json({ok:false,error:'sku obrigatório'},{status:400});
    const variant=await db.productVariant.update({where:{tenantId_sku:{tenantId,sku}},data:{active:false}});
    const activeSiblings=await db.productVariant.count({where:{tenantId,productId:variant.productId,active:true}});
    if(activeSiblings===0) await db.product.update({where:{id:variant.productId},data:{active:false}});
    return NextResponse.json({ok:true});
  }catch(e:any){
    return NextResponse.json({ok:false,error:e?.message||'error'},{status:400});
  }
}

export async function POST(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const b=await req.json();
    const sku=String(b.sku||'').trim();
    if(!sku) return NextResponse.json({ok:false,error:'SKU obrigatório'},{status:400});
    const productName=String(b.product||b.name||'Produto').trim();
    const product=b.productId
      ? await db.product.update({where:{id:b.productId},data:{name:productName}})
      : (await db.product.findFirst({where:{tenantId,name:productName}})) || await db.product.create({data:{tenantId,name:productName}});
    const existingSku=String(b._edit||sku);
    const updateData={
        productId:product.id,
        sku,
        name:String(b.name||productName),
        salePrice:Number(b.price||b.salePrice||0),
        unitCost:Number(b.cost||b.unitCost||0),
        safetyStock:Math.max(0,Math.trunc(Number(b.safety||b.safetyStock||0))),
        active:b.status==='Pausado'?false:true
      };
    const variant=await db.productVariant.upsert({
      where:{tenantId_sku:{tenantId,sku:existingSku}},
      create:{
        tenantId,
        productId:product.id,
        sku,
        name:String(b.name||productName),
        salePrice:Number(b.price||b.salePrice||0),
        unitCost:Number(b.cost||b.unitCost||0),
        safetyStock:Math.max(0,Math.trunc(Number(b.safety||b.safetyStock||0))),
        active:b.status==='Pausado'?false:true
      },
      update:updateData
    });
    await db.orderItem.updateMany({where:{tenantId,sku},data:{unitCost:updateData.unitCost}});
    return NextResponse.json({ok:true,id:variant.id});
  }catch(e:any){
    return NextResponse.json({ok:false,error:e?.message||'error'},{status:400});
  }
}
