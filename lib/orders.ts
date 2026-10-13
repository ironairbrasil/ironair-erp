import { db } from './db';
import { moveStock } from './inventory';
import { getTenantId } from './tenant';
import type { Channel } from '@prisma/client';
export type IngestOrder={tenantId?:string;externalId:string;channel:Channel;status:'PENDING'|'PAID'|'CANCELLED'|'REFUNDED'|'CHARGEBACK';currency?:string;grossAmount:number;discountAmount?:number;shippingAmount?:number;feeAmount?:number;taxAmount?:number;paymentMethod?:string;paidAt?:string;customer?:{externalId?:string;name?:string;emailHash?:string;phoneHash?:string;city?:string;state?:string;zip?:string};items:Array<{sku:string;name:string;quantity:number;unitPrice:number;unitCost?:number}>;attribution?:Record<string,any>;skipInventory?:boolean};
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
export async function ingestOrder(input:IngestOrder){
 const tenantId=input.tenantId||await getTenantId();
 const existing=await db.order.findUnique({where:{tenantId_channel_externalId:{tenantId,channel:input.channel,externalId:input.externalId}},include:{items:true}});
 let customerId=existing?.customerId||undefined;
 if(input.customer){const key=input.customer.externalId?`${input.channel}:${input.customer.externalId}`:undefined;const data=cleanCustomerUpdate(input.customer);const customer=key?await db.customer.upsert({where:{tenantId_sourceKey:{tenantId,sourceKey:key}},create:{...data,tenantId,sourceKey:key},update:data}):await db.customer.create({data:{...data,tenantId}});customerId=customer.id}
 const prepared=await Promise.all(input.items.map(async i=>{const sku=canonicalSku(i.sku);const v=await db.productVariant.findUnique({where:{tenantId_sku:{tenantId,sku}}});return{tenantId,variantId:v?.id,sku:v?.sku||i.sku,name:i.name,quantity:i.quantity,unitPrice:i.unitPrice,unitCost:i.unitCost??Number(v?.unitCost||0)}}));
 const order=await db.$transaction(async tx=>{
   const base={status:input.status,grossAmount:input.grossAmount,discountAmount:input.discountAmount||0,shippingAmount:input.shippingAmount||0,feeAmount:input.feeAmount||0,taxAmount:input.taxAmount||0,paymentMethod:input.paymentMethod,paidAt:input.paidAt?new Date(input.paidAt):undefined,customerId};
   if(!existing)return tx.order.create({data:{tenantId,externalId:input.externalId,channel:input.channel,currency:input.currency||'BRL',...base,items:{create:prepared}}});
   await tx.orderItem.deleteMany({where:{orderId:existing.id}});
   return tx.order.update({where:{id:existing.id},data:{...base,currency:input.currency||existing.currency,items:{create:prepared}}});
 });
 if(input.attribution) await db.attribution.upsert({where:{orderId:order.id},create:{tenantId,orderId:order.id,...mapAttribution(input.attribution)},update:mapAttribution(input.attribution)});
 // Inventory is deducted exactly once on the first transition into PAID. Refunds do NOT auto-restock: physical returns require an explicit RETURN movement.
 if(!input.skipInventory&&input.status==='PAID'&&existing?.status!=='PAID') for(const item of prepared.filter(i=>i.variantId)) await moveStock({tenantId,sku:item.sku,warehouseCode:'CENTRAL',quantity:-Math.abs(item.quantity),type:'SALE',reference:input.externalId,orderId:order.id,idempotencyKey:`sale:${input.channel}:${input.externalId}:${item.sku}`});
 return order;
}
function mapAttribution(a:Record<string,any>){return{sessionId:a.sessionId,visitorId:a.visitorId,source:a.utm_source||a.source,medium:a.utm_medium||a.medium,campaign:a.utm_campaign||a.campaign,content:a.utm_content||a.content,term:a.utm_term||a.term,fbclid:a.fbclid,fbp:a._fbp||a.fbp,fbc:a._fbc||a.fbc,gclid:a.gclid,campaignId:a.campaign_id||a.campaignId,adsetId:a.adset_id||a.adsetId,adId:a.ad_id||a.adId,landingPage:a.landingPage,referrer:a.referrer,firstTouch:a.firstTouch,lastTouch:a.lastTouch}}
