import crypto from 'crypto';
import { db } from './db';
import { decryptSecret } from './crypto-secrets';
import { ingestOrder, type IngestOrder } from './orders';
import { getTenantId } from './tenant';

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-10';
const DEV_SHOP = process.env.SHOPIFY_SHOP_DOMAIN?.replace(/^https?:\/\//,'').replace(/\/$/,'');
const DEV_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const SHOPIFY_WEBHOOK_TOPICS = ['orders/create','orders/paid','orders/updated','orders/cancelled','refunds/create','app/uninstalled'];
export const SHOPIFY_COMPLIANCE_TOPICS = ['customers/data_request','customers/redact','shop/redact'];

type ShopifyConnection = { tenantId:string; integrationId?:string; shopDomain:string; accessToken:string; webhookSecret?:string; mode:'OAUTH'|'DEV_MANUAL' };

function normalizeShop(shop:string){
  return shop.replace(/^https?:\/\//,'').replace(/\/$/,'').trim().toLowerCase();
}

function hmacSha256(rawBody:string, secret:string){
  return crypto.createHmac('sha256',secret).update(rawBody,'utf8').digest('base64');
}

export function verifyShopifyWebhook(rawBody:string, hmac:string|null, secret=process.env.SHOPIFY_WEBHOOK_SECRET){
  if(!secret||!hmac) return false;
  const digest=hmacSha256(rawBody,secret);
  try{return crypto.timingSafeEqual(Buffer.from(digest),Buffer.from(hmac));}catch{return false}
}

export async function getShopifyConnection(tenantId?:string):Promise<ShopifyConnection>{
  const scopedTenantId=tenantId||await getTenantId();
  const integration=await db.integration.findUnique({where:{tenantId_provider:{tenantId:scopedTenantId,provider:'Shopify'}}});
  if(integration?.status==='CONNECTED'&&integration.shopDomain&&integration.accessTokenEncrypted){
    return {
      tenantId:scopedTenantId,
      integrationId:integration.id,
      shopDomain:normalizeShop(integration.shopDomain),
      accessToken:decryptSecret(integration.accessTokenEncrypted),
      webhookSecret:integration.webhookSecretEncrypted?decryptSecret(integration.webhookSecretEncrypted):undefined,
      mode:'OAUTH'
    };
  }
  if(DEV_SHOP&&DEV_TOKEN){
    return {tenantId:scopedTenantId,shopDomain:normalizeShop(DEV_SHOP),accessToken:DEV_TOKEN,webhookSecret:process.env.SHOPIFY_WEBHOOK_SECRET,mode:'DEV_MANUAL'};
  }
  throw new Error('Shopify not configured');
}

export async function getWebhookShopifyConnection(rawBody:string, hmac:string|null, shopDomain:string|null){
  const normalized=shopDomain?normalizeShop(shopDomain):null;
  if(normalized){
    const integration=await db.integration.findFirst({where:{provider:'Shopify',shopDomain:normalized,status:'CONNECTED'}});
    if(integration?.webhookSecretEncrypted&&verifyShopifyWebhook(rawBody,hmac,decryptSecret(integration.webhookSecretEncrypted))){
      return getShopifyConnection(integration.tenantId);
    }
  }
  const devTenantId=await getTenantId();
  if(verifyShopifyWebhook(rawBody,hmac,process.env.SHOPIFY_WEBHOOK_SECRET)) return getShopifyConnection(devTenantId);
  return null;
}

export async function shopifyGraphQL<T=any>(query:string, variables:Record<string,any>={}, connection?:ShopifyConnection){
  const conn=connection||await getShopifyConnection();
  const r=await fetch(`https://${conn.shopDomain}/admin/api/${API_VERSION}/graphql.json`,{method:'POST',headers:{'content-type':'application/json','x-shopify-access-token':conn.accessToken},body:JSON.stringify({query,variables}),cache:'no-store'});
  const json=await r.json();
  if(!r.ok||json.errors) throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors||json)}`);
  return json.data as T;
}

function attrs(list:any[]|undefined){return Object.fromEntries((list||[]).filter(x=>x?.name||x?.key).map(x=>[x.name||x.key,x.value]));}
function num(v:any){const n=Number(v??0);return Number.isFinite(n)?n:0}
function orderStatus(o:any):IngestOrder['status']{
  const financial=String(o.financial_status||o.displayFinancialStatus||'').toUpperCase();
  const cancelled=!!(o.cancelled_at||o.cancelledAt);
  if(financial.includes('REFUND')) return 'REFUNDED';
  if(cancelled) return 'CANCELLED';
  if(['PAID','PARTIALLY_PAID'].includes(financial)) return 'PAID';
  return 'PENDING';
}
function lineItems(o:any){
  const raw=o.line_items || o.lineItems?.nodes || [];
  const inferSku=(i:any)=>{
    const text=String(`${i.sku||''} ${i.variant?.sku||''} ${i.name||''} ${i.title||''} ${i.variant?.title||''}`).toUpperCase();
    if(text.includes('220V')||text.includes('220 V')) return 'IRON-AIR-220V';
    if(text.includes('127V')||text.includes('127 V')||text.includes('110V')||text.includes('110 V')) return 'IRON-AIR-127V';
    return String(i.sku||i.variant?.sku||`shopify-line-${i.id}`);
  };
  return raw.map((i:any)=>({
    sku:inferSku(i),
    name:String(i.name||i.title||'Item'),
    quantity:Number(i.quantity||1),
    unitPrice:num(i.price ?? i.originalUnitPriceSet?.shopMoney?.amount ?? i.discountedUnitPriceSet?.shopMoney?.amount)
  }));
}

export function mapShopifyOrder(o:any, tenantId?:string):IngestOrder{
  const a=attrs(o.note_attributes||o.customAttributes);
  const total=num(o.total_price ?? o.currentTotalPriceSet?.shopMoney?.amount);
  const discount=num(o.total_discounts ?? o.totalDiscountsSet?.shopMoney?.amount);
  const shipping=num(o.total_shipping_price_set?.shop_money?.amount ?? o.totalShippingPriceSet?.shopMoney?.amount);
  const customer=o.customer||{};
  const address=o.shipping_address||o.shippingAddress||o.billing_address||o.billingAddress||{};
  return {
    tenantId,
    externalId:String(o.id),
    channel:'SHOPIFY',
    status:orderStatus(o),
    currency:o.currency||o.currencyCode||'BRL',
    grossAmount:Math.max(0,total),
    discountAmount:discount,
    shippingAmount:shipping,
    feeAmount:0,
    taxAmount:num(o.total_tax ?? o.totalTaxSet?.shopMoney?.amount),
    paymentMethod:(o.payment_gateway_names||o.paymentGatewayNames||[]).join(', ')||undefined,
    paidAt:o.processed_at||o.processedAt||o.created_at||o.createdAt,
    customer:{externalId:customer.id?String(customer.id):undefined,name:[customer.first_name||customer.firstName,customer.last_name||customer.lastName].filter(Boolean).join(' ')||address.name||undefined,city:address.city,state:address.province_code||address.province,zip:address.zip},
    items:lineItems(o),
    attribution:{
      utm_source:a.utm_source,utm_medium:a.utm_medium,utm_campaign:a.utm_campaign,utm_content:a.utm_content,utm_term:a.utm_term,
      fbclid:a.fbclid,_fbp:a._fbp||a.fbp,_fbc:a._fbc||a.fbc,gclid:a.gclid,
      campaign_id:a.campaign_id||a.campaignId,adset_id:a.adset_id||a.adsetId,ad_id:a.ad_id||a.adId,
      sessionId:a.sessionId||a.session_id,visitorId:a.visitorId||a.visitor_id,
      landingPage:o.landing_site||o.customerJourneySummary?.firstVisit?.landingPage,referrer:o.referring_site||o.customerJourneySummary?.firstVisit?.referralInfoHtml,
      firstTouch:a.firstTouch,lastTouch:a.lastTouch, externalReference:a.externalReference||a.external_reference
    }
  };
}

export async function processShopifyOrder(o:any, tenantId?:string){return ingestOrder(mapShopifyOrder(o,tenantId));}

export async function registerWebhookReceipt(input:{tenantId:string;integrationId?:string;webhookId:string;topic:string;shopDomain?:string|null,payload:any}){
  try{return await db.webhookEvent.create({data:{tenantId:input.tenantId,integrationId:input.integrationId,provider:'SHOPIFY',eventId:input.webhookId,topic:input.topic,shopDomain:input.shopDomain||null,payload:input.payload,status:'PROCESSING'}})}
  catch(e:any){if(e?.code==='P2002') return null; throw e}
}
export async function finishWebhook(id:string,status:'PROCESSED'|'FAILED',error?:string){await db.webhookEvent.update({where:{id},data:{status,processedAt:new Date(),error:error?.slice(0,1000)}})}

export async function handleShopifyComplianceWebhook(topic:string, payload:any, tenantId:string){
  if(topic==='customers/redact'){
    const customerId=payload?.customer?.id ? `SHOPIFY:${payload.customer.id}` : undefined;
    if(customerId) await db.customer.updateMany({where:{tenantId,sourceKey:customerId},data:{name:null,city:null,state:null,zip:null,externalId:null,emailHash:null,phoneHash:null}});
  }
  if(topic==='shop/redact'){
    await db.integration.updateMany({where:{tenantId,provider:'Shopify'},data:{status:'DISCONNECTED',disconnectedAt:new Date(),accessTokenEncrypted:null,refreshTokenEncrypted:null,webhookSecretEncrypted:null}});
  }
  return {ok:true};
}

export async function upsertPreparedShopifyWebhooks(tenantId:string,integrationId:string,origin:string){
  await Promise.all(SHOPIFY_WEBHOOK_TOPICS.map(topic=>db.integrationWebhook.upsert({
    where:{integrationId_topic:{integrationId,topic}},
    create:{tenantId,integrationId,provider:'Shopify',topic,callbackUrl:`${origin}/api/webhooks/shopify`,status:'PENDING'},
    update:{callbackUrl:`${origin}/api/webhooks/shopify`}
  })));
}

export async function registerShopifyWebhookSubscriptions(connection:ShopifyConnection, origin:string){
  if(!connection.integrationId) return;
  const address=`${origin}/api/webhooks/shopify`;
  for(const topic of SHOPIFY_WEBHOOK_TOPICS){
    const row=await db.integrationWebhook.upsert({
      where:{integrationId_topic:{integrationId:connection.integrationId,topic}},
      create:{tenantId:connection.tenantId,integrationId:connection.integrationId,provider:'Shopify',topic,callbackUrl:address,status:'PENDING'},
      update:{callbackUrl:address,status:'PENDING',lastError:null}
    });
    try{
      const r=await fetch(`https://${connection.shopDomain}/admin/api/${API_VERSION}/webhooks.json`,{
        method:'POST',
        headers:{'content-type':'application/json','x-shopify-access-token':connection.accessToken},
        body:JSON.stringify({webhook:{topic,address,format:'json'}}),
        cache:'no-store'
      });
      const json=await r.json().catch(()=>({}));
      await db.integrationWebhook.update({
        where:{id:row.id},
        data:{status:r.ok?'ACTIVE':'ERROR',externalWebhookId:json?.webhook?.id?String(json.webhook.id):row.externalWebhookId,lastRegisteredAt:r.ok?new Date():row.lastRegisteredAt,lastError:r.ok?null:JSON.stringify(json).slice(0,1000)}
      });
    }catch(e:any){
      await db.integrationWebhook.update({where:{id:row.id},data:{status:'ERROR',lastError:(e?.message||'webhook_registration_failed').slice(0,1000)}});
    }
  }
}

export async function syncShopifyProducts(tenantId?:string){
  const conn=await getShopifyConnection(tenantId);
  let cursor:string|null=null,count=0;
  do{
    const data:any=await shopifyGraphQL(`query($after:String){products(first:50,after:$after){pageInfo{hasNextPage endCursor}nodes{id title status variants(first:100){nodes{id title sku barcode price inventoryQuantity}}}}}`,{after:cursor},conn);
    for(const p of data.products.nodes){
      const product=await db.product.upsert({where:{tenantId_shopifyId:{tenantId:conn.tenantId,shopifyId:p.id}},create:{tenantId:conn.tenantId,shopifyId:p.id,name:p.title,active:p.status==='ACTIVE'},update:{name:p.title,active:p.status==='ACTIVE'}});
      for(const v of p.variants.nodes){
        if(!v.sku)continue;
        await db.productVariant.upsert({
          where:{tenantId_sku:{tenantId:conn.tenantId,sku:v.sku}},
          create:{tenantId:conn.tenantId,productId:product.id,shopifyId:v.id,sku:v.sku,name:v.title,barcode:v.barcode,salePrice:num(v.price),unitCost:0,active:true},
          update:{productId:product.id,shopifyId:v.id,name:v.title,barcode:v.barcode,salePrice:num(v.price),active:true}
        });
        count++;
      }
    }
    cursor=data.products.pageInfo.hasNextPage?data.products.pageInfo.endCursor:null;
  }while(cursor);
  if(conn.integrationId) await db.integration.update({where:{id:conn.integrationId},data:{lastSyncAt:new Date(),lastError:null}});
  return count;
}

export async function syncShopifyOrders(days=90, tenantId?:string){
  const conn=await getShopifyConnection(tenantId);
  let cursor:string|null=null,count=0; const since=new Date(Date.now()-days*86400000).toISOString();
  do{
    const data:any=await shopifyGraphQL(`query($after:String,$q:String!){orders(first:50,after:$after,query:$q,sortKey:CREATED_AT){pageInfo{hasNextPage endCursor}nodes{id name createdAt processedAt cancelledAt currencyCode displayFinancialStatus totalDiscountsSet{shopMoney{amount}} totalTaxSet{shopMoney{amount}} totalShippingPriceSet{shopMoney{amount}} currentTotalPriceSet{shopMoney{amount}} paymentGatewayNames customAttributes{key value} customer{id firstName lastName} shippingAddress{name city province provinceCode zip} lineItems(first:100){nodes{id name sku quantity originalUnitPriceSet{shopMoney{amount}}}}}}}`,{after:cursor,q:`created_at:>=${since}`},conn);
    for(const o of data.orders.nodes){await processShopifyOrder(o,conn.tenantId);count++}
    cursor=data.orders.pageInfo.hasNextPage?data.orders.pageInfo.endCursor:null;
  }while(cursor);
  if(conn.integrationId) await db.integration.update({where:{id:conn.integrationId},data:{lastSyncAt:new Date(),lastError:null}});
  return count;
}
