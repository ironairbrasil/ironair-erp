import { db } from './db';
import { moveStock } from './inventory';
import { getTenantId } from './tenant';
import type { Channel } from '@prisma/client';
import { sendTenantPush } from './push';
export type IngestOrder={tenantId?:string;externalId:string;channel:Channel;status:'PENDING'|'PAID'|'CANCELLED'|'REFUNDED'|'CHARGEBACK';currency?:string;grossAmount:number;discountAmount?:number;shippingAmount?:number;feeAmount?:number;taxAmount?:number;paymentMethod?:string;paidAt?:string;customer?:{externalId?:string;name?:string;emailHash?:string;phoneHash?:string;city?:string;state?:string;zip?:string};items:Array<{sku:string;name:string;quantity:number;unitPrice:number;unitCost?:number}>;attribution?:Record<string,any>;skipInventory?:boolean;warehouseCode?:string;fulfillmentOrigin?:'AMAZON_FBA'|'ML_FULL'};
const skuAliases:Record<string,string>={
 'IRONAIR-127':'IRON-AIR-127V',
 'IRONAIR127':'IRON-AIR-127V',
 'FBA-IRONAIR127':'IRON-AIR-127V',
 'FBA-IRONAIR-127':'IRON-AIR-127V',
 'FBA-IRONAIR-127V':'IRON-AIR-127V',
 'IRONAIR-220':'IRON-AIR-220V',
 'IRONAIR220':'IRON-AIR-220V',
 'FBA-IRONAIR220':'IRON-AIR-220V',
 'FBA-IRONAIR-220':'IRON-AIR-220V',
 'FBA-IRONAIR-220V':'IRON-AIR-220V'
};
function canonicalSku(sku:string){
 const normalized=String(sku||'').trim().toUpperCase();
 return skuAliases[normalized]||String(sku||'').trim();
}
function cleanCustomerUpdate(customer:NonNullable<IngestOrder['customer']>){
 const data:Record<string,string>={};
 for(const key of ['externalId','name','emailHash','phoneHash','city','state','zip'] as const){
  const value=customer[key];
  if(typeof value==='string'&&value.trim()) data[key]=value.trim();
 }
 return data;
}
function overrideFields(value:unknown){
 const fields=value&&typeof value==='object'&&!Array.isArray(value)&&(value as any).fields;
 return new Set(Array.isArray(fields)?fields.map(String):[]);
}
export async function ingestOrder(input:IngestOrder){
 const tenantId=input.tenantId||await getTenantId();
 const manuallyDeleted=await db.auditLog.findFirst({
  where:{tenantId,entityType:'Order',entityId:`${input.channel}:${input.externalId}`,action:'delete_manual_order'},
  select:{id:true}
 });
 if(manuallyDeleted) return null;
 const existing=await db.order.findUnique({where:{tenantId_channel_externalId:{tenantId,channel:input.channel,externalId:input.externalId}},include:{items:{orderBy:{id:'asc'}},movements:{where:{tenantId,type:'SALE'},select:{id:true,idempotencyKey:true}}}});
 const hasManualSaleMovement=!!existing?.movements?.some(m=>String(m.idempotencyKey||'').startsWith('manual-assign-sale')||String(m.idempotencyKey||'').startsWith('manual:'));
 const orderOverrides=overrideFields(existing?.manualOverrides);
 let customerId=existing?.customerId||undefined;
 if(input.customer){const key=input.customer.externalId?`${input.channel}:${input.customer.externalId}`:undefined;const data=cleanCustomerUpdate(input.customer);if(key){const current=await db.customer.findUnique({where:{tenantId_sourceKey:{tenantId,sourceKey:key}}});if(current){const customerOverrides=overrideFields(current.manualOverrides);const update=Object.fromEntries(Object.entries(data).filter(([k,v])=>v&&!(current as any)[k]&&!customerOverrides.has(k)));const customer=Object.keys(update).length?await db.customer.update({where:{id:current.id},data:update}):current;customerId=customer.id}else{const customer=await db.customer.create({data:{...data,tenantId,sourceKey:key}});customerId=customer.id}}else if(!existing?.customerId){const customer=await db.customer.create({data:{...data,tenantId}});customerId=customer.id}}
 const prepared=await Promise.all(input.items.map(async (i,index)=>{const sku=canonicalSku(i.sku);const v=await db.productVariant.findUnique({where:{tenantId_sku:{tenantId,sku}}});const previous=existing?.items[index];if(hasManualSaleMovement&&previous)return{tenantId,variantId:previous.variantId,sku:previous.sku,name:previous.name,quantity:previous.quantity,unitPrice:Number(previous.unitPrice||i.unitPrice),unitCost:Number(previous.unitCost||0)};if(!v&&previous?.variantId)return{tenantId,variantId:previous.variantId,sku:previous.sku,name:previous.name,quantity:i.quantity,unitPrice:i.unitPrice,unitCost:Number(previous.unitCost||0)};return{tenantId,variantId:v?.id,sku:v?.sku||i.sku,name:v?.name||i.name,quantity:i.quantity,unitPrice:i.unitPrice,unitCost:i.unitCost??Number(v?.unitCost||0)}}));
 const order=await db.$transaction(async tx=>{
   const existingFee=Number(existing?.feeAmount||0);
   const existingFreight=Number(existing?.shippingAmount||0);
   const existingTax=Number(existing?.taxAmount||0);
   const forceFinancialRefresh=input.status==='REFUNDED'||input.status==='CHARGEBACK';
   const base={status:input.status,grossAmount:input.grossAmount,discountAmount:input.discountAmount||0,shippingAmount:existing&&orderOverrides.has('shippingAmount')&&!forceFinancialRefresh?existingFreight:input.shippingAmount||0,feeAmount:existing&&orderOverrides.has('feeAmount')&&!forceFinancialRefresh?existingFee:input.feeAmount||0,taxAmount:existing&&orderOverrides.has('taxAmount')&&!forceFinancialRefresh?existingTax:input.taxAmount||0,paymentMethod:input.paymentMethod,paidAt:input.paidAt?new Date(input.paidAt):undefined,customerId,sourceSnapshot:input as any};
   if(!existing)return tx.order.create({data:{tenantId,externalId:input.externalId,channel:input.channel,currency:input.currency||'BRL',...base,items:{create:prepared}}});
   await tx.orderItem.deleteMany({where:{orderId:existing.id}});
   return tx.order.update({where:{id:existing.id},data:{...base,currency:input.currency||existing.currency,items:{create:prepared}}});
 });
 if(input.attribution) await db.attribution.upsert({where:{orderId:order.id},create:{tenantId,orderId:order.id,...mapAttribution(input.attribution)},update:mapAttribution(input.attribution)});
 // Inventory is deducted exactly once on the first transition into PAID. Refunds do NOT auto-restock: physical returns require an explicit RETURN movement.
 if(!input.skipInventory&&input.status==='PAID'&&existing?.status!=='PAID') for(const item of prepared.filter(i=>i.variantId)) await moveStock({tenantId,sku:item.sku,warehouseCode:input.warehouseCode||'CENTRAL',quantity:-Math.abs(item.quantity),type:'SALE',reference:input.externalId,orderId:order.id,createdAt:order.paidAt||order.createdAt,idempotencyKey:`sale:${input.channel}:${input.externalId}:${item.sku}`});
 if(input.status==='PAID'&&existing?.status!=='PAID'&&(!input.paidAt||Date.now()-new Date(input.paidAt).getTime()<15*60*1000)) await sendTenantPush(tenantId, {title:'Venda aprovada',body:`Pedido ${input.externalId} · ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(input.grossAmount-(input.discountAmount||0))}`,tag:`sale:${order.id}`,url:'/'}).catch(error=>console.error('Push sale failed',error));
 return order;
}
function mapAttribution(a:Record<string,any>){return{sessionId:a.sessionId,visitorId:a.visitorId,source:a.utm_source||a.source,medium:a.utm_medium||a.medium,campaign:a.utm_campaign||a.campaign,content:a.utm_content||a.content,term:a.utm_term||a.term,fbclid:a.fbclid,fbp:a._fbp||a.fbp,fbc:a._fbc||a.fbc,gclid:a.gclid,campaignId:a.campaign_id||a.campaignId,adsetId:a.adset_id||a.adsetId,adId:a.ad_id||a.adId,landingPage:a.landingPage,referrer:a.referrer,firstTouch:a.firstTouch,lastTouch:a.lastTouch}}
