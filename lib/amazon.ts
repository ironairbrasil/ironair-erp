import { db } from './db';
import { decryptSecret, encryptSecret } from './crypto-secrets';
import { ingestOrder, type IngestOrder } from './orders';
import { getTenantId } from './tenant';

const PROVIDER = 'Amazon';
const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const DEFAULT_MARKETPLACE_ID = 'A2Q3Y263D00KWC';
const DEFAULT_ENDPOINT = 'https://sellingpartnerapi-na.amazon.com';
const DEFAULT_AWS_REGION = 'us-east-1';

type AmazonToken = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

type AmazonConnection = {
  tenantId: string;
  integrationId: string;
  accessToken: string;
  refreshToken: string;
  marketplaceId: string;
  endpoint: string;
  awsRegion: string;
};

function env(name: string){
  return process.env[name]?.trim() || '';
}

function clientId(){
  return env('AMAZON_SPAPI_CLIENT_ID') || env('AMAZON_CLIENT_ID');
}

function clientSecret(){
  return env('AMAZON_SPAPI_CLIENT_SECRET') || env('AMAZON_CLIENT_SECRET');
}

function appId(){
  return env('AMAZON_SPAPI_APP_ID') || env('AMAZON_APP_ID');
}

function envRefreshToken(){
  return env('AMAZON_SPAPI_REFRESH_TOKEN') || env('AMAZON_REFRESH_TOKEN');
}

function marketplaceId(){
  return env('AMAZON_SPAPI_MARKETPLACE_ID') || env('AMAZON_MARKETPLACE_ID') || DEFAULT_MARKETPLACE_ID;
}

function endpoint(){
  return env('AMAZON_SPAPI_ENDPOINT') || DEFAULT_ENDPOINT;
}

function awsRegion(){
  return env('AMAZON_SPAPI_AWS_REGION') || env('AWS_REGION') || DEFAULT_AWS_REGION;
}

function tokenExpiresAt(expiresIn: unknown){
  const seconds = Number(expiresIn || 0);
  if(!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function postLwaRefresh(refreshToken: string): Promise<AmazonToken>{
  const id = clientId();
  const secret = clientSecret();
  if(!id || !secret) throw new Error('Credenciais Amazon SP-API ausentes no servidor');
  if(!refreshToken) throw new Error('AMAZON_SPAPI_REFRESH_TOKEN ausente no servidor');
  const r = await fetch(LWA_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: id,
      client_secret: secret
    }),
    cache: 'no-store'
  });
  const json = await r.json().catch(() => ({}));
  if(!r.ok || !json.access_token) throw new Error(json.error_description || json.error || 'amazon_lwa_refresh_failed');
  return json;
}

function amazonMetadata(token: AmazonToken, extra: Record<string, unknown> = {}){
  return {
    ...extra,
    appId: appId() || undefined,
    marketplaceId: marketplaceId(),
    region: env('AMAZON_SPAPI_REGION') || 'NA',
    endpoint: endpoint(),
    awsRegion: awsRegion(),
    tokenType: token.token_type,
    expiresAt: tokenExpiresAt(token.expires_in),
    refreshTokenAvailable: true,
    connectedVia: 'SELF_AUTHORIZATION',
    refreshedAt: new Date().toISOString()
  };
}

export async function connectAmazonFromEnv(tenantId?: string){
  const scopedTenantId = tenantId || await getTenantId();
  const refreshToken = envRefreshToken();
  const token = await postLwaRefresh(refreshToken);
  const integration = await db.integration.upsert({
    where: { tenantId_provider: { tenantId: scopedTenantId, provider: PROVIDER } },
    create: {
      tenantId: scopedTenantId,
      provider: PROVIDER,
      mode: 'OAUTH',
      status: 'CONNECTED',
      accessTokenEncrypted: encryptSecret(token.access_token),
      refreshTokenEncrypted: encryptSecret(token.refresh_token || refreshToken),
      scopes: 'sellingpartnerapi::migration',
      connectedAt: new Date(),
      metadata: amazonMetadata(token)
    },
    update: {
      mode: 'OAUTH',
      status: 'CONNECTED',
      accessTokenEncrypted: encryptSecret(token.access_token),
      refreshTokenEncrypted: encryptSecret(token.refresh_token || refreshToken),
      scopes: 'sellingpartnerapi::migration',
      connectedAt: new Date(),
      disconnectedAt: null,
      lastError: null,
      metadata: amazonMetadata(token)
    }
  });
  return integration;
}

export async function refreshAmazonConnection(integration: { id: string; tenantId: string; refreshTokenEncrypted: string | null; metadata: unknown }){
  if(!integration.refreshTokenEncrypted) throw new Error('Amazon sem refresh token');
  const refreshToken = decryptSecret(integration.refreshTokenEncrypted);
  const token = await postLwaRefresh(refreshToken);
  const updated = await db.integration.update({
    where: { id: integration.id },
    data: {
      accessTokenEncrypted: encryptSecret(token.access_token),
      refreshTokenEncrypted: encryptSecret(token.refresh_token || refreshToken),
      status: 'CONNECTED',
      lastError: null,
      metadata: amazonMetadata(token, (integration.metadata as Record<string, unknown>) || {})
    }
  });
  return updated;
}

export async function refreshAmazonTenant(tenantId?: string){
  const scopedTenantId = tenantId || await getTenantId();
  let integration = await db.integration.findUnique({ where: { tenantId_provider: { tenantId: scopedTenantId, provider: PROVIDER } } });
  if(!integration || !integration.refreshTokenEncrypted){
    if(envRefreshToken()) integration = await connectAmazonFromEnv(scopedTenantId);
    else throw new Error('Amazon não conectado');
  }
  const refreshed = await refreshAmazonConnection(integration);
  return {
    provider: PROVIDER,
    status: refreshed.status,
    expiresAt: (refreshed.metadata as any)?.expiresAt || null,
    refreshedAt: (refreshed.metadata as any)?.refreshedAt || null,
    refreshTokenAvailable: Boolean(refreshed.refreshTokenEncrypted)
  };
}

export async function getAmazonConnection(tenantId?: string): Promise<AmazonConnection>{
  const scopedTenantId = tenantId || await getTenantId();
  let integration = await db.integration.findUnique({ where: { tenantId_provider: { tenantId: scopedTenantId, provider: PROVIDER } } });
  if(!integration || integration.status !== 'CONNECTED' || !integration.accessTokenEncrypted){
    if(envRefreshToken()) integration = await connectAmazonFromEnv(scopedTenantId);
    else throw new Error('Amazon não conectado');
  }
  const expiresAt = (integration.metadata as any)?.expiresAt as string | undefined;
  if(integration.refreshTokenEncrypted && expiresAt && new Date(expiresAt).getTime() - Date.now() < 5 * 60 * 1000){
    integration = await refreshAmazonConnection(integration);
  }
  if(!integration.accessTokenEncrypted || !integration.refreshTokenEncrypted) throw new Error('Amazon sem tokens salvos');
  const metadata = (integration.metadata as any) || {};
  return {
    tenantId: scopedTenantId,
    integrationId: integration.id,
    accessToken: decryptSecret(integration.accessTokenEncrypted),
    refreshToken: decryptSecret(integration.refreshTokenEncrypted),
    marketplaceId: metadata.marketplaceId || marketplaceId(),
    endpoint: metadata.endpoint || endpoint(),
    awsRegion: metadata.awsRegion || awsRegion()
  };
}

function amzDate(date = new Date()){
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

async function amazonRequest<T = any>(path: string, options: { method?: string; query?: Record<string, string>; body?: unknown } = {}, tenantId?: string): Promise<T>{
  const conn = await getAmazonConnection(tenantId);
  const method = options.method || 'GET';
  const url = new URL(path, conn.endpoint);
  for(const [key, value] of Object.entries(options.query || {})){
    if(value) url.searchParams.set(key, value);
  }
  const body = options.body ? JSON.stringify(options.body) : '';
  const r = await fetch(url, {
    method,
    headers: {
      'x-amz-access-token': conn.accessToken,
      'x-amz-date': amzDate(),
      'user-agent': 'IronAirHub/1.0',
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    body: body || undefined,
    cache: 'no-store'
  });
  const json = await r.json().catch(() => ({}));
  if(!r.ok) throw new Error(json?.errors?.[0]?.message || json?.message || 'amazon_spapi_failed');
  return json as T;
}

function num(value: unknown){
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function payloadOf(value: any){
  return value?.payload || value;
}

function moneyAmount(value: any){
  return num(value?.Amount ?? value?.CurrencyAmount ?? value);
}

function mapAmazonStatus(order: any): IngestOrder['status']{
  const status = String(order?.OrderStatus || '').toLowerCase();
  if(status.includes('cancel')) return 'CANCELLED';
  if(status === 'pending') return 'PENDING';
  return 'PAID';
}

async function mapAmazonOrder(order: any, tenantId: string): Promise<IngestOrder>{
  const orderId = String(order.AmazonOrderId);
  let items: any[] = [];
  try{
    const itemPayload: any = await amazonRequest(`/orders/v0/orders/${encodeURIComponent(orderId)}/orderItems`, {}, tenantId);
    const payload = payloadOf(itemPayload);
    items = Array.isArray(payload?.OrderItems) ? payload.OrderItems : [];
  }catch{}
  const financials = await amazonOrderFinancials(orderId, tenantId);
  const amount = num(order?.OrderTotal?.Amount);
  const mappedItems = items.map(item => {
    const price = num(item?.ItemPrice?.Amount);
    const qty = Number(item?.QuantityOrdered || item?.QuantityShipped || 1);
    return {
      sku: String(item?.SellerSKU || item?.ASIN || `AMAZON-${orderId}`),
      name: String(item?.Title || `Pedido Amazon ${orderId}`),
      quantity: qty || 1,
      unitPrice: price && qty ? price / qty : amount,
      unitCost: 0
    };
  });
  return {
    tenantId,
    externalId: orderId,
    channel: 'AMAZON',
    status: mapAmazonStatus(order),
    currency: order?.OrderTotal?.CurrencyCode || 'BRL',
    grossAmount: amount,
    shippingAmount: financials.shippingAmount,
    feeAmount: financials.feeAmount,
    taxAmount: 0,
    paidAt: order.PurchaseDate,
    customer: {
      externalId: order.BuyerInfo?.BuyerEmail || undefined,
      name: order.BuyerInfo?.BuyerName || order.BuyerInfo?.BuyerCounty || order.ShippingAddress?.City || 'Cliente Amazon',
      city: order.ShippingAddress?.City,
      state: order.ShippingAddress?.StateOrRegion,
      zip: order.ShippingAddress?.PostalCode
    },
    items: mappedItems.length ? mappedItems : [{ sku: `AMAZON-${orderId}`, name: `Pedido Amazon ${orderId}`, quantity: 1, unitPrice: amount, unitCost: 0 }],
    attribution: { source: 'Amazon', medium: 'marketplace', campaign: 'Amazon' },
    skipInventory: true
  };
}

async function amazonOrderFinancials(orderId: string, tenantId: string){
  try{
    const response: any = await amazonRequest(`/finances/v0/orders/${encodeURIComponent(orderId)}/financialEvents`, {}, tenantId);
    const events = payloadOf(response)?.FinancialEvents || {};
    let feeAmount = 0;
    let shippingAmount = 0;
    const visitFee = (fee: any) => {
      const type = String(fee?.FeeType || '').toLowerCase();
      const amount = Math.abs(moneyAmount(fee?.FeeAmount));
      if(!amount) return;
      if(type.includes('shipping') || type.includes('ship') || type.includes('freight') || type.includes('delivery') || type.includes('easyship') || type.includes('postage')) shippingAmount += amount;
      else feeAmount += amount;
    };
    const visitCharge = (charge: any) => {
      const type = String(charge?.ChargeType || '').toLowerCase();
      const amount = Math.abs(moneyAmount(charge?.ChargeAmount));
      if(amount && (type.includes('shipping') || type.includes('freight') || type.includes('delivery'))) shippingAmount += amount;
    };
    const arrays = Object.values(events).flatMap((value: any) => Array.isArray(value) ? value : []);
    for(const event of arrays){
      for(const fee of event.FeeList || []) visitFee(fee);
      for(const item of [...(event.ShipmentItemList || []), ...(event.ShipmentItemAdjustmentList || [])]){
        for(const fee of item.ItemFeeList || []) visitFee(fee);
        for(const charge of item.ItemChargeList || []) visitCharge(charge);
      }
    }
    return { feeAmount, shippingAmount };
  }catch{
    return { feeAmount: 0, shippingAmount: 0 };
  }
}

export async function syncAmazonOrders(days = 365, tenantId?: string){
  const conn = await getAmazonConnection(tenantId);
  const createdAfter = new Date(Date.now() - Math.max(1, days) * 86400000).toISOString();
  let count = 0;
  let nextToken = '';
  do{
    const response: any = await amazonRequest('/orders/v0/orders', {
      query: nextToken ? { NextToken: nextToken } : {
        MarketplaceIds: conn.marketplaceId,
        CreatedAfter: createdAfter
      }
    }, conn.tenantId);
    const payload = payloadOf(response);
    const orders = Array.isArray(payload?.Orders) ? payload.Orders : [];
    for(const order of orders){
      await ingestOrder(await mapAmazonOrder(order, conn.tenantId));
      count++;
    }
    nextToken = payload?.NextToken || '';
  }while(nextToken && count < 1000);
  await db.integration.update({ where: { id: conn.integrationId }, data: { lastSyncAt: new Date(), lastError: null } });
  return count;
}

export async function amazonStatus(tenantId?: string){
  const scopedTenantId = tenantId || await getTenantId();
  const integration = await db.integration.findUnique({ where: { tenantId_provider: { tenantId: scopedTenantId, provider: PROVIDER } }, include: { webhooks: true } });
  const configured = Boolean(clientId() && clientSecret() && (envRefreshToken() || integration?.refreshTokenEncrypted));
  const connected = Boolean(integration?.status === 'CONNECTED' && integration?.accessTokenEncrypted && integration?.refreshTokenEncrypted);
  const metadata = (integration?.metadata as any) || {};
  return {
    provider: PROVIDER,
    status: connected ? 'CONNECTED' : 'DISCONNECTED',
    mode: integration?.mode || 'OAUTH',
    configured,
    marketplaceId: metadata.marketplaceId || marketplaceId(),
    appId: metadata.appId || appId() || null,
    endpoint: metadata.endpoint || endpoint(),
    expiresAt: connected ? metadata.expiresAt || null : null,
    refreshTokenAvailable: connected && Boolean(integration?.refreshTokenEncrypted),
    lastSyncAt: connected ? integration?.lastSyncAt || null : null,
    lastError: integration?.lastError || null,
    connectedAt: connected ? integration?.connectedAt || null : null,
    webhooks: integration?.webhooks.map(w => ({ topic: w.topic, status: w.status, callbackUrl: w.callbackUrl, lastRegisteredAt: w.lastRegisteredAt, lastError: w.lastError })) || []
  };
}

export { PROVIDER as AMAZON_PROVIDER };
