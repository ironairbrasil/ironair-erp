import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { requireTenantAdmin } from '@/lib/tenant';
import { getAuthUser } from '@/lib/supabase-auth';
import { metaRedirectUri, signMetaState } from '@/lib/meta-oauth';
import { metaGraphVersion } from '@/lib/meta-token';

export async function POST(req: Request) {
  try {
    const tenantId = await requireTenantAdmin(req);
    const user = await getAuthUser(req);
    const appId = process.env.META_APP_ID;
    if (!appId || !process.env.META_APP_SECRET || !user?.id) throw new Error('App Meta não configurado');
    const nonce = crypto.randomBytes(24).toString('base64url');
    const state = signMetaState({ tenantId, userId: user.id, nonce, createdAt: Date.now() });
    const url = new URL(`https://www.facebook.com/${metaGraphVersion()}/dialog/oauth`);
    url.searchParams.set('client_id', appId);
    url.searchParams.set('redirect_uri', metaRedirectUri());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'ads_read,read_insights');
    url.searchParams.set('state', state);
    const response = NextResponse.json({ ok: true, url: url.toString() });
    response.cookies.set('meta_oauth_nonce', nonce, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/integrations/meta', maxAge: 600 });
    return response;
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'meta_authorize_failed' }, { status: error?.message === 'unauthorized' ? 401 : 400 });
  }
}
