import { db } from './db';
import { decryptSecret, encryptSecret } from './crypto-secrets';
import { ingestOrder, type IngestOrder } from './orders';
import { normalizePaymentMethod } from './payment-method';
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

export async function amazonRequest<T = any>(path: string, options: { method?: string; query?: Record<string, string>; body?: unknown; accessToken?: string } = {}, tenantId?: string): Promise<T>{
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
      'x-amz-access-token': options.accessToken || conn.accessToken,
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

export async function listAmazonTransfers(tenantId: string) {
  const firstOrder = await db.order.findFirst({
    where: { tenantId, channel: 'AMAZON' },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true }
  });
  const retentionStart = Date.now() - 3650 * 86400000;
  const start = Math.max(retentionStart, (firstOrder?.createdAt.getTime() || Date.now()) - 180 * 86400000);
  const end = Date.now() - 5 * 60000;
  const groups: any[] = [];
  for (let windowStart = start; windowStart < end; windowStart += 179 * 86400000) {
    const windowEnd = Math.min(end, windowStart + 179 * 86400000);
    const query = {
      FinancialEventGroupStartedAfter: new Date(windowStart).toISOString(),
      FinancialEventGroupStartedBefore: new Date(windowEnd).toISOString(),
      MaxResultsPerPage: '100'
    };
    let nextToken: string | undefined;
    for (let page = 0; page < 100; page++) {
      const result: any = await amazonRequest('/finances/v0/financialEventGroups', {
        query: { ...query, ...(nextToken ? { NextToken: nextToken } : {}) }
      }, tenantId);
      groups.push(...(result?.payload?.FinancialEventGroupList || []));
      nextToken = result?.payload?.NextToken;
      if (!nextToken) break;
    }
    if (nextToken) throw new Error('Histórico de repasses incompleto; atualize para tentar novamente.');
  }
  return [...new Map(groups.filter((group) => group.FinancialEventGroupId).map((group) => [group.FinancialEventGroupId, group])).values()].map((group) => ({
    id: String(group.FinancialEventGroupId || ''),
    platform: 'Amazon',
    amount: Number(group.ConvertedTotal?.CurrencyAmount ?? group.OriginalTotal?.CurrencyAmount ?? 0),
    currency: String(group.ConvertedTotal?.CurrencyCode || group.OriginalTotal?.CurrencyCode || 'BRL'),
    periodStart: group.FinancialEventGroupStart || null,
    periodEnd: group.FinancialEventGroupEnd || null,
    transferDate: group.FundTransferDate || null,
    transferStatus: String(group.FundTransferStatus || group.ProcessingStatus || 'UNKNOWN'),
    accountTail: group.AccountTail ? String(group.AccountTail) : null,
    traceId: group.TraceId ? String(group.TraceId) : null,
  })).filter((group) => group.id).sort((a, b) =>
    String(b.transferDate || b.periodEnd || b.periodStart || '').localeCompare(String(a.transferDate || a.periodEnd || a.periodStart || ''))
  );
}

async function amazonRestrictedDataToken(path: string, method = 'GET', tenantId?: string){
  const response: any = await amazonRequest('/tokens/2021-03-01/restrictedDataToken', {
    method: 'POST',
    body: {
      restrictedResources: [{
        method,
        path
      }]
    }
  }, tenantId);
  return String(response?.restrictedDataToken || '');
}

function num(value: unknown){
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function payloadOf(value: any){
  return value?.payload || value;
}

function firstOf(...values: any[]){
  return values.find(value => value !== undefined && value !== null && value !== '') ?? undefined;
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
function estimateAmazonFee(amount: number){
  return Math.round(amount * 0.135 * 100) / 100;
}

async function amazonOrderV2026(orderId: string, tenantId: string){
  try{
    const path = `/orders/2026-01-01/orders/${encodeURIComponent(orderId)}`;
    const restrictedToken = await amazonRestrictedDataToken(path, 'GET', tenantId);
    const response: any = await amazonRequest(path, {
      accessToken: restrictedToken,
      query: { includedData: 'BUYER,RECIPIENT,PROCEEDS,FULFILLMENT' }
    }, tenantId);
    return payloadOf(response)?.order || payloadOf(response)?.Order || payloadOf(response);
  }catch{
    return null;
  }
}

function amazonV2026Items(order: any, fallbackAmount: number){
  const rawItems = order?.orderItems || order?.items || [];
  if(!Array.isArray(rawItems)) return [];
  return rawItems.map((item: any) => {
    const qty = Number(firstOf(item?.quantityOrdered, item?.quantityShipped, item?.quantity, 1)) || 1;
    const product = item?.product || {};
    const proceeds = item?.proceeds || {};
    const itemBreakdown = (proceeds?.breakdowns || []).find((b: any) => String(b?.type || '').toUpperCase() === 'ITEM');
    const price = num(firstOf(
      product?.price?.unitPrice?.amount,
      product?.price?.unitPrice,
      itemBreakdown?.subtotal?.amount,
      itemBreakdown?.subtotal,
      item?.unitPrice?.amount,
      item?.unitPrice,
      fallbackAmount
    ));
    return {
      sku: String(firstOf(product?.sellerSku, product?.sku, item?.sellerSku, item?.sku, product?.asin, item?.asin, `AMAZON-${order?.orderId || order?.AmazonOrderId}`)),
      name: String(firstOf(product?.title, item?.title, `Pedido Amazon ${order?.orderId || order?.AmazonOrderId}`)),
      quantity: qty,
      unitPrice: qty && price > fallbackAmount ? price / qty : price
    };
  });
}

function amazonV2026Money(order: any){
  const total = order?.summary?.orderTotal || order?.orderTotal || order?.payment?.orderTotal;
  const amount = num(firstOf(total?.amount, total?.value, total));
  let shippingAmount = 0;
  let feeAmount = 0;
  const visitBreakdowns = (breakdowns: any[]) => {
    for(const breakdown of breakdowns || []){
      const type = String(breakdown?.type || breakdown?.subtype || '').toUpperCase();
      const value = Math.abs(num(firstOf(breakdown?.subtotal?.amount, breakdown?.value?.amount, breakdown?.amount, breakdown?.subtotal, breakdown?.value)));
      if(!value) continue;
      if(type.includes('SHIPPING') || type.includes('FREIGHT') || type.includes('DELIVERY')) shippingAmount += value;
      if(type.includes('FEE') || type.includes('COMMISSION')) feeAmount += value;
      visitBreakdowns(breakdown?.detailedBreakdowns || []);
    }
  };
  visitBreakdowns(order?.proceeds?.breakdowns || []);
  for(const item of order?.orderItems || []) visitBreakdowns(item?.proceeds?.breakdowns || []);
  return { amount, shippingAmount, feeAmount };
}

async function mapAmazonOrder(order: any, tenantId: string): Promise<IngestOrder>{
  const orderId = String(order.AmazonOrderId);
  const v2026 = await amazonOrderV2026(orderId, tenantId);
  let items: any[] = [];
  let buyerInfo: any = {};
  let restrictedAddress: any = {};
  try{
    const itemPayload: any = await amazonRequest(`/orders/v0/orders/${encodeURIComponent(orderId)}/orderItems`, {}, tenantId);
    const payload = payloadOf(itemPayload);
    items = Array.isArray(payload?.OrderItems) ? payload.OrderItems : [];
  }catch{}
  try{
    const buyerPath = `/orders/v0/orders/${encodeURIComponent(orderId)}/buyerInfo`;
    const restrictedToken = await amazonRestrictedDataToken(buyerPath, 'GET', tenantId);
    const buyerPayload: any = await amazonRequest(buyerPath, { accessToken: restrictedToken }, tenantId);
    buyerInfo = payloadOf(buyerPayload) || {};
  }catch{}
  try{
    const addressPath = `/orders/v0/orders/${encodeURIComponent(orderId)}/address`;
    const restrictedToken = await amazonRestrictedDataToken(addressPath, 'GET', tenantId);
    const addressPayload: any = await amazonRequest(addressPath, { accessToken: restrictedToken }, tenantId);
    restrictedAddress = payloadOf(addressPayload)?.ShippingAddress || {};
  }catch{}
  const financials = await amazonOrderFinancials(orderId, tenantId);
  const v2026Money = v2026 ? amazonV2026Money(v2026) : { amount: 0, shippingAmount: 0, feeAmount: 0 };
  const amount = v2026Money.amount || num(order?.OrderTotal?.Amount);
  const v2026Items = v2026 ? amazonV2026Items(v2026, amount) : [];
  const mappedItems = v2026Items.length ? v2026Items : items.map(item => {
    const price = num(item?.ItemPrice?.Amount);
    const qty = Number(item?.QuantityOrdered || item?.QuantityShipped || 1);
    return {
      sku: String(item?.SellerSKU || item?.ASIN || `AMAZON-${orderId}`),
      name: String(item?.Title || `Pedido Amazon ${orderId}`),
      quantity: qty || 1,
      unitPrice: price && qty ? price / qty : amount
    };
  });
  const buyer = v2026?.buyer || {};
  const recipient = v2026?.recipient || {};
  const deliveryAddress = recipient?.deliveryAddress || {};
  return {
    tenantId,
    externalId: orderId,
    channel: 'AMAZON',
    fulfillmentOrigin: String(order?.FulfillmentChannel || v2026?.fulfillmentChannel || '').toUpperCase() === 'AFN' ? 'AMAZON_FBA' : undefined,
    // Financial reversals without a physical return record are cancellations.
    // REFUNDED remains reserved for orders tracked by the returns workflow.
    status: financials.refunded ? 'CANCELLED' : mapAmazonStatus(order),
    currency: order?.OrderTotal?.CurrencyCode || 'BRL',
    grossAmount: amount,
    shippingAmount: v2026Money.shippingAmount || financials.shippingAmount,
    feeAmount: financials.feeAmount || v2026Money.feeAmount || (mapAmazonStatus(order) === 'PAID' && amount ? estimateAmazonFee(amount) : 0),
    taxAmount: 0,
    paymentMethod: normalizePaymentMethod(firstOf(v2026?.payment?.paymentMethod, v2026?.paymentMethod, ...(order?.PaymentMethodDetails || []), order?.PaymentMethod)) || undefined,
    paidAt: order.PurchaseDate,
    customer: {
      externalId: orderId,
      name: firstOf(buyer?.buyerName, buyer?.name, buyerInfo?.BuyerName, deliveryAddress?.name, restrictedAddress?.Name, order.BuyerInfo?.BuyerName, order.ShippingAddress?.Name, 'Cliente Amazon'),
      city: firstOf(deliveryAddress?.city, restrictedAddress?.City, order.ShippingAddress?.City),
      state: firstOf(deliveryAddress?.stateOrRegion, deliveryAddress?.state, restrictedAddress?.StateOrRegion, order.ShippingAddress?.StateOrRegion),
      zip: firstOf(deliveryAddress?.postalCode, restrictedAddress?.PostalCode, order.ShippingAddress?.PostalCode)
    },
    items: mappedItems.length ? mappedItems : [{ sku: `AMAZON-${orderId}`, name: `Pedido Amazon ${orderId}`, quantity: 1, unitPrice: amount }],
    attribution: { source: 'Amazon', medium: 'marketplace', campaign: 'Amazon' },
    returnInfo: financials.refunded ? { status: 'REFUNDED', refundAmount: financials.refundAmount, observedAt: new Date().toISOString() } : undefined,
    skipInventory: true
  };
}

async function amazonOrderFinancials(orderId: string, tenantId: string){
  try{
    const response: any = await amazonRequest(`/finances/v0/orders/${encodeURIComponent(orderId)}/financialEvents`, {}, tenantId);
    const events = payloadOf(response)?.FinancialEvents || {};
    let feeAmount = 0;
    let shippingAmount = 0;
    let refundAmount = 0;
    let refunded = false;
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
    const visitRefundCharge = (charge: any) => {
      const amount = Math.abs(moneyAmount(charge?.ChargeAmount));
      if(amount) refundAmount += amount;
    };
    const arrays = Object.values(events).flatMap((value: any) => Array.isArray(value) ? value : []);
    for(const event of arrays){
      if((event.ShipmentItemAdjustmentList || []).length || (event.RefundItemList || []).length) refunded = true;
      for(const fee of event.FeeList || []) visitFee(fee);
      for(const item of [...(event.ShipmentItemList || []), ...(event.ShipmentItemAdjustmentList || [])]){
        for(const fee of item.ItemFeeList || []) visitFee(fee);
        for(const charge of item.ItemChargeList || []) visitCharge(charge);
        for(const charge of item.ItemChargeAdjustmentList || []) visitRefundCharge(charge);
      }
      for(const item of event.RefundItemList || []){
        for(const fee of item.ItemFeeList || []) visitFee(fee);
        for(const charge of item.ItemChargeList || []) visitRefundCharge(charge);
      }
    }
    return { feeAmount, shippingAmount, refundAmount, refunded: refunded || refundAmount > 0 };
  }catch{
    return { feeAmount: 0, shippingAmount: 0, refundAmount: 0, refunded: false };
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
      const mapped = await mapAmazonOrder(order, conn.tenantId);
      await ingestOrder(mapped);
      if(mapped.returnInfo){
        const item = mapped.items[0];
        const existingReturn = await db.returnCase.findFirst({ where: { tenantId: conn.tenantId, channel: 'AMAZON', orderExternalId: mapped.externalId }, orderBy: { observedAt: 'desc' } });
        if(existingReturn){
          await db.returnCase.update({ where: { id: existingReturn.id }, data: { status: mapped.returnInfo.status, sku: item?.sku || undefined, quantity: item?.quantity || undefined, orderAmount: mapped.grossAmount, refundAmount: mapped.returnInfo.refundAmount ?? undefined, observedAt: new Date(mapped.returnInfo.observedAt || Date.now()) } });
        }else{
          await db.returnCase.create({ data: { tenantId: conn.tenantId, channel: 'AMAZON', externalOrderId: mapped.externalId, orderExternalId: mapped.externalId, status: mapped.returnInfo.status, sku: item?.sku || null, quantity: item?.quantity || 1, orderAmount: mapped.grossAmount, refundAmount: mapped.returnInfo.refundAmount ?? null, sourceUrl: 'https://sellercentral.amazon.com.br/manage/returns', observedAt: new Date(mapped.returnInfo.observedAt || Date.now()) } });
        }
        await db.order.updateMany({ where: { tenantId: conn.tenantId, channel: 'AMAZON', externalId: mapped.externalId }, data: { status: 'REFUNDED', netRevenue: 0 } });
      }
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
