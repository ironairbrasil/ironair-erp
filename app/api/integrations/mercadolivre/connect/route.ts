import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getTenantId } from '@/lib/tenant';
import { getMercadoLivreRedirectUri, MERCADO_LIVRE_AUTH_URL, signMercadoLivreState } from '@/lib/mercadolivre';

export const runtime = 'nodejs';

export async function GET(req: Request){
  const clientId = process.env.MERCADO_LIVRE_CLIENT_ID || process.env.ML_CLIENT_ID;
  if(!clientId) return NextResponse.json({ ok: false, error: 'MERCADO_LIVRE_CLIENT_ID ausente no servidor' }, { status: 500 });
  const tenantId = await getTenantId(req);
  const state = signMercadoLivreState({ tenantId, nonce: crypto.randomBytes(16).toString('hex'), createdAt: Date.now() });
  const url = new URL(MERCADO_LIVRE_AUTH_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', getMercadoLivreRedirectUri(req));
  url.searchParams.set('state', state);
  return NextResponse.redirect(url);
}
