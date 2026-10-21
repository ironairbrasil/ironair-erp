import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';
import { auditLog, mergeManualOverrides } from '@/lib/audit';

export async function GET(req:Request){
  const tenantId=await getTenantId(req);
  const variants=await db.productVariant.findMany({where:{tenantId,active:true,product:{active:true}},orderBy:{sku:'asc'},include:{product:{include:{variants:{where:{active:false},select:{sku:true,source:true}},_count:{select:{variants:{where:{active:true}}}}}},balances:{where:{tenantId},include:{warehouse:true}},orderItems:{select:{order:{select:{channel:true}}}}}});
  return NextResponse.json(variants.map(v=>({
    id:v.id,
    productId:v.productId,
    product:v.product.name,
    parentId:v.productId,
    parentName:v.product.name,
    parentVariantCount:v.product._count.variants,
    parentSku:v.source==='AMAZON'?v.product.variants.find(parent=>parent.source==='AMAZON')?.sku||null:null,
    imageUrl:v.product.imageUrl,
    source:v.source || (v.shopifyId ? 'SHOPIFY' : v.orderItems[0]?.order.channel) || 'MANUAL',
    availableQuantity:v.availableQuantity,
    fulfillment:v.fulfillment,
    externalUrl:v.externalUrl,
    sku:v.sku,
    name:v.name,
    voltage:v.voltage,
    salePrice:Number(v.salePrice),
    unitCost:Number(v.unitCost),
    safetyStock:v.safetyStock,
    active:v.active,
    balances:v.balances.map(b=>({warehouseCode:b.warehouse.code,onHand:b.onHand,reserved:b.reserved,available:Math.max(0,b.onHand-b.reserved)}))
  })));
}

export async function DELETE(req:Request){
  try{
    const tenantId=await getTenantId(req);
    if(req.headers.get('content-type')?.includes('application/json')){
      const body=await req.json();
      const skus=Array.isArray(body.skus)?body.skus.filter((sku:unknown):sku is string=>typeof sku==='string'&&sku.length>0):[];
      if(!skus.length) return NextResponse.json({ok:false,error:'Selecione produtos para excluir'},{status:400});
      const variants=await db.productVariant.findMany({where:{tenantId,sku:{in:skus},active:true},select:{productId:true}});
      const result=await db.productVariant.updateMany({where:{tenantId,sku:{in:skus}},data:{active:false}});
      const productIds=[...new Set(variants.map(variant=>variant.productId))];
      for(const productId of productIds){
        const activeSiblings=await db.productVariant.count({where:{tenantId,productId,active:true}});
        if(!activeSiblings) await db.product.update({where:{id:productId,tenantId},data:{active:false}});
      }
      return NextResponse.json({ok:true,deleted:result.count});
    }
    const sku=new URL(req.url).searchParams.get('sku');
    if(!sku) return NextResponse.json({ok:false,error:'sku obrigatório'},{status:400});
    const variant=await db.productVariant.update({where:{tenantId_sku:{tenantId,sku}},data:{active:false}});
    const activeSiblings=await db.productVariant.count({where:{tenantId,productId:variant.productId,active:true}});
    if(activeSiblings===0) await db.product.update({where:{id:variant.productId,tenantId},data:{active:false}});
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
      ? await db.product.update({where:{id:String(b.productId),tenantId},data:{name:productName}})
      : (await db.product.findFirst({where:{tenantId,name:productName}})) || await db.product.create({data:{tenantId,name:productName}});
    const existingSku=String(b._edit||sku);
    const before=await db.productVariant.findUnique({where:{tenantId_sku:{tenantId,sku:existingSku}},include:{product:true}});
    const updateData={
        productId:product.id,
        sku,
        name:String(b.name||productName),
        salePrice:Number(b.price||b.salePrice||0),
        unitCost:Number(b.cost||b.unitCost||0),
        ...(Object.prototype.hasOwnProperty.call(b,'available')?{availableQuantity:Math.max(0,Math.trunc(Number(b.available||0)))}:{}),
        safetyStock:Math.max(0,Math.trunc(Number(b.safety||b.safetyStock||0))),
        active:b.status==='Pausado'?false:true,
        manualOverrides:mergeManualOverrides(before?.manualOverrides,['productId','sku','name','salePrice','unitCost','safetyStock','active']) as any
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
        availableQuantity:Object.prototype.hasOwnProperty.call(b,'available')?Math.max(0,Math.trunc(Number(b.available||0))):null,
        safetyStock:Math.max(0,Math.trunc(Number(b.safety||b.safetyStock||0))),
        active:b.status==='Pausado'?false:true,
        manualOverrides:mergeManualOverrides(null,['productId','sku','name','salePrice','unitCost','safetyStock','active']) as any
      },
      update:updateData
    });
    const warehouse=await db.warehouse.findUnique({where:{tenantId_code:{tenantId,code:'CENTRAL'}}});
    if(warehouse) await db.inventoryBalance.upsert({
      where:{tenantId_variantId_warehouseId:{tenantId,variantId:variant.id,warehouseId:warehouse.id}},
      create:{tenantId,variantId:variant.id,warehouseId:warehouse.id,onHand:0,reserved:0},
      update:{}
    });
    if(Object.prototype.hasOwnProperty.call(b,'physical')){
      const desiredPhysical=Math.max(0,Math.trunc(Number(b.physical||0)));
      const movements=await db.inventoryMovement.findMany({where:{tenantId,variantId:variant.id,type:{in:['ADJUSTMENT','SALE']}},select:{quantity:true}});
      const currentPhysical=movements.reduce((sum,movement)=>sum+movement.quantity,0);
      const adjustment=desiredPhysical-currentPhysical;
      if(warehouse&&adjustment!==0) await db.inventoryMovement.create({data:{tenantId,variantId:variant.id,warehouseId:warehouse.id,type:'ADJUSTMENT',quantity:adjustment,reference:`product-physical:${sku}:${Date.now()}`,source:'MANUAL'}});
    }
    if(Object.prototype.hasOwnProperty.call(b,'available')){
      const available=Math.max(0,Math.trunc(Number(b.available||0)));
      if(warehouse){
        await db.inventoryBalance.upsert({
          where:{tenantId_variantId_warehouseId:{tenantId,variantId:variant.id,warehouseId:warehouse.id}},
          create:{tenantId,variantId:variant.id,warehouseId:warehouse.id,onHand:available,reserved:0},
          update:{onHand:available}
        });
      }
    }
    await db.orderItem.updateMany({where:{tenantId,sku},data:{variantId:variant.id,unitCost:updateData.unitCost}});
    await auditLog({
      tenantId,
      entityType:'ProductVariant',
      entityId:variant.id,
      action:before?'update_manual_product':'create_manual_product',
      before:before?{product:before.product.name,sku:before.sku,name:before.name,salePrice:before.salePrice,unitCost:before.unitCost,safetyStock:before.safetyStock,active:before.active}:null,
      after:{product:productName,sku,name:updateData.name,salePrice:updateData.salePrice,unitCost:updateData.unitCost,safetyStock:updateData.safetyStock,active:updateData.active,physical:b.physical,available:b.available},
      metadata:{previousSku:existingSku}
    });
    return NextResponse.json({ok:true,id:variant.id});
  }catch(e:any){
    return NextResponse.json({ok:false,error:e?.message||'error'},{status:400});
  }
}
