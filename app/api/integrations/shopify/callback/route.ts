import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { encryptSecret } from '@/lib/crypto-secrets';
import { registerShopifyWebhookSubscriptions, upsertPreparedShopifyWebhooks } from '@/lib/shopify';
import { isValidShopDomain, normalizeShopDomain, readSignedState } from '@/lib/shopify-oauth';

export const runtime='nodejs';

function validShopifyHmac(params:URLSearchParams){
  const secret=process.env.SHOPIFY_CLIENT_SECRET;
  const hmac=params.get('hmac');
  if(!secret||!hmac) return false;
  const message=[...params.entries()].filter(([k])=>k!=='hmac'&&k!=='signature').sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('&');
  const digest=crypto.createHmac('sha256',secret).update(message).digest('hex');
  try{return crypto.timingSafeEqual(Buffer.from(digest),Buffer.from(hmac));}catch{return false}
}

export async function GET(req:Request){
  try{
    const url=new URL(req.url);
    if(!validShopifyHmac(url.searchParams)) return NextResponse.json({ok:false,error:'hmac inválido'},{status:401});
    const clientId=process.env.SHOPIFY_CLIENT_ID;
    const clientSecret=process.env.SHOPIFY_CLIENT_SECRET;
    if(!clientId||!clientSecret) return NextResponse.json({ok:false,error:'Credenciais OAuth Shopify ausentes no servidor'},{status:500});
    const tenantId=readSignedState(url.searchParams.get('state')).tenantId;
    const shop=normalizeShopDomain(url.searchParams.get('shop')||'');
    const code=url.searchParams.get('code');
    if(!isValidShopDomain(shop)||!code) return NextResponse.json({ok:false,error:'callback inválido'},{status:400});
    const tokenRes=await fetch(`https://${shop}/admin/oauth/access_token`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_id:clientId,client_secret:clientSecret,code}),cache:'no-store'});
    const tokenJson=await tokenRes.json();
    if(!tokenRes.ok||!tokenJson.access_token) return NextResponse.json({ok:false,error:'Falha ao trocar code por token Shopify'},{status:500});
    const integration=await db.integration.upsert({
      where:{tenantId_provider:{tenantId,provider:'Shopify'}},
      create:{tenantId,provider:'Shopify',mode:'OAUTH',status:'CONNECTED',shopDomain:shop,accessTokenEncrypted:encryptSecret(tokenJson.access_token),webhookSecretEncrypted:encryptSecret(clientSecret),scopes:tokenJson.scope,connectedAt:new Date(),config:{hidden:false}},
      update:{mode:'OAUTH',status:'CONNECTED',shopDomain:shop,accessTokenEncrypted:encryptSecret(tokenJson.access_token),webhookSecretEncrypted:encryptSecret(clientSecret),scopes:tokenJson.scope,connectedAt:new Date(),disconnectedAt:null,lastError:null,config:{hidden:false}}
    });
    await upsertPreparedShopifyWebhooks(tenantId,integration.id,new URL(req.url).origin);
    await registerShopifyWebhookSubscriptions({tenantId,integrationId:integration.id,shopDomain:shop,accessToken:tokenJson.access_token,mode:'OAUTH'},new URL(req.url).origin);
    return NextResponse.redirect(new URL('/?integration=shopify-connected',req.url));
  }catch(e:any){
    return NextResponse.json({ok:false,error:e?.message||'shopify_callback_failed'},{status:400});
  }
}
