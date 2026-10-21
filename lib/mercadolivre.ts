import crypto from 'crypto';
import { db } from './db';
import { decryptSecret, encryptSecret } from './crypto-secrets';
import { ingestOrder, type IngestOrder } from './orders';
import { normalizePaymentMethod } from './payment-method';
import { moveStock } from './inventory';
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

export async function refreshMercadoLivreConnection(integration: { id: string; tenantId: string; refreshTokenEncrypted: string | null; metadata: unknown }, attemptedAccessToken?: string){
  const id = clientId();
  const secret = clientSecret();
  if(!id || !secret) throw new Error('Credenciais OAuth Mercado Livre ausentes no servidor');
  // Mercado Livre rotates refresh tokens. Serialize refreshes across server instances
  // so concurrent webhooks cannot spend the same token twice.
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(94127, hashtext(${integration.id}))) AS token_lock`;
    const current = await tx.integration.findUnique({ where: { id: integration.id } });
    if(!current?.refreshTokenEncrypted) throw new Error('Mercado Livre sem refresh token; ative Refresh Token no Developer e reconecte a conta');
    const currentExpiry = (current.metadata as any)?.expiresAt;
    if(attemptedAccessToken){
      if(current.accessTokenEncrypted && decryptSecret(current.accessTokenEncrypted) !== attemptedAccessToken) return current;
    }else if(currentExpiry && new Date(currentExpiry).getTime() - Date.now() >= 5 * 60 * 1000){
      return current;
    }
    const token = await postToken({
      grant_type: 'refresh_token',
      client_id: id,
      client_secret: secret,
      refresh_token: decryptSecret(current.refreshTokenEncrypted)
    });
    if(!token.refresh_token) throw new Error('Mercado Livre não devolveu refresh token na renovação; verifique o fluxo Refresh Token no Developer');
    const metadata = { ...((current.metadata as Record<string, unknown>) || {}), expiresAt: tokenExpiresAt(token.expires_in), tokenType: token.token_type, refreshTokenAvailable: true, refreshedAt: new Date().toISOString() };
    return tx.integration.update({
      where: { id: integration.id },
      data: {
        accessTokenEncrypted: encryptSecret(token.access_token),
        refreshTokenEncrypted: encryptSecret(token.refresh_token),
        scopes: token.scope || undefined,
        metadata,
        status: 'CONNECTED',
        lastError: null
      }
    });
  }, { maxWait: 20000, timeout: 20000 });
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
  if(!integration.refreshTokenEncrypted && expiresAt && new Date(expiresAt).getTime() <= Date.now()){
    throw new Error('Mercado Livre expirado sem token de renovação; ative Refresh Token no Developer e reconecte a conta');
  }
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
    const refreshed = await refreshMercadoLivreConnection({ id: conn.integrationId, tenantId: conn.tenantId, refreshTokenEncrypted: null, metadata: null }, conn.accessToken);
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
    if(e?.code === 'P2002'){
      const where = { tenantId: input.tenantId, provider: WEBHOOK_PROVIDER, eventId: input.eventId };
      const retry = await db.webhookEvent.updateMany({ where: { ...where, status: 'FAILED' }, data: { status: 'PROCESSING', processedAt: null, error: null } });
      return retry.count ? db.webhookEvent.findUnique({ where: { tenantId_provider_eventId: where } }) : null;
    }
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
  logisticType?: string;
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
    fulfillmentOrigin: /full|fulfillment/i.test(String(extra.logisticType || o.shipping?.logistic_type || '')) ? 'ML_FULL' : undefined,
    status: mapOrderStatus(o),
    currency: o.currency_id || 'BRL',
    grossAmount: num(o.paid_amount || o.total_amount),
    discountAmount: num(o.coupon?.amount),
    shippingAmount: extra.shippingAmount ?? num(o.shipping?.cost || o.shipping?.base_cost),
    feeAmount: num((o.order_items || []).reduce((sum: number, entry: any) => sum + num(entry.sale_fee), 0)),
    taxAmount: 0,
    paymentMethod: normalizePaymentMethod((o.payments || []).map((p: any) => p.payment_method_id).filter(Boolean).join(', ')) || undefined,
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
    extra.logisticType = String(shipment?.logistic_type || shipment?.shipping_option?.logistic_type || '');
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
  const claimId = resource.match(/\/claims\/(\d+)/)?.[1];
  if(claimId){
    const result = await syncMercadoLivreReturns(tenantId, claimId);
    return { ok: true, ...result };
  }
  if(!topic.includes('order') && !resource.includes('/orders/')) return { ignored: true };
  const order = await mercadoLivreApi(resource, {}, tenantId);
  const extra = await mercadoLivreOrderExtra(order, tenantId);
  await ingestOrder(await mapMercadoLivreOrderWithReturns(order, tenantId, extra));
  await syncMercadoLivreReturnsForOrder(tenantId, String(order.id));
  await db.integration.updateMany({ where: { tenantId, provider: PROVIDER }, data: { lastSyncAt: new Date(), lastError: null } });
  return { ok: true, orderId: order.id };
}

async function syncMercadoLivreReturnCase(returnCase: { id: string; tenantId: string; claimId: string | null; sku: string | null; quantity: number; status: string; orderExternalId: string | null }){
  if(!returnCase.claimId) return { checked: 0, delivered: 0, restocked: 0 };
  const response: any = await mercadoLivreApi(`/post-purchase/v2/claims/${encodeURIComponent(returnCase.claimId)}/returns`, {}, returnCase.tenantId);
  const result = Array.isArray(response) ? response[0] : response;
  const status = String(result?.status || '').toLowerCase();
  if(!status) throw new Error(`Status da devolução ${returnCase.claimId} indisponível`);
  const delivered = status === 'delivered';
  let sku = returnCase.sku;
  let quantity = returnCase.quantity;
  if(!sku && returnCase.orderExternalId){
    const order = await db.order.findUnique({ where: { tenantId_channel_externalId: { tenantId: returnCase.tenantId, channel: 'MERCADO_LIVRE', externalId: returnCase.orderExternalId } }, include: { items: true } });
    if(order?.items.length === 1){ sku = order.items[0].sku; quantity = order.items[0].quantity; }
  }
  await db.returnCase.update({ where: { id: returnCase.id }, data: { status: delivered ? 'DELIVERED' : status === 'shipped' ? 'IN_TRANSIT' : status.toUpperCase(), observedAt: new Date(), sku: sku || undefined, quantity } });
  if(!delivered || !sku || quantity <= 0) return { checked: 1, delivered: Number(delivered), restocked: 0 };
  const idempotencyKey = `mercadolivre-return:${returnCase.id}:${sku}`;
  const previous = await db.inventoryMovement.findUnique({ where: { tenantId_idempotencyKey: { tenantId: returnCase.tenantId, idempotencyKey } } });
  if(previous) return { checked: 1, delivered: 1, restocked: 0 };
  const manualReturn = await db.inventoryMovement.findFirst({ where: { tenantId: returnCase.tenantId, type: 'RETURN', variant: { sku }, reference: { in: [returnCase.orderExternalId, returnCase.claimId].filter((value): value is string => Boolean(value)) }, source: 'MANUAL' }, select: { id: true } });
  if(manualReturn) return { checked: 1, delivered: 1, restocked: 0 };
  try{
    await moveStock({ tenantId: returnCase.tenantId, sku, warehouseCode: 'CENTRAL', quantity, type: 'RETURN', reference: returnCase.orderExternalId || returnCase.claimId, note: `Devolução Mercado Livre entregue · claim ${returnCase.claimId}`, idempotencyKey });
  }catch(error: any){
    if(error?.code !== 'P2002') throw error;
  }
  return { checked: 1, delivered: 1, restocked: 1 };
}

export async function syncMercadoLivreReturns(tenantId: string, claimId?: string){
  if(claimId) await discoverMercadoLivreReturn(tenantId, claimId);
  const cases = await db.returnCase.findMany({ where: { tenantId, channel: 'MERCADO_LIVRE', claimId: claimId || { not: null } }, select: { id: true, tenantId: true, claimId: true, sku: true, quantity: true, status: true, orderExternalId: true } });
  const summary = { checked: 0, delivered: 0, restocked: 0 };
  let firstError: unknown;
  for(const returnCase of cases){
    try{
      const result = await syncMercadoLivreReturnCase(returnCase);
      summary.checked += result.checked;
      summary.delivered += result.delivered;
      summary.restocked += result.restocked;
    }catch(error){
      firstError ||= error;
    }
  }
  if(firstError) throw firstError;
  return summary;
}

async function discoverMercadoLivreReturn(tenantId: string, claimId: string){
  const existing = await db.returnCase.findFirst({ where: { tenantId, channel: 'MERCADO_LIVRE', claimId }, select: { id: true } });
  if(existing) return;
  const claim: any = await mercadoLivreApi(`/post-purchase/v1/claims/${encodeURIComponent(claimId)}`, {}, tenantId);
  const related = Array.isArray(claim?.related_entities) ? claim.related_entities.map(String) : [];
  if(!related.some((entity: string) => entity.toLowerCase().includes('return'))) return;
  const response: any = await mercadoLivreApi(`/post-purchase/v2/claims/${encodeURIComponent(claimId)}/returns`, {}, tenantId);
  const returned = Array.isArray(response) ? response[0] : response;
  const orderExternalId = claim?.resource === 'order' && claim?.resource_id ? String(claim.resource_id) : null;
  const order = orderExternalId ? await db.order.findUnique({ where: { tenantId_channel_externalId: { tenantId, channel: 'MERCADO_LIVRE', externalId: orderExternalId } }, include: { items: true } }) : null;
  const item = order?.items.length === 1 ? order.items[0] : null;
  await db.returnCase.upsert({
    where: { tenantId_channel_externalOrderId: { tenantId, channel: 'MERCADO_LIVRE', externalOrderId: String(returned?.id || claimId) } },
    create: { tenantId, channel: 'MERCADO_LIVRE', externalOrderId: String(returned?.id || claimId), orderExternalId, claimId, status: String(returned?.status || 'PENDING').toUpperCase(), sku: item?.sku || null, quantity: item?.quantity || 1, sourceUrl: orderExternalId ? `https://vendedores.mercadolivre.com.br/vendas/${orderExternalId}/detalhe` : null },
    update: { claimId, orderExternalId, sku: item?.sku || undefined, quantity: item?.quantity || undefined }
  });
}

async function syncMercadoLivreReturnsForOrder(tenantId: string, orderExternalId: string){
  const cases = await db.returnCase.findMany({ where: { tenantId, channel: 'MERCADO_LIVRE', orderExternalId }, select: { claimId: true } });
  for(const returnCase of cases){
    if(returnCase.claimId) await syncMercadoLivreReturns(tenantId, returnCase.claimId);
  }
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
  const officialSkuByItem=new Map<string,string>();
  do{
    const search:any = await mercadoLivreApi(`/orders/search?seller=${encodeURIComponent(seller)}&order.date_created.from=${encodeURIComponent(from)}&sort=date_desc&limit=${limit}&offset=${offset}`, {}, conn.tenantId);
    const results = Array.isArray(search.results) ? search.results : [];
    for(const orderSummary of results){
      const orderId = orderSummary?.id;
      const order = orderId ? await mercadoLivreApi(`/orders/${orderId}`, {}, conn.tenantId) : orderSummary;
      for(const entry of order?.order_items||[]){
        const itemId=String(entry?.item?.id||'');
        if(!itemId) continue;
        if(!officialSkuByItem.has(itemId)){
          const item:any=await mercadoLivreApi(`/items/${encodeURIComponent(itemId)}`,{},conn.tenantId);
          const variation=(item.variations||[]).find((candidate:any)=>String(candidate.id)===String(entry?.item?.variation_id));
          const attributes=[...(variation?.attributes||[]),...(item.attributes||[])];
          const sku=String(variation?.seller_custom_field||item.seller_custom_field||attributes.find((attribute:any)=>attribute.id==='SELLER_SKU')?.value_name||entry?.item?.seller_sku||'').trim();
          officialSkuByItem.set(itemId,sku);
        }
        const officialSku=officialSkuByItem.get(itemId);
        if(officialSku) entry.item.seller_sku=officialSku;
      }
      const extra = await mercadoLivreOrderExtra(order, conn.tenantId);
      await ingestOrder({ ...await mapMercadoLivreOrderWithReturns(order, conn.tenantId, extra), skipInventory: true });
      count++;
    }
    offset += results.length;
    if(!results.length || offset >= Number(search.paging?.total || 0)) break;
  }while(offset < 1000);
  await syncMercadoLivreReturns(conn.tenantId).catch(()=>0);
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
