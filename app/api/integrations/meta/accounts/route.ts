import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { decryptSecret } from '@/lib/crypto-secrets';
import { getAuthUser } from '@/lib/supabase-auth';
import { requireTenantAdmin } from '@/lib/tenant';
import { metaGraphVersion } from '@/lib/meta-token';
import { syncMetaAds } from '@/lib/meta-ads';

function pendingFrom(metadata: unknown) {
  const root = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata as Record<string, any> : {};
  return { root, pending: root.oauthPending as { userId: string; tokenEncrypted: string; expiresAt: string | null; validUntil: number; accounts: { id: string; name: string }[] } | undefined };
}
async function context(req: Request) {
  const tenantId = await requireTenantAdmin(req);
  const user = await getAuthUser(req);
  const integration = await db.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: 'Meta Ads' } } });
  const { root, pending } = pendingFrom(integration?.metadata);
  if (!integration || !pending || pending.userId !== user?.id || pending.validUntil < Date.now()) throw new Error('Autorização expirada. Conecte a Meta novamente.');
  return { tenantId, integration, root, pending };
}
export async function GET(req: Request) {
  try { const { pending } = await context(req); return NextResponse.json({ ok: true, accounts: pending.accounts }); }
  catch (error: any) { return NextResponse.json({ ok: false, error: error?.message || 'meta_accounts_failed' }, { status: 400 }); }
}
export async function POST(req: Request) {
  try {
    const { tenantId, integration, root, pending } = await context(req);
    const accountId = String((await req.json()).accountId || '');
    const selected = pending.accounts.find(item => item.id === accountId);
    if (!selected) return NextResponse.json({ ok: false, error: 'Conta não autorizada' }, { status: 400 });
    const token = decryptSecret(pending.tokenEncrypted);
    const insightsUrl = new URL(`https://graph.facebook.com/${metaGraphVersion()}/${accountId}/insights`);
    insightsUrl.searchParams.set('fields', 'spend'); insightsUrl.searchParams.set('limit', '1');
    const check = await fetch(insightsUrl, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!check.ok) return NextResponse.json({ ok: false, error: 'Token sem permissão para ler métricas desta conta' }, { status: 400 });
    const metadata = { ...root }; delete metadata.oauthPending;
    await db.integration.update({ where: { id: integration.id }, data: { mode: 'OAUTH', status: 'CONNECTED', externalAccountId: accountId, accessTokenEncrypted: pending.tokenEncrypted, scopes: 'ads_read,read_insights', connectedAt: new Date(), disconnectedAt: null, lastError: null, config: { hidden: false }, metadata: { ...metadata, accountName: selected.name, expiresAt: pending.expiresAt } } });
    let rows: number | null = null;
    try { rows = await syncMetaAds(90, tenantId); } catch { /* connection stays visible with its sync error */ }
    return NextResponse.json({ ok: true, accountId, rows });
  } catch (error: any) { return NextResponse.json({ ok: false, error: error?.message || 'meta_account_select_failed' }, { status: 400 }); }
}
