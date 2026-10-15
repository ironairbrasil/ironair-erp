import crypto from 'crypto';
import { db } from './db';
import { decryptSecret, encryptSecret } from './crypto-secrets';
import { ingestOrder, type IngestOrder } from './orders';
import { getTenantId } from './tenant';

const PROVIDER = 'Mercado Livre';
const WEBHOOK_PROVIDER = 'MERCADO_LIVRE';
const AUTH_URL = 'https://auth.mercadolivre.com.br/authorization';
const TOKEN_URL = 'https://api.mercadolibre.com/oauth/token';
const API_URL = 'https://api.mercadolibre.com';
const WEBHOOK_TOPICS = ['notifications', 'orders'];

type MercadoLivreConnection = {
  tenantId: string;
  integrationId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt?: string;
  externalAccountId?: string | null;
};

type SignedState = { tenantId: string; nonce: string; createdAt: number };

function clientId(){
  return process.env.MERCADO_LIVRE_CLIENT_ID || process.env.ML_CLIENT_ID || '';
}

function clientSecret(){
  return process.env.MERCADO_LIVRE_CLIENT_SECRET || process.env.ML_CLIENT_SECRET || '';
}

function stateSecret(){
  return clientSecret() || process.env.SECRET_ENCRYPTION_KEY || '';
}

function hmac(value: string){
  const secret = stateSecret();
  if(!secret) throw new Error('MERCADO_LIVRE_CLIENT_SECRET ausente no servidor');
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function encodeState(payload: SignedState){
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function signMercadoLivreState(payload: SignedState){
  const body = encodeState(payload);
  return `${body}.${hmac(body)}`;
}

export function readMercadoLivreState(value: string | null){
  if(!value) throw new Error('state ausente');
  const [body, sig] = value.split('.');
  if(!body || !sig || hmac(body) !== sig) throw new Error('state inválido');
  const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SignedState;
  if(!parsed.tenantId || Date.now() - parsed.createdAt > 15 * 60 * 1000) throw new Error('state expirado');
  return parsed;
}

export function getMercadoLivreRedirectUri(req: Request){
  return process.env.MERCADO_LIVRE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin}/api/integrations/mercadolivre/callback`;
}

function tokenExpiresAt(expiresIn: unknown){
  const seconds = Number(expiresIn || 0);
  if(!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function postToken(body: Record<string, string>){
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    cache: 'no-store'
  });
  const json = await r.json().catch(() => ({}));
  if(!r.ok || !json.access_token) throw new Error(json.message || json.error_description || json.error || 'mercado_livre_token_failed');
  return json;
}

export async function exchangeMercadoLivreCode(code: string, redirectUri: string){
  const id = clientId();
  const secret = clientSecret();
  if(!id || !secret) throw new Error('Credenciais OAuth Mercado Livre ausentes no servidor');
  return postToken({ grant_type: 'authorization_code', client_id: id, client_secret: secret, code, redirect_uri: redirectUri });
}

export async function refreshMercadoLivreConnection(integration: { id: string; tenantId: string; refreshTokenEncrypted: string | null; metadata: unknown }){
  if(!integration.refreshTokenEncrypted) throw new Error('Mercado Livre sem refresh token');
  const id = clientId();
  const secret = clientSecret();
  if(!id || !secret) throw new Error('Credenciais OAuth Mercado Livre ausentes no servidor');
  const token = await postToken({
    grant_type: 'refresh_token',
    client_id: id,
    client_secret: secret,
    refresh_token: decryptSecret(integration.refreshTokenEncrypted)
  });
  const metadata = { ...((integration.metadata as Record<string, unknown>) || {}), expiresAt: tokenExpiresAt(token.expires_in), tokenType: token.token_type, refreshTokenAvailable: true, refreshedAt: new Date().toISOString() };
  const updated = await db.integration.update({
    where: { id: integration.id },
    data: {
      accessTokenEncrypted: encryptSecret(token.access_token),
      refreshTokenEncrypted: encryptSecret(token.refresh_token || decryptSecret(integration.refreshTokenEncrypted)),
      scopes: token.scope || undefined,
      metadata,
      status: 'CONNECTED',
      lastError: null
    }
  });
  return updated;
}

export async function refreshMercadoLivreTenant(tenantId?: string){
  const scopedTenantId = tenantId || await getTenantId();
  const integration = await db.integration.findUnique({ where: { tenantId_provider: { tenantId: scopedTenantId, provider: PROVIDER } } });
  if(!integration || integration.status !== 'CONNECTED') throw new Error('Mercado Livre não conectado');
  if(!integration.refreshTokenEncrypted){
    await db.integration.update({ where: { id: integration.id }, data: { lastError: 'Refresh token ausente. Reconecte Mercado Livre uma vez para autorizar offline_access.' } });
    throw new Error('Mercado Livre sem refresh token; reconecte uma vez para ativar renovação automática');
  }
  const refreshed = await refreshMercadoLivreConnection(integration);
  return {
    provider: PROVIDER,
    status: refreshed.status,
    expiresAt: (refreshed.metadata as any)?.expiresAt || null,
    refreshedAt: (refreshed.metadata as any)?.refreshedAt || null,
    refreshTokenAvailable: Boolean(refreshed.refreshTokenEncrypted)
  };
}

export async function getMercadoLivreConnection(tenantId?: string): Promise<MercadoLivreConnection>{
  const scopedTenantId = tenantId || await getTenantId();
  let integration = await db.integration.findUnique({ where: { tenantId_provider: { tenantId: scopedTenantId, provider: PROVIDER } } });
  if(!integration || integration.status !== 'CONNECTED' || !integration.accessTokenEncrypted){
    throw new Error('Mercado Livre não conectado');
  }
  const expiresAt = (integration.metadata as any)?.expiresAt as string | undefined;
  if(integration.refreshTokenEncrypted && expiresAt && new Date(expiresAt).getTime() - Date.now() < 5 * 60 * 1000){
    integration = await refreshMercadoLivreConnection(integration);
  }
  if(!integration.accessTokenEncrypted) throw new Error('Mercado Livre sem access token OAuth');
  return {
    tenantId: scopedTenantId,
    integrationId: integration.id,
    accessToken: decryptSecret(integration.accessTokenEncrypted),
    refreshToken: integration.refreshTokenEncrypted ? decryptSecret(integration.refreshTokenEncrypted) : '',
    expiresAt: (integration.metadata as any)?.expiresAt,
    externalAccountId: integration.externalAccountId
  };
}

export async function mercadoLivreApi<T = any>(path: string, init: RequestInit = {}, tenantId?: string): Promise<T>{
  const conn = await getMercadoLivreConnection(tenantId);
  const url = path.startsWith('http') ? path : `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const request = async (token: string) => fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), authorization: `Bearer ${token}` },
    cache: 'no-store'
  });
  let r = await request(conn.accessToken);
  if(r.status === 401){
    if(!conn.refreshToken){
      await db.integration.update({ where: { id: conn.integrationId }, data: { lastError: 'Access token expirado e refresh token indisponível. Reconecte Mercado Livre uma vez para autorizar offline_access.' } });
      throw new Error('Mercado Livre access token expirado e refresh token indisponível; reconecte a conta');
    }
    const refreshed = await refreshMercadoLivreConnection({ id: conn.integrationId, tenantId: conn.tenantId, refreshTokenEncrypted: encryptSecret(conn.refreshToken), metadata: { expiresAt: conn.expiresAt } });
    r = await request(decryptSecret(refreshed.accessTokenEncrypted!));
  }
  const json = await r.json().catch(() => ({}));
  if(!r.ok) throw new Error(json.message || json.error || 'mercado_livre_api_failed');
  return json as T;
}

export async function upsertMercadoLivreWebhooks(tenantId: string, integrationId: string, origin: string){
  const callbackUrl = `${origin}/api/webhooks/mercadolivre`;
  await Promise.all(WEBHOOK_TOPICS.map(topic => db.integrationWebhook.upsert({
    where: { integrationId_topic: { integrationId, topic } },
    create: { tenantId, integrationId, provider: PROVIDER, topic, callbackUrl, status: 'ACTIVE', lastRegisteredAt: new Date() },
    update: { callbackUrl, status: 'ACTIVE', lastRegisteredAt: new Date(), lastError: null }
  })));
}

function payloadHash(payload: unknown){
  return crypto.createHash('sha256').update(JSON.stringify(payload || {})).digest('hex');
}

export function mercadoLivreEventId(payload: any, fallback?: string | null){
  const parts = [payload?._id, payload?.id, payload?.resource, payload?.topic, payload?.user_id, payload?.application_id, payload?.sent].filter(Boolean);
  return String(fallback || parts.join(':') || crypto.createHash('sha256').update(JSON.stringify(payload || {})).digest('hex'));
}

export async function findMercadoLivreTenant(payload: any){
  const userId = payload?.user_id ? String(payload.user_id) : null;
  if(userId){
    const integration = await db.integration.findFirst({ where: { provider: PROVIDER, status: 'CONNECTED', externalAccountId: userId } });
    if(integration) return { tenantId: integration.tenantId, integrationId: integration.id };
  }
  const tenantId = await getTenantId();
  const integration = await db.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: PROVIDER } } });
  return { tenantId, integrationId: integration?.id };
}

export async function registerMercadoLivreWebhookReceipt(input: { tenantId: string; integrationId?: string; eventId: string; topic: string; payload: any }){
  try{
    await db.webhookReceipt.create({
      data: { tenantId: input.tenantId, provider: WEBHOOK_PROVIDER, eventId: input.eventId, eventType: input.topic, payloadHash: payloadHash(input.payload) }
    });
    return await db.webhookEvent.create({
      data: { tenantId: input.tenantId, integrationId: input.integrationId, provider: WEBHOOK_PROVIDER, eventId: input.eventId, topic: input.topic, payload: input.payload, status: 'PROCESSING' }
    });
  }catch(e: any){
    if(e?.code === 'P2002') return null;
    throw e;
  }
}

export async function finishMercadoLivreWebhook(id: string, status: 'PROCESSED' | 'FAILED', error?: string){
  const event = await db.webhookEvent.update({ where: { id }, data: { status, processedAt: new Date(), error: error?.slice(0, 1000) } });
  await db.webhookReceipt.updateMany({ where: { tenantId: event.tenantId, provider: WEBHOOK_PROVIDER, eventId: event.eventId }, data: { processedAt: new Date(), error: error?.slice(0, 1000) } });
}

function num(v: any){
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function mapOrderStatus(o: any): IngestOrder['status']{
  const status = String(o.status || '').toLowerCase();
  const payments = Array.isArray(o.payments) ? o.payments : [];
  if(payments.some((payment: any) => String(payment.status || '').toLowerCase() === 'refunded')) return 'REFUNDED';
  if(status.includes('cancel')) return 'CANCELLED';
  if(status.includes('paid') || num(o.paid_amount) > 0) return 'PAID';
  return 'PENDING';
}

type MercadoLivreOrderExtra = {
  shippingAmount?: number;
  city?: string;
  state?: string;
  zip?: string;
};

export function mapMercadoLivreOrder(o: any, tenantId: string, extra: MercadoLivreOrderExtra = {}): IngestOrder{
  const buyer = o.buyer || {};
  const items = (o.order_items || []).map((entry: any) => {
    const item = entry.item || {};
    return {
      sku: String(item.seller_sku || item.sku || item.id || `ml-item-${entry.item_id || entry.id || 'sem-sku'}`),
      name: String(item.title || entry.title || 'Item Mercado Livre'),
      quantity: Number(entry.quantity || 1),
      unitPrice: num(entry.unit_price || entry.full_unit_price || o.total_amount),
      unitCost: 0
    };
  });
  return {
    tenantId,
    externalId: String(o.id),
    channel: 'MERCADO_LIVRE',
    status: mapOrderStatus(o),
    currency: o.currency_id || 'BRL',
    grossAmount: num(o.paid_amount || o.total_amount),
    discountAmount: num(o.coupon?.amount),
    shippingAmount: extra.shippingAmount ?? num(o.shipping?.cost || o.shipping?.base_cost),
    feeAmount: num((o.order_items || []).reduce((sum: number, entry: any) => sum + num(entry.sale_fee), 0)),
    taxAmount: 0,
    paymentMethod: (o.payments || []).map((p: any) => p.payment_method_id).filter(Boolean).join(', ') || undefined,
    paidAt: o.date_closed || o.date_created,
    customer: {
      externalId: buyer.id ? String(buyer.id) : undefined,
      name: [buyer.first_name, buyer.last_name].filter(Boolean).join(' ') || buyer.nickname || undefined,
      city: extra.city,
      state: extra.state,
      zip: extra.zip
    },
    items: items.length ? items : [{ sku: `ML-${o.id}`, name: `Pedido Mercado Livre ${o.id}`, quantity: 1, unitPrice: num(o.paid_amount || o.total_amount), unitCost: 0 }],
    attribution: { source: 'Mercado Livre', medium: 'marketplace', campaign: 'Mercado Livre' }
  };
}

async function mapMercadoLivreOrderWithReturns(o: any, tenantId: string, extra: MercadoLivreOrderExtra = {}): Promise<IngestOrder>{
  const mapped = mapMercadoLivreOrder(o, tenantId, extra);
  const returnCase = await db.returnCase.findFirst({
    where: { tenantId, channel: 'MERCADO_LIVRE', orderExternalId: mapped.externalId },
    select: { id: true },
  });
  return returnCase ? { ...mapped, status: 'REFUNDED' } : mapped;
}

async function mercadoLivreShipmentId(order: any, tenantId: string){
  if(order?.shipping?.id) return String(order.shipping.id);
  try{
    const shipments: any = await mercadoLivreApi(`/orders/${order.id}/shipments`, {
      headers: { 'X-New-Domain': 'true', 'X-Api-Version': '2' }
    }, tenantId);
    const first = Array.isArray(shipments) ? shipments[0] : shipments?.results?.[0] || shipments;
    return first?.id ? String(first.id) : null;
  }catch{
    return null;
  }
}

async function mercadoLivreSellerShippingCost(order: any, tenantId: string){
  const shipmentId = await mercadoLivreShipmentId(order, tenantId);
  if(!shipmentId) return num(order.shipping?.cost || order.shipping?.base_cost);
  try{
    const costs: any = await mercadoLivreApi(`/shipments/${shipmentId}/costs`, {
      headers: { 'x-format-new': 'true' }
    }, tenantId);
    const sellerId = String(order?.seller?.id || order?.seller_id || '');
    const senders = Array.isArray(costs?.senders) ? costs.senders : [];
    const sellerSender = senders.find((s: any) => String(s?.user_id || s?.id || '') === sellerId) || senders[0];
    const sellerCost = num(sellerSender?.cost);
    if(sellerCost) return sellerCost;
    return num(costs?.senders_cost || costs?.sender?.cost || costs?.shipping_option?.cost || order.shipping?.cost || order.shipping?.base_cost);
  }catch{
    return num(order.shipping?.cost || order.shipping?.base_cost);
  }
}

async function mercadoLivreOrderExtra(order: any, tenantId: string): Promise<MercadoLivreOrderExtra>{
  const shipmentId = await mercadoLivreShipmentId(order, tenantId);
  const extra: MercadoLivreOrderExtra = {};
  if(!shipmentId){
    extra.shippingAmount = num(order.shipping?.cost || order.shipping?.base_cost);
    return extra;
  }
  try{
    const shipment: any = await mercadoLivreApi(`/shipments/${shipmentId}`, {
      headers: { 'x-format-new': 'true' }
    }, tenantId);
    const address = shipment?.receiver_address || shipment?.destination?.receiver_address || shipment?.destination?.shipping_address || {};
    extra.city = address?.city?.name || address?.city_name || address?.city || undefined;
    const state = address?.state?.id || address?.state?.name || address?.state_name || address?.state || undefined;
    extra.state = typeof state === 'string' && /^BR-[A-Z]{2}$/i.test(state) ? state.slice(3).toUpperCase() : state;
    extra.zip = address?.zip_code || address?.zipcode || address?.zip || undefined;
  }catch{}
  extra.shippingAmount = await mercadoLivreSellerShippingCost(order, tenantId);
  return extra;
}

export async function processMercadoLivreNotification(payload: any, tenantId: string){
  const topic = String(payload?.topic || '').toLowerCase();
  const resource = String(payload?.resource || '');
  if(!topic.includes('order') && !resource.includes('/orders/')) return { ignored: true };
  const order = await mercadoLivreApi(resource, {}, tenantId);
  const extra = await mercadoLivreOrderExtra(order, tenantId);
  await ingestOrder(await mapMercadoLivreOrderWithReturns(order, tenantId, extra));
  await db.integration.updateMany({ where: { tenantId, provider: PROVIDER }, data: { lastSyncAt: new Date(), lastError: null } });
  return { ok: true, orderId: order.id };
}

function isoDaysAgo(days: number){
  return new Date(Date.now() - Math.max(1, days) * 86400000).toISOString();
}

export async function syncMercadoLivreOrders(days = 365, tenantId?: string){
  const conn = await getMercadoLivreConnection(tenantId);
  const seller = conn.externalAccountId;
  if(!seller) throw new Error('Mercado Livre sem seller/user ID');
  let offset = 0;
  let count = 0;
  const limit = 50;
  const from = isoDaysAgo(days);
  do{
    const search:any = await mercadoLivreApi(`/orders/search?seller=${encodeURIComponent(seller)}&order.date_created.from=${encodeURIComponent(from)}&sort=date_desc&limit=${limit}&offset=${offset}`, {}, conn.tenantId);
    const results = Array.isArray(search.results) ? search.results : [];
    for(const orderSummary of results){
      const orderId = orderSummary?.id;
      const order = orderId ? await mercadoLivreApi(`/orders/${orderId}`, {}, conn.tenantId) : orderSummary;
      const extra = await mercadoLivreOrderExtra(order, conn.tenantId);
      await ingestOrder({ ...await mapMercadoLivreOrderWithReturns(order, conn.tenantId, extra), skipInventory: true });
      count++;
    }
    offset += results.length;
    if(!results.length || offset >= Number(search.paging?.total || 0)) break;
  }while(offset < 1000);
  await db.integration.update({ where: { id: conn.integrationId }, data: { lastSyncAt: new Date(), lastError: null } });
  return count;
}

export async function backfillMercadoLivreCustomerLocations(tenantId?: string){
  const scopedTenantId = tenantId || await getTenantId();
  const orders = await db.order.findMany({
    where: {
      tenantId: scopedTenantId,
      channel: 'MERCADO_LIVRE',
      customerId: { not: null },
      customer: { OR: [{ city: null }, { state: null }, { zip: null }] }
    },
    select: { externalId: true, customerId: true },
    orderBy: { createdAt: 'desc' },
    take: 100
  });
  let updated = 0;
  let failed = 0;
  let firstError = '';
  for(const row of orders){
    try{
      const order: any = await mercadoLivreApi(`/orders/${row.externalId}`, {}, scopedTenantId);
      const extra = await mercadoLivreOrderExtra(order, scopedTenantId);
      const data: Record<string, string> = {};
      if(extra.city) data.city = extra.city;
      if(extra.state) data.state = extra.state;
      if(extra.zip) data.zip = extra.zip;
      if(Object.keys(data).length && row.customerId){
        await db.customer.update({ where: { id: row.customerId }, data });
        updated++;
      }
    }catch(e: any){
      failed++;
      if(!firstError) firstError = e?.message || 'mercado_livre_backfill_failed';
    }
  }
  if(orders.length && failed === orders.length && !updated) throw new Error(firstError);
  return { scanned: orders.length, updated, failed, error: firstError || null };
}

export { AUTH_URL as MERCADO_LIVRE_AUTH_URL, PROVIDER as MERCADO_LIVRE_PROVIDER };
