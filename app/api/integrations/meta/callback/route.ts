import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { encryptSecret } from '@/lib/crypto-secrets';
import { exchangeLongLivedMetaToken, metaGraphVersion } from '@/lib/meta-token';
import { metaRedirectUri, readMetaState } from '@/lib/meta-oauth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const fail = (reason: string) => NextResponse.redirect(new URL(`/integrations/meta/select?error=${encodeURIComponent(reason)}`, req.url));
  try {
    const query = req.nextUrl.searchParams;
    if (query.has('error')) return fail('Meta recusou a autorização');
    const state = readMetaState(query.get('state'));
    if (!req.cookies.get('meta_oauth_nonce')?.value || req.cookies.get('meta_oauth_nonce')?.value !== state.nonce) return fail('Sessão de autorização inválida');
    const code = query.get('code');
    if (!code) return fail('Código de autorização ausente');
    const member = await db.membership.findUnique({ where: { tenantId_userId: { tenantId: state.tenantId, userId: state.userId } } });
    if (!member || !['OWNER', 'ADMIN'].includes(member.role)) return fail('Acesso à empresa revogado');
    const tokenUrl = new URL(`https://graph.facebook.com/${metaGraphVersion()}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', process.env.META_APP_ID || '');
    tokenUrl.searchParams.set('client_secret', process.env.META_APP_SECRET || '');
    tokenUrl.searchParams.set('redirect_uri', metaRedirectUri());
    tokenUrl.searchParams.set('code', code);
    const tokenResponse = await fetch(tokenUrl, { cache: 'no-store' });
    const tokenPayload = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenPayload.access_token) return fail('Falha ao obter autorização da Meta');
    const extended = await exchangeLongLivedMetaToken(String(tokenPayload.access_token)).catch(() => null);
    const token = extended?.token || String(tokenPayload.access_token);
    const accountsUrl = new URL(`https://graph.facebook.com/${metaGraphVersion()}/me/adaccounts`);
    accountsUrl.searchParams.set('fields', 'id,name');
    accountsUrl.searchParams.set('limit', '100');
    const accountsResponse = await fetch(accountsUrl, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    const accountsPayload = await accountsResponse.json();
    if (!accountsResponse.ok) return fail('Sem acesso às contas de anúncios');
    const accounts = (Array.isArray(accountsPayload.data) ? accountsPayload.data : []).filter((item: any) => /^act_\d+$/.test(item.id)).map((item: any) => ({ id: item.id, name: String(item.name || item.id) }));
    if (!accounts.length) return fail('Nenhuma conta de anúncios disponível');
    const current = await db.integration.findUnique({ where: { tenantId_provider: { tenantId: state.tenantId, provider: 'Meta Ads' } } });
    const metadata = current?.metadata && typeof current.metadata === 'object' && !Array.isArray(current.metadata) ? current.metadata as Record<string, unknown> : {};
    const pending = { userId: state.userId, nonce: state.nonce, tokenEncrypted: encryptSecret(token), expiresAt: extended?.expiresAt || null, validUntil: Date.now() + 10 * 60_000, accounts };
    await db.integration.upsert({ where: { tenantId_provider: { tenantId: state.tenantId, provider: 'Meta Ads' } }, create: { tenantId: state.tenantId, provider: 'Meta Ads', mode: 'OAUTH', status: 'DISCONNECTED', metadata: { oauthPending: pending } }, update: { metadata: { ...metadata, oauthPending: pending } } });
    const response = NextResponse.redirect(new URL('/integrations/meta/select', req.url));
    response.cookies.set('meta_oauth_nonce', '', { path: '/api/integrations/meta', maxAge: 0 });
    return response;
  } catch { return fail('Não foi possível concluir a autorização Meta'); }
}
