import crypto from 'crypto';

type MetaState = { tenantId: string; userId: string; nonce: string; createdAt: number };

function secret() {
  const value = process.env.META_APP_SECRET;
  if (!value) throw new Error('META_APP_SECRET ausente');
  return value;
}

export function metaRedirectUri() {
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!origin || !/^https?:\/\//.test(origin)) throw new Error('NEXT_PUBLIC_APP_URL inválida');
  return `${origin.replace(/\/$/, '')}/api/integrations/meta/callback`;
}

export function signMetaState(state: MetaState) {
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function readMetaState(raw: string | null): MetaState {
  if (!raw) throw new Error('state ausente');
  const [payload, signature] = raw.split('.');
  if (!payload || !signature) throw new Error('state inválido');
  const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error('state inválido');
  const state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as MetaState;
  if (!state.tenantId || !state.userId || !state.nonce || !Number.isFinite(state.createdAt) || Date.now() - state.createdAt > 10 * 60_000 || state.createdAt > Date.now() + 60_000) throw new Error('state expirado');
  return state;
}
