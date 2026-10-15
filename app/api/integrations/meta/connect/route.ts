import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { encryptSecret } from '@/lib/crypto-secrets';
import { requireIngestSecret } from '@/lib/security';
import { exchangeLongLivedMetaToken, metaGraphVersion } from '@/lib/meta-token';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    requireIngestSecret(req);
    const body = await req.json();
    const tenantId = String(body.tenantId || '');
    const accountId = String(body.accountId || '').replace(/^act_/, '');
    const token = String(body.accessToken || '');
    if (!tenantId || !/^\d+$/.test(accountId) || !token) {
      return NextResponse.json({ ok: false, error: 'tenantId, accountId, accessToken e versão Meta válidos são obrigatórios' }, { status: 400 });
    }
    const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) return NextResponse.json({ ok: false, error: 'Empresa não encontrada' }, { status: 404 });
    const version = metaGraphVersion();
    const url = new URL(`https://graph.facebook.com/${version}/act_${accountId}`);
    url.searchParams.set('fields', 'id,name');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    const account = await response.json();
    if (!response.ok || account.id !== `act_${accountId}`) {
      return NextResponse.json({ ok: false, error: 'Token sem acesso à conta de anúncios informada' }, { status: 400 });
    }
    const insightUrl = new URL(`https://graph.facebook.com/${version}/act_${accountId}/insights`);
    insightUrl.searchParams.set('fields', 'spend');
    insightUrl.searchParams.set('limit', '1');
    const insightResponse = await fetch(insightUrl, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!insightResponse.ok) return NextResponse.json({ ok: false, error: 'Token sem permissão para ler métricas de anúncios' }, { status: 400 });
    const extended = await exchangeLongLivedMetaToken(token).catch(() => null);
    const storedToken = extended?.token || token;
    await db.integration.upsert({
      where: { tenantId_provider: { tenantId, provider: 'Meta Ads' } },
      create: { tenantId, provider: 'Meta Ads', mode: 'OAUTH', status: 'CONNECTED', externalAccountId: account.id, accessTokenEncrypted: encryptSecret(storedToken), connectedAt: new Date(), config: { hidden: false }, metadata: { accountName: account.name || null, expiresAt: extended?.expiresAt || null } },
      update: { mode: 'OAUTH', status: 'CONNECTED', externalAccountId: account.id, accessTokenEncrypted: encryptSecret(storedToken), connectedAt: new Date(), disconnectedAt: null, lastError: null, config: { hidden: false }, metadata: { accountName: account.name || null, expiresAt: extended?.expiresAt || null } }
    });
    return NextResponse.json({ ok: true, accountId: account.id, accountName: account.name || null });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message === 'unauthorized' ? 'unauthorized' : 'meta_connect_failed' }, { status: error?.message === 'unauthorized' ? 401 : 500 });
  }
}
