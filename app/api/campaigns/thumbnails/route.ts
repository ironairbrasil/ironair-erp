import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';
import { currentMetaToken, metaGraphVersion } from '@/lib/meta-token';

const cache = new Map<string, { expires: number; thumbnails: Record<string, string> }>();

function safeThumbnail(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    if (!['fbcdn.net', 'facebook.com', 'fbsbx.com'].some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) return null;
    return url.toString();
  } catch { return null; }
}

export async function GET(req: Request) {
  try {
    const tenantId = await getTenantId(req);
    const integration = await db.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: 'Meta Ads' } } });
    if (!integration?.accessTokenEncrypted || !integration.externalAccountId || integration.status !== 'CONNECTED') return NextResponse.json({ thumbnails: {} });
    const account = integration.externalAccountId.replace(/^act_/, '');
    if (!/^\d+$/.test(account)) throw new Error('Conta Meta inválida');
    const key = `${tenantId}:${account}`;
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return NextResponse.json({ thumbnails: cached.thumbnails });
    const token = await currentMetaToken(integration);
    const url = new URL(`https://graph.facebook.com/${metaGraphVersion()}/act_${account}/ads`);
    url.searchParams.set('fields', 'id,creative{id,thumbnail_url}');
    url.searchParams.set('limit', '500');
    const thumbnails: Record<string, string> = {};
    let after: string | undefined;
    for (let page = 0; page < 20; page++) {
      if (after) url.searchParams.set('after', after);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(`Meta API ${response.status}: ${body.error?.message || 'falha ao carregar miniaturas'}`);
      for (const row of body.data || []) {
        if (!/^\d+$/.test(String(row.id))) continue;
        const thumbnail = safeThumbnail(row.creative?.thumbnail_url);
        if (thumbnail) thumbnails[row.id] = thumbnail;
      }
      const next: string | undefined = body.paging?.next;
      const cursor: string | undefined = next ? body.paging?.cursors?.after || new URL(next).searchParams.get('after') || undefined : undefined;
      if (!cursor || cursor === after) break;
      after = cursor;
      if (page === 19) throw new Error('Limite de paginação de anúncios Meta atingido');
    }
    cache.set(key, { expires: Date.now() + 5 * 60_000, thumbnails });
    if (cache.size > 100) for (const [cacheKey, entry] of cache) if (entry.expires < Date.now()) cache.delete(cacheKey);
    return NextResponse.json({ thumbnails });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Falha ao buscar miniaturas Meta' }, { status: 400 });
  }
}
