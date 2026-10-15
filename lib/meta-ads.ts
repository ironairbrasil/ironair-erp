import { db } from './db';
import { currentMetaToken, metaGraphVersion } from './meta-token';

type Insight = {
  date_start: string;
  account_id: string;
  campaign_id: string;
  campaign_name: string;
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
  url.searchParams.set('level', 'campaign');
  url.searchParams.set('time_increment', '1');
  url.searchParams.set('time_range', JSON.stringify({ since, until }));
  url.searchParams.set('fields', 'date_start,account_id,campaign_id,campaign_name,spend,impressions,clicks');
  url.searchParams.set('limit', '500');
  let count = 0;
  let after: string | undefined;
  try {
    const token = await currentMetaToken(integration);
    for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
      if (after) url.searchParams.set('after', after);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const payload: InsightPage = await response.json();
      if (!response.ok) throw new Error(`Meta API ${response.status}: ${payload.error?.message || 'erro desconhecido'}`);
      for (const row of payload.data || []) {
        if (!row.date_start || !row.campaign_id) continue;
        if (row.account_id !== account) throw new Error('A Meta retornou dados de outra conta de anúncios');
        const key = { tenantId, platform: 'Meta', date: new Date(`${row.date_start}T00:00:00.000Z`), accountId: account, campaignId: row.campaign_id, adsetId: '', adId: '' };
        await db.adSpendDaily.upsert({
          where: { tenantId_platform_date_accountId_campaignId_adsetId_adId: key },
          create: { ...key, campaignName: row.campaign_name || row.campaign_id, spend: row.spend || '0', impressions: Number(row.impressions || 0), clicks: Number(row.clicks || 0) },
          update: { campaignName: row.campaign_name || row.campaign_id, spend: row.spend || '0', impressions: Number(row.impressions || 0), clicks: Number(row.clicks || 0) }
        });
        count++;
      }
      const cursor = payload.paging?.next ? payload.paging.cursors?.after || new URL(payload.paging.next).searchParams.get('after') || undefined : undefined;
      if (!cursor || !payload.data?.length || cursor === after) break;
      after = cursor;
      if (pageNumber === 99) throw new Error('Limite de paginação da Meta atingido');
    }
    await db.integration.update({ where: { id: integration.id }, data: { status: 'CONNECTED', lastSyncAt: new Date(), lastError: null } });
    return count;
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
