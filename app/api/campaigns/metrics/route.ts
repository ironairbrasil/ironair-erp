import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';
import { currentMetaToken, metaGraphVersion } from '@/lib/meta-token';
import { adDateRange } from '@/lib/ad-date-range';

type Action = { action_type: string; value: string };
type Insight = { account_id?: string; campaign_id?: string; adset_id?: string; ad_id?: string; reach?: string; frequency?: string; impressions?: string; spend?: string; inline_link_clicks?: string; actions?: Action[]; action_values?: Action[] };
type Metric = { reach: number; frequency: number | null; linkClicks: number; landingViews: number; purchases: number; purchaseValue: number; checkouts: number; checkoutValue: number };
type Metrics = Record<'accounts' | 'campaigns' | 'adsets' | 'ads', Record<string, Metric>>;
const cache = new Map<string, { expires: number; data: { metrics: Metrics; since: string; until: string } }>();
const actionValue = (items: Action[] | undefined, names: string[]) => {
  for (const name of names) {
    const found = items?.find((item) => item.action_type === name);
    if (found) return Number(found.value) || 0;
  }
  return 0;
};
const purchaseActions = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_web_purchase'];
const checkoutActions = ['omni_initiated_checkout', 'initiate_checkout', 'offsite_conversion.fb_pixel_initiate_checkout', 'onsite_web_initiate_checkout'];
const emptyMetric = (): Metric => ({ reach: 0, frequency: null, linkClicks: 0, landingViews: 0, purchases: 0, purchaseValue: 0, checkouts: 0, checkoutValue: 0 });

export async function GET(req: Request) {
  try {
    const tenantId = await getTenantId(req);
    const integration = await db.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: 'Meta Ads' } } });
    if (!integration?.accessTokenEncrypted || !integration.externalAccountId || integration.status !== 'CONNECTED') return NextResponse.json({ metrics: { accounts: {}, campaigns: {}, adsets: {}, ads: {} } });
    const account = integration.externalAccountId.replace(/^act_/, '');
    if (!/^\d+$/.test(account)) throw new Error('Conta Meta inválida');
    const dateRange = adDateRange(req);
    const first = dateRange ? null : await db.adSpendDaily.findFirst({ where: { tenantId, platform: 'Meta', accountId: account }, orderBy: { date: 'asc' }, select: { date: true } });
    if (!dateRange && !first) return NextResponse.json({ metrics: { accounts: {}, campaigns: {}, adsets: {}, ads: {} } });
    const since = dateRange?.from || first!.date.toISOString().slice(0, 10);
    const until = dateRange?.to || new Date().toISOString().slice(0, 10);
    const cacheKey = `${tenantId}:${account}:${since}:${until}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return NextResponse.json(cached.data);
    const token = await currentMetaToken(integration);
    const levels = [['account', 'accounts', 'account_id'], ['campaign', 'campaigns', 'campaign_id'], ['adset', 'adsets', 'adset_id'], ['ad', 'ads', 'ad_id']] as const;
    const metrics: Metrics = { accounts: {}, campaigns: {}, adsets: {}, ads: {} };
    await Promise.all(levels.map(async ([level, key, idField]) => {
      const url = new URL(`https://graph.facebook.com/${metaGraphVersion()}/act_${account}/insights`);
      url.searchParams.set('level', level);
      url.searchParams.set('time_range', JSON.stringify({ since, until }));
      url.searchParams.set('fields', `${idField},reach,frequency,impressions,spend,inline_link_clicks,actions,action_values`);
      url.searchParams.set('limit', '500');
      let after: string | undefined;
      for (let page = 0; page < 20; page++) {
        if (after) url.searchParams.set('after', after);
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const body = await response.json();
        if (!response.ok) throw new Error(`Meta API ${response.status}: ${body.error?.message || 'falha nas métricas'}`);
        for (const row of (body.data || []) as Insight[]) {
          const id = row[idField];
          if (!id) continue;
          metrics[key][id] = {
            reach: Number(row.reach) || 0,
            frequency: row.frequency == null ? null : Number(row.frequency) || 0,
            linkClicks: Number(row.inline_link_clicks) || 0,
            landingViews: actionValue(row.actions, ['landing_page_view', 'omni_landing_page_view']),
            purchases: actionValue(row.actions, purchaseActions),
            purchaseValue: actionValue(row.action_values, purchaseActions),
            checkouts: actionValue(row.actions, checkoutActions),
            checkoutValue: actionValue(row.action_values, checkoutActions),
          };
        }
        const next: string | undefined = body.paging?.next;
        const cursor: string | undefined = next ? body.paging?.cursors?.after || new URL(next).searchParams.get('after') || undefined : undefined;
        if (!cursor || cursor === after) break;
        after = cursor;
        if (page === 19) throw new Error('Limite de paginação de métricas Meta atingido');
      }
    }));
    // Reconcile Meta's reported Purchase events with paid Shopify orders. Older
    // PIX checkouts emitted Purchase when the QR code was generated, so raw Meta
    // actions can be duplicated and are intentionally not used as sales here.
    for (const group of Object.values(metrics)) for (const metric of Object.values(group)) {
      metric.purchases = 0;
      metric.purchaseValue = 0;
    }
    const paidOrders = await db.order.findMany({
      where: {
        tenantId,
        channel: 'SHOPIFY',
        status: 'PAID',
        paidAt: { gte: new Date(`${since}T00:00:00.000-03:00`), lte: new Date(`${until}T23:59:59.999-03:00`) },
        attribution: { isNot: null },
      },
      include: { attribution: true },
    });
    const addSale = (group: Record<string, Metric>, id: string | null | undefined, value: number) => {
      if (!id || !/^\d+$/.test(id)) return;
      const metric = group[id] ||= emptyMetric();
      metric.purchases += 1;
      metric.purchaseValue += value;
    };
    for (const order of paidOrders) {
      const attribution = order.attribution;
      if (!attribution) continue;
      const campaignId = attribution.campaignId || (/^\d+$/.test(attribution.campaign || '') ? attribution.campaign : null);
      const adsetId = attribution.adsetId || (/^\d+$/.test(attribution.term || '') ? attribution.term : null);
      const adId = attribution.adId || (/^\d+$/.test(attribution.content || '') ? attribution.content : null);
      if (!campaignId && !adsetId && !adId && !/facebook|instagram|meta/i.test(attribution.source || '')) continue;
      const value = Number(order.grossAmount) - Number(order.discountAmount);
      const accountMetric = metrics.accounts[account] ||= emptyMetric();
      accountMetric.purchases += 1;
      accountMetric.purchaseValue += value;
      addSale(metrics.campaigns, campaignId, value);
      addSale(metrics.adsets, adsetId, value);
      addSale(metrics.ads, adId, value);
    }
    const data = { metrics, since, until };
    cache.set(cacheKey, { expires: Date.now() + 5 * 60_000, data });
    if (cache.size > 100) for (const [key, value] of cache) if (value.expires < Date.now()) cache.delete(key);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Falha nas métricas Meta' }, { status: 400 });
  }
}
