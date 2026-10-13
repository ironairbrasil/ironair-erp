import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { encryptSecret } from '@/lib/crypto-secrets';
import { exchangeMercadoLivreCode, getMercadoLivreRedirectUri, readMercadoLivreState, syncMercadoLivreOrders, upsertMercadoLivreWebhooks } from '@/lib/mercadolivre';

export const runtime = 'nodejs';

function expiresAt(expiresIn: unknown){
  const seconds = Number(expiresIn || 0);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(Date.now() + seconds * 1000).toISOString() : undefined;
}

export async function GET(req: Request){
  try{
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    if(error) return NextResponse.json({ ok: false, error }, { status: 400 });
    if(!code) return NextResponse.json({ ok: false, error: 'code ausente' }, { status: 400 });
    const tenantId = readMercadoLivreState(url.searchParams.get('state')).tenantId;
    const token = await exchangeMercadoLivreCode(code, getMercadoLivreRedirectUri(req));
    const existing = await db.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: 'Mercado Livre' } } });
    const refreshTokenEncrypted = token.refresh_token ? encryptSecret(token.refresh_token) : existing?.refreshTokenEncrypted || null;
    const metadata = { ...((existing?.metadata as Record<string, unknown>) || {}), expiresAt: expiresAt(token.expires_in), tokenType: token.token_type, userId: token.user_id, refreshTokenAvailable: Boolean(refreshTokenEncrypted), connectedAt: new Date().toISOString() };
    const integration = await db.integration.upsert({
      where: { tenantId_provider: { tenantId, provider: 'Mercado Livre' } },
      create: {
        tenantId,
        provider: 'Mercado Livre',
        mode: 'OAUTH',
        status: 'CONNECTED',
        externalAccountId: token.user_id ? String(token.user_id) : null,
        accessTokenEncrypted: encryptSecret(token.access_token),
        refreshTokenEncrypted,
        scopes: token.scope,
        metadata,
        connectedAt: new Date(),
        config: { hidden: false }
      },
      update: {
        mode: 'OAUTH',
        status: 'CONNECTED',
        externalAccountId: token.user_id ? String(token.user_id) : undefined,
        accessTokenEncrypted: encryptSecret(token.access_token),
        refreshTokenEncrypted: refreshTokenEncrypted || undefined,
        scopes: token.scope,
        metadata,
        connectedAt: new Date(),
        disconnectedAt: null,
        lastError: null,
        config: { hidden: false }
      }
    });
    let user: any = null;
    try{
      const userRes = await fetch('https://api.mercadolibre.com/users/me', { headers: { authorization: `Bearer ${token.access_token}` }, cache: 'no-store' });
      user = await userRes.json().catch(() => null);
      if(!userRes.ok) throw new Error(user?.message || user?.error || 'users_me_failed');
      await db.integration.update({
        where: { id: integration.id },
        data: { externalAccountId: user?.id ? String(user.id) : integration.externalAccountId, metadata: { ...metadata, user } }
      });
    }catch(e: any){
      await db.integration.update({ where: { id: integration.id }, data: { lastError: (e?.message || 'users_me_failed').slice(0, 1000) } });
    }
    await upsertMercadoLivreWebhooks(tenantId, integration.id, new URL(req.url).origin);
    try{
      await syncMercadoLivreOrders(365, tenantId);
    }catch(e: any){
      await db.integration.update({ where: { id: integration.id }, data: { lastError: (e?.message || 'mercado_livre_initial_sync_failed').slice(0, 1000) } });
    }
    return NextResponse.redirect(new URL('/?integration=mercadolivre-connected', req.url));
  }catch(e: any){
    return NextResponse.json({ ok: false, error: e?.message || 'mercado_livre_callback_failed' }, { status: 400 });
  }
}
