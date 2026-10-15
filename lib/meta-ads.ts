import { db } from './db';
import { currentMetaToken, metaGraphVersion } from './meta-token';

type Insight = {
  date_start: string;
  account_id: string;
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  ad_id: string;
  ad_name: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
};
type InsightPage = { data?: Insight[]; paging?: { next?: string; cursors?: { after?: string } }; error?: { message?: string } };

export async function syncMetaAds(days = 30, tenantId: string) {
  const integration = await db.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: 'Meta Ads' } } });
  if (!integration || !['CONNECTED', 'ERROR'].includes(integration.status) || !integration.accessTokenEncrypted || !integration.externalAccountId) {
    throw new Error('Meta Ads não está conectada para esta empresa');
  }
  const account = integration.externalAccountId.replace(/^act_/, '');
  if (!/^\d+$/.test(account)) throw new Error('Conta de anúncios inválida');
  const today = new Date();
  const since = new Date(today.getTime() - Math.min(Math.max(Math.floor(days), 1), 365) * 864e5).toISOString().slice(0, 10);
  const until = today.toISOString().slice(0, 10);
  const url = new URL(`https://graph.facebook.com/${metaGraphVersion()}/act_${account}/insights`);
  url.searchParams.set('level', 'ad');
  url.searchParams.set('time_increment', '1');
  url.searchParams.set('time_range', JSON.stringify({ since, until }));
  url.searchParams.set('fields', 'date_start,account_id,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks');
  url.searchParams.set('limit', '500');
  let after: string | undefined;
  try {
    const token = await currentMetaToken(integration);
    const rows: Insight[] = [];
    for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
      if (after) url.searchParams.set('after', after);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const payload: InsightPage = await response.json();
      if (!response.ok) throw new Error(`Meta API ${response.status}: ${payload.error?.message || 'erro desconhecido'}`);
      for (const row of payload.data || []) {
        if (!row.date_start || !row.campaign_id || !row.adset_id || !row.ad_id) continue;
        if (row.account_id !== account) throw new Error('A Meta retornou dados de outra conta de anúncios');
        rows.push(row);
      }
      const cursor = payload.paging?.next ? payload.paging.cursors?.after || new URL(payload.paging.next).searchParams.get('after') || undefined : undefined;
      if (!cursor || !payload.data?.length || cursor === after) break;
      after = cursor;
      if (pageNumber === 99) throw new Error('Limite de paginação da Meta atingido');
    }
    const fromDate = new Date(`${since}T00:00:00.000Z`);
    const toDate = new Date(`${until}T00:00:00.000Z`);
    await db.$transaction(async (tx) => {
      // Replace the whole synced range atomically so campaign-level rows never double-count ad-level rows.
      await tx.adSpendDaily.deleteMany({ where: { tenantId, platform: 'Meta', accountId: account, date: { gte: fromDate, lte: toDate } } });
      for (let i = 0; i < rows.length; i += 500) {
        await tx.adSpendDaily.createMany({ data: rows.slice(i, i + 500).map((row) => ({
          tenantId,
          platform: 'Meta',
          date: new Date(`${row.date_start}T00:00:00.000Z`),
          accountId: account,
          campaignId: row.campaign_id,
          campaignName: row.campaign_name || row.campaign_id,
          adsetId: row.adset_id,
          adsetName: row.adset_name || row.adset_id,
          adId: row.ad_id,
          adName: row.ad_name || row.ad_id,
          spend: row.spend || '0',
          impressions: Number(row.impressions || 0),
          clicks: Number(row.clicks || 0),
        })), skipDuplicates: true });
      }
    }, { timeout: 120000 });
    const ids = [...new Set(rows.flatMap((row) => [row.campaign_id, row.adset_id, row.ad_id]))];
    const entityStatuses: Record<string, string> = {};
    try {
      for (let i = 0; i < ids.length; i += 50) {
        const batchIds = ids.slice(i, i + 50);
        const body = new URLSearchParams({ batch: JSON.stringify(batchIds.map((id) => ({ method: 'GET', relative_url: `${id}?fields=id,effective_status` }))) });
        const response = await fetch(`https://graph.facebook.com/${metaGraphVersion()}/`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/x-www-form-urlencoded' }, body, cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok || !Array.isArray(payload)) throw new Error(payload.error?.message || 'Falha ao consultar status de anúncios');
        for (let index = 0; index < payload.length; index++) {
          if (payload[index].code !== 200) continue;
          const status = JSON.parse(payload[index].body || '{}').effective_status;
          if (status) entityStatuses[batchIds[index]] = status;
        }
      }
    } catch { /* Insights remain available if Meta does not allow status lookup. */ }
    const fresh = await db.integration.findUnique({ where: { id: integration.id }, select: { metadata: true } });
    const metadata = fresh?.metadata && typeof fresh.metadata === 'object' && !Array.isArray(fresh.metadata) ? fresh.metadata as Record<string, unknown> : {};
    await db.integration.update({ where: { id: integration.id }, data: { status: 'CONNECTED', lastSyncAt: new Date(), lastError: null, metadata: { ...metadata, entityStatuses } } });
    return rows.length;
  } catch (error: any) {
    await db.integration.update({ where: { id: integration.id }, data: { status: 'ERROR', lastError: String(error?.message || 'meta_sync_failed').slice(0, 1000) } });
    throw error;
  }
}

export async function syncConnectedMetaTenants(days = 3) {
  const connections = await db.integration.findMany({ where: { provider: 'Meta Ads', status: { in: ['CONNECTED', 'ERROR'] }, accessTokenEncrypted: { not: null } }, select: { tenantId: true } });
  const results = [];
  for (const connection of connections) {
    try { results.push({ tenantId: connection.tenantId, ok: true, rows: await syncMetaAds(days, connection.tenantId) }); }
    catch (error: any) { results.push({ tenantId: connection.tenantId, ok: false, error: String(error?.message || 'meta_sync_failed') }); }
  }
  return results;
}
