import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ingestOrder } from '@/lib/orders';
import { moveStock } from '@/lib/inventory';
import { getTenantId } from '@/lib/tenant';
import { auditLog, mergeManualOverrides } from '@/lib/audit';

async function reconcileOrderSaleMovement(input:{tenantId:string;orderId:string;externalId:string;sku:string;variantId:string;quantity:number;date:Date}){
  const warehouse=await db.warehouse.findUnique({where:{tenantId_code:{tenantId:input.tenantId,code:'CENTRAL'}}});
  if(!warehouse) throw new Error('Estoque CENTRAL não encontrado');
  const quantity=-Math.abs(input.quantity || 1);
  const current=await db.inventoryMovement.findFirst({where:{tenantId:input.tenantId,orderId:input.orderId,type:'SALE'},include:{variant:true,warehouse:true},orderBy:{createdAt:'asc'}});
  if(!current){
    await moveStock({
      tenantId:input.tenantId,
      sku:input.sku,
      warehouseCode:'CENTRAL',
      quantity,
      type:'SALE',
      reference:input.externalId,
      orderId:input.orderId,
      createdAt:input.date,
      idempotencyKey:`manual-assign-sale:${input.orderId}`
    });
    return;
  }
  if(current.variantId===input.variantId){
    await db.inventoryMovement.update({where:{id:current.id},data:{quantity,reference:input.externalId,createdAt:input.date,warehouseId:warehouse.id}});
    return;
  }
  await db.$transaction(async tx=>{
    const oldBalance=await tx.inventoryBalance.findUnique({where:{tenantId_variantId_warehouseId:{tenantId:input.tenantId,variantId:current.variantId,warehouseId:current.warehouseId}}});
    if(oldBalance) await tx.inventoryBalance.update({where:{id:oldBalance.id},data:{onHand:oldBalance.onHand-current.quantity}});
    const newBalance=await tx.inventoryBalance.upsert({
      where:{tenantId_variantId_warehouseId:{tenantId:input.tenantId,variantId:input.variantId,warehouseId:warehouse.id}},
      create:{tenantId:input.tenantId,variantId:input.variantId,warehouseId:warehouse.id,onHand:0,reserved:0},
      update:{}
    });
    const nextOnHand=newBalance.onHand+quantity;
    if(nextOnHand<0) throw new Error(`Estoque insuficiente para ${input.sku}`);
    await tx.inventoryBalance.update({where:{id:newBalance.id},data:{onHand:nextOnHand}});
    await tx.inventoryMovement.update({where:{id:current.id},data:{variantId:input.variantId,warehouseId:warehouse.id,quantity,reference:input.externalId,createdAt:input.date,idempotencyKey:`manual-assign-sale:${input.orderId}`}});
  });
}

export async function GET(req:Request){
  const tenantId=await getTenantId(req);
  const rows=await db.order.findMany({where:{tenantId},take:1000,orderBy:[{paidAt:'desc'},{createdAt:'desc'}],include:{items:{include:{variant:{select:{voltage:true}}}},attribution:true,customer:true}});
  return NextResponse.json(rows);
}

export async function POST(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const b=await req.json();
    const product=await db.productVariant.findUnique({where:{tenantId_sku:{tenantId,sku:String(b.sku||'')}}});
    const quantity=Math.max(1,Math.trunc(Number(b.quantity||1)));
    const grossAmount=Number(b.value||b.grossAmount||product?.salePrice||0);
    const paidAtInput=String(b.paidAt||b.date||'').trim();
    const paidAt=paidAtInput ? new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(paidAtInput)?paidAtInput:`${paidAtInput}:00-03:00`) : new Date();
    if(Number.isNaN(paidAt.getTime())) throw new Error('Data da venda inválida');
    const source=String(b.source||'Manual');
    const channel=source==='Shopify'?'SHOPIFY':source==='Mercado Livre'||source==='Mercado Livre Full'?'MERCADO_LIVRE':source==='Amazon'||source==='Amazon FBA'?'AMAZON':source==='Shopee'?'SHOPEE':'MANUAL';
    const warehouseCode=source==='Mercado Livre Full'?'ML_FULL':source==='Amazon FBA'?'AMAZON_FBA':'CENTRAL';
    const order=await ingestOrder({
      tenantId,
      externalId:String(b.externalId||`MANUAL-${Date.now()}`),
      channel,
      warehouseCode,
      status:b.status||'PAID',
      grossAmount,
      feeAmount:Number(b.feeAmount||b.fee||0),
      shippingAmount:Number(b.shippingAmount||b.freight||0),
      currency:'BRL',
      paymentMethod:b.paymentMethod||'Manual',
      paidAt:paidAt.toISOString(),
      customer:{name:b.customer||'Cliente manual',externalId:b.email||undefined},
      items:[{
        sku:String(b.sku||product?.sku||''),
        name:String(b.product||product?.name||'Item manual'),
        quantity,
        unitPrice:grossAmount/quantity,
        unitCost:Number(product?.unitCost||0)
      }],
      attribution:b.attribution||{source:b.source||'Manual',campaign:b.campaign||undefined}
    });
    return NextResponse.json({ok:true,id:order?.id || null});
  }catch(e:any){
    return NextResponse.json({ok:false,error:e?.message||'error'},{status:400});
  }
}

export async function PATCH(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const b=await req.json();
    const id=String(b.id||'');
    if(!id) return NextResponse.json({ok:false,error:'id obrigatório'},{status:400});
    const existing=await db.order.findFirst({where:{id,tenantId},include:{items:{orderBy:{id:'asc'}},customer:true}});
    if(!existing) return NextResponse.json({ok:false,error:'Pedido não encontrado'},{status:404});
    const editedFields=['feeAmount','shippingAmount','grossAmount','paidAt','paymentMethod','unitCost'];
    if(Object.prototype.hasOwnProperty.call(b,'customer')) editedFields.push('customer');
    if(Object.prototype.hasOwnProperty.call(b,'itemSku')) editedFields.push('itemSku');
    const paidAtInput=String(b.paidAt||'').trim();
    const paidAt=paidAtInput ? new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(paidAtInput)?paidAtInput:`${paidAtInput}:00-03:00`) : existing.paidAt;
    if(paidAt&&Number.isNaN(paidAt.getTime())) return NextResponse.json({ok:false,error:'Data da venda inválida'},{status:400});
    await db.order.update({
      where:{id},
      data:{
        feeAmount:Number(b.feeAmount||b.fee||0),
        shippingAmount:Number(b.shippingAmount||b.freight||0),
        grossAmount:Number(b.grossAmount??existing.grossAmount),
        paidAt,
        paymentMethod:String(b.paymentMethod??existing.paymentMethod??'').trim()||null,
        manualOverrides:mergeManualOverrides(existing.manualOverrides,editedFields) as any
      }
    });
    if(existing.customerId && Object.prototype.hasOwnProperty.call(b,'customer')){
      const name=String(b.customer||'').trim();
      if(name) await db.customer.updateMany({where:{id:existing.customerId,tenantId},data:{name}});
    }else if(Object.prototype.hasOwnProperty.call(b,'customer')){
      const name=String(b.customer||'').trim();
      if(name){
        const customer=await db.customer.create({data:{tenantId,name}});
        await db.order.update({where:{id},data:{customerId:customer.id}});
      }
    }
    if(Object.prototype.hasOwnProperty.call(b,'itemSku')){
      const sku=String(b.itemSku||'').trim();
      if(sku){
        const variant=await db.productVariant.findUnique({where:{tenantId_sku:{tenantId,sku}}});
        if(!variant) return NextResponse.json({ok:false,error:'Produto/voltagem não encontrado'},{status:404});
        const item=String(b.orderItemId||'')
          ? await db.orderItem.findFirst({where:{id:String(b.orderItemId),tenantId,orderId:id}})
          : await db.orderItem.findFirst({where:{tenantId,orderId:id},orderBy:{id:'asc'}});
        if(!item) return NextResponse.json({ok:false,error:'Item do pedido não encontrado'},{status:404});
        await db.orderItem.update({
          where:{id:item.id},
          data:{
            variantId:variant.id,
            sku:variant.sku,
            name:variant.name,
            unitCost:variant.unitCost,
            manualOverrides:mergeManualOverrides(item.manualOverrides,['variantId','sku','name','unitCost']) as any
          }
        });
        await reconcileOrderSaleMovement({
          tenantId,
          orderId:existing.id,
          externalId:existing.externalId,
          sku:variant.sku,
          variantId:variant.id,
          quantity:item.quantity,
          date:existing.paidAt||existing.createdAt
        });
      }
    }
    if(Object.prototype.hasOwnProperty.call(b,'cogs')){
      const item=String(b.orderItemId||'')
        ? await db.orderItem.findFirst({where:{id:String(b.orderItemId),tenantId,orderId:id}})
        : await db.orderItem.findFirst({where:{tenantId,orderId:id},orderBy:{id:'asc'}});
      if(item) await db.orderItem.update({where:{id:item.id},data:{unitCost:Number(b.cogs||0)/Math.max(1,item.quantity),manualOverrides:mergeManualOverrides(item.manualOverrides,['unitCost']) as any}});
    }
    if(paidAt) await db.inventoryMovement.updateMany({where:{tenantId,orderId:id,type:'SALE'},data:{createdAt:paidAt}});
    const updated=await db.order.findFirst({where:{id,tenantId},include:{items:{orderBy:{id:'asc'}},customer:true}});
    await auditLog({
      tenantId,
      entityType:'Order',
      entityId:id,
      action:'update_manual_order',
      before:{grossAmount:existing.grossAmount,feeAmount:existing.feeAmount,shippingAmount:existing.shippingAmount,paidAt:existing.paidAt,paymentMethod:existing.paymentMethod,customer:existing.customer?.name,items:existing.items.map(i=>({id:i.id,sku:i.sku,variantId:i.variantId,unitCost:i.unitCost}))},
      after:{grossAmount:updated?.grossAmount,feeAmount:updated?.feeAmount,shippingAmount:updated?.shippingAmount,paidAt:updated?.paidAt,paymentMethod:updated?.paymentMethod,customer:updated?.customer?.name,items:updated?.items.map(i=>({id:i.id,sku:i.sku,variantId:i.variantId,unitCost:i.unitCost}))},
      metadata:{fields:editedFields,externalId:existing.externalId}
    });
    return NextResponse.json({ok:true});
  }catch(e:any){
    return NextResponse.json({ok:false,error:e?.message||'error'},{status:400});
  }
}

async function deleteOrderWithStockReverse(tenantId:string,id:string){
    const order=await db.order.findFirst({where:{id,tenantId},include:{movements:{where:{tenantId},include:{variant:true,warehouse:true}}}});
    if(!order) throw new Error('Pedido não encontrado');
    for(const m of order.movements){
      if(m.type==='SALE'&&m.quantity<0){
        await moveStock({
          tenantId,
          sku:m.variant.sku,
          warehouseCode:m.warehouse.code,
          quantity:Math.abs(m.quantity),
          type:'RETURN',
          reference:`delete:${order.externalId}`,
          note:'Reversão automática por exclusão de venda',
          idempotencyKey:`delete-order:${order.id}:${m.id}`
        });
      }
    }
    await db.$transaction([
      db.auditLog.create({data:{tenantId,entityType:'Order',entityId:`${order.channel}:${order.externalId}`,action:'delete_manual_order',source:'MANUAL',before:{id:order.id,status:order.status,externalId:order.externalId,channel:order.channel},metadata:{orderId:order.id}}}),
      db.order.delete({where:{id}})
    ]);
}

export async function DELETE(req:Request){
  try{
    const tenantId=await getTenantId(req);
    const u=new URL(req.url);
    const queryId=u.searchParams.get('id');
    let body:any={};
    try{body=await req.json()}catch{}
    const ids=[...(Array.isArray(body.ids)?body.ids:[]),queryId].filter(Boolean).map(String);
    if(!ids.length) return NextResponse.json({ok:false,error:'id obrigatório'},{status:400});
    for(const id of ids) await deleteOrderWithStockReverse(tenantId,id);
    return NextResponse.json({ok:true,deleted:ids.length});
  }catch(e:any){
    return NextResponse.json({ok:false,error:e?.message||'error'},{status:400});
  }
}
