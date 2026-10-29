import { db } from './db';
import { moveStocks } from './inventory';
import { publishAvailableStock } from './inventory-publish';
import { getTenantId } from './tenant';
import type { Channel } from '@prisma/client';
import { sendTenantPush } from './push';
import { paidOrderStockDeltas } from './order-stock';
import { shouldNotifyPaidOrder } from './order-notification';
export type IngestOrder={tenantId?:string;externalId:string;displayId?:string;channel:Channel;status:'PENDING'|'PAID'|'CANCELLED'|'REFUNDED'|'CHARGEBACK';currency?:string;grossAmount:number;discountAmount?:number;shippingAmount?:number;feeAmount?:number;taxAmount?:number;paymentMethod?:string|null;paidAt?:string;customer?:{externalId?:string;name?:string;emailHash?:string;phoneHash?:string;city?:string;state?:string;zip?:string};items:Array<{sku:string;name:string;quantity:number;unitPrice:number;unitCost?:number}>;attribution?:Record<string,any>;skipInventory?:boolean;warehouseCode?:string;fulfillmentOrigin?:'AMAZON_FBA'|'ML_FULL';returnInfo?:{status:string;refundAmount?:number|null;observedAt?:string}};
export function canonicalSku(sku:string){
 return String(sku||'').trim();
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
 const orderOverrides=overrideFields(existing?.manualOverrides);
 let customerId=existing?.customerId||undefined;
 if(input.customer){const key=input.customer.externalId?`${input.channel}:${input.customer.externalId}`:undefined;const data=cleanCustomerUpdate(input.customer);if(key){const current=await db.customer.findUnique({where:{tenantId_sourceKey:{tenantId,sourceKey:key}}});if(current){const customerOverrides=overrideFields(current.manualOverrides);const update=Object.fromEntries(Object.entries(data).filter(([k,v])=>v&&!(current as any)[k]&&!customerOverrides.has(k)));const customer=Object.keys(update).length?await db.customer.update({where:{id:current.id},data:update}):current;customerId=customer.id}else{const customer=await db.customer.create({data:{...data,tenantId,sourceKey:key}});customerId=customer.id}}else if(!existing?.customerId){const customer=await db.customer.create({data:{...data,tenantId}});customerId=customer.id}}
 const prepared=await Promise.all(input.items.map(async i=>{const sku=canonicalSku(i.sku);const v=await db.productVariant.findUnique({where:{tenantId_sku:{tenantId,sku}}});return{tenantId,variantId:v?.id,sku,name:String(i.name||v?.name||sku),quantity:i.quantity,unitPrice:i.unitPrice,unitCost:i.unitCost??Number(v?.unitCost||0)}}));
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
 if(input.attribution) {
  const attribution=mapAttribution(input.attribution);
  await db.attribution.upsert({where:{orderId:order.id},create:{tenantId,orderId:order.id,...attribution},update:attribution});
  if(input.status==='PAID'&&attribution.sessionId) await db.trackingEvent.upsert({where:{tenantId_eventId:{tenantId,eventId:`purchase:${order.id}`}},create:{tenantId,eventId:`purchase:${order.id}`,type:'PURCHASE',occurredAt:order.paidAt||order.createdAt,orderId:order.id,sessionId:attribution.sessionId,visitorId:attribution.visitorId,url:attribution.landingPage,referrer:attribution.referrer,utmSource:attribution.source,utmMedium:attribution.medium,utmCampaign:attribution.campaign,utmContent:attribution.content,utmTerm:attribution.term,fbclid:attribution.fbclid,fbp:attribution.fbp,fbc:attribution.fbc,gclid:attribution.gclid,campaignId:attribution.campaignId,adsetId:attribution.adsetId,adId:attribution.adId,value:Math.max(0,input.grossAmount-(input.discountAmount||0)),currency:input.currency||'BRL'},update:{orderId:order.id,sessionId:attribution.sessionId,visitorId:attribution.visitorId}});
 }
 // Apply the first sale or the exact item delta of an already-paid order as one atomic stock batch.
 if(!input.skipInventory&&input.status==='PAID') {
  const changedSkus=new Set<string>();
  const changes=paidOrderStockDeltas(existing?.status==='PAID'?existing.items:[],prepared);
  await moveStocks(changes.map(change=>({tenantId,sku:change.sku,warehouseCode:input.warehouseCode||'CENTRAL',quantity:-change.delta,type:'SALE' as const,reference:input.externalId,orderId:order.id,createdAt:order.paidAt||order.createdAt,idempotencyKey:`sale:${input.channel}:${input.externalId}:${change.sku}:${change.previous}:${change.current}`})));
  for(const change of changes)changedSkus.add(change.sku);
  for(const sku of changedSkus) await publishAvailableStock(tenantId,sku).catch(error=>console.error(`Inventory publish failed for ${sku}`,error));
 }
 if(input.status==='PAID'&&shouldNotifyPaidOrder({previousStatus:existing?.status,paidAt:input.paidAt})) {
  const amount=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(input.grossAmount-(input.discountAmount||0));
  const paidAt=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(order.paidAt||order.createdAt);
  await sendTenantPush(tenantId,{title:`Venda aprovada · ${amount}`,body:`${input.customer?.name||`Pedido ${input.externalId}`} · ${paidAt}`,tag:`sale:${order.id}`,url:'/'}).catch(error=>console.error('Push sale failed',error));
 }
 return order;
}
function mapAttribution(a:Record<string,any>){return{sessionId:a.sessionId,visitorId:a.visitorId,source:a.utm_source||a.source,medium:a.utm_medium||a.medium,campaign:a.utm_campaign||a.campaign,content:a.utm_content||a.content,term:a.utm_term||a.term,fbclid:a.fbclid,fbp:a._fbp||a.fbp,fbc:a._fbc||a.fbc,gclid:a.gclid,campaignId:a.campaign_id||a.campaignId,adsetId:a.adset_id||a.adsetId,adId:a.ad_id||a.adId,landingPage:a.landingPage,referrer:a.referrer,firstTouch:a.firstTouch,lastTouch:a.lastTouch}}
