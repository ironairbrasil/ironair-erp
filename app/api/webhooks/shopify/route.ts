import { NextResponse } from 'next/server';
import { finishWebhook, getWebhookShopifyConnection, handleShopifyComplianceWebhook, processShopifyOrder, registerWebhookReceipt } from '@/lib/shopify';
export const runtime='nodejs';
export async function POST(req:Request){
 const raw=await req.text(); const hmac=req.headers.get('x-shopify-hmac-sha256');
 const topic=(req.headers.get('x-shopify-topic')||'').toLowerCase(); const webhookId=req.headers.get('x-shopify-webhook-id')||''; const shop=req.headers.get('x-shopify-shop-domain');
 const conn=await getWebhookShopifyConnection(raw,hmac,shop);
 if(!conn) return NextResponse.json({ok:false,error:'invalid_hmac'},{status:401});
 if(!webhookId)return NextResponse.json({ok:false,error:'missing_webhook_id'},{status:400});
 let payload:any;try{payload=JSON.parse(raw)}catch{return NextResponse.json({ok:false,error:'invalid_json'},{status:400})}
 const receipt=await registerWebhookReceipt({tenantId:conn.tenantId,integrationId:conn.integrationId,webhookId,topic,shopDomain:shop,payload}); if(!receipt)return NextResponse.json({ok:true,duplicate:true});
 try{
   if(topic.startsWith('orders/')) await processShopifyOrder(payload,conn.tenantId);
   else if(topic==='refunds/create') { /* order update is the canonical financial-state sync; never auto-restock from refund alone */ }
   else if(topic==='app/uninstalled') await handleShopifyComplianceWebhook('shop/redact',payload,conn.tenantId);
   else if(['customers/data_request','customers/redact','shop/redact'].includes(topic)) await handleShopifyComplianceWebhook(topic,payload,conn.tenantId);
   await finishWebhook(receipt.id,'PROCESSED'); return NextResponse.json({ok:true});
 }catch(e:any){await finishWebhook(receipt.id,'FAILED',e?.message||'error');return NextResponse.json({ok:false,error:'processing_failed'},{status:500})}
}
