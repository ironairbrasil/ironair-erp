import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';

export async function GET(req:Request){
  const tenantId=await getTenantId(req);
  const integration=await db.integration.findUnique({where:{tenantId_provider:{tenantId,provider:'Shopify'}},include:{webhooks:true}});
  const devConfigured=Boolean(process.env.SHOPIFY_SHOP_DOMAIN&&process.env.SHOPIFY_ADMIN_ACCESS_TOKEN&&process.env.SHOPIFY_WEBHOOK_SECRET);
  return NextResponse.json({
    provider:'Shopify',
    status:integration?.status || (devConfigured?'CONNECTED':'DISCONNECTED'),
    mode:integration?.mode || (devConfigured?'DEV_MANUAL':'DEV_MANUAL'),
    shopDomain:integration?.shopDomain || process.env.SHOPIFY_SHOP_DOMAIN?.replace(/^https?:\/\//,'').replace(/\/$/,'') || null,
    lastSyncAt:integration?.lastSyncAt || null,
    lastError:integration?.lastError || null,
    connectedAt:integration?.connectedAt || null,
    devConfigured,
    webhooks:integration?.webhooks.map(w=>({topic:w.topic,status:w.status,callbackUrl:w.callbackUrl,lastRegisteredAt:w.lastRegisteredAt,lastError:w.lastError})) || []
  });
}
