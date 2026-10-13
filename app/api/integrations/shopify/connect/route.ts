import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getTenantId } from '@/lib/tenant';
import { isValidShopDomain, normalizeShopDomain, signState } from '@/lib/shopify-oauth';

export const runtime='nodejs';

export async function GET(req:Request){
  const clientId=process.env.SHOPIFY_CLIENT_ID;
  const appUrl=process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const shopParam=new URL(req.url).searchParams.get('shop') || '';
  const shop=normalizeShopDomain(shopParam);
  if(!clientId) return NextResponse.json({ok:false,error:'SHOPIFY_CLIENT_ID ausente no servidor'},{status:500});
  if(!isValidShopDomain(shop)) return NextResponse.json({ok:false,error:'Informe a loja no formato loja.myshopify.com'},{status:400});
  const tenantId=await getTenantId(req);
  const state=signState({tenantId,nonce:crypto.randomBytes(16).toString('hex'),createdAt:Date.now()});
  const scopes=process.env.SHOPIFY_SCOPES || 'read_orders,read_products,write_webhooks';
  const redirectUri=`${appUrl}/api/integrations/shopify/callback`;
  const url=new URL(`https://${shop}/admin/oauth/authorize`);
  url.searchParams.set('client_id',clientId);
  url.searchParams.set('scope',scopes);
  url.searchParams.set('redirect_uri',redirectUri);
  url.searchParams.set('state',state);
  return NextResponse.redirect(url);
}
