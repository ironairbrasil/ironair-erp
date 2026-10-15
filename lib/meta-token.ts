import { db } from './db';
import { decryptSecret, encryptSecret } from './crypto-secrets';

export function metaGraphVersion() {
  const version = process.env.META_GRAPH_API_VERSION;
  if (!version || !/^v\d+\.\d+$/.test(version)) throw new Error('META_GRAPH_API_VERSION inválida ou ausente');
  return version;
}

export async function exchangeLongLivedMetaToken(token: string) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return null;
  const url = new URL(`https://graph.facebook.com/${metaGraphVersion()}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('fb_exchange_token', token);
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error(`Falha na troca do token Meta: ${payload.error?.message || response.status}`);
  const expiresIn = Number(payload.expires_in || 0);
  return { token: String(payload.access_token), expiresAt: expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null };
}

export async function currentMetaToken(integration: { id: string; accessTokenEncrypted: string | null; metadata: unknown }) {
  if (!integration.accessTokenEncrypted) throw new Error('Token Meta ausente');
  const current = decryptSecret(integration.accessTokenEncrypted);
  const metadata = (integration.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata)) ? integration.metadata as Record<string, unknown> : {};
  const expiresAt = typeof metadata.expiresAt === 'string' ? Date.parse(metadata.expiresAt) : NaN;
  const lastFailedAt = typeof metadata.refreshFailedAt === 'string' ? Date.parse(metadata.refreshFailedAt) : NaN;
  if (!Number.isFinite(expiresAt) && Number.isFinite(lastFailedAt) && Date.now() - lastFailedAt < 864e5) return current;
  if (!process.env.META_APP_SECRET || (Number.isFinite(expiresAt) && expiresAt - Date.now() > 7 * 864e5)) return current;
  try {
    const refreshed = await exchangeLongLivedMetaToken(current);
    if (!refreshed) return current;
    await db.integration.update({ where: { id: integration.id }, data: { accessTokenEncrypted: encryptSecret(refreshed.token), metadata: { ...metadata, expiresAt: refreshed.expiresAt, refreshedAt: new Date().toISOString(), refreshError: null, refreshFailedAt: null } } });
    return refreshed.token;
  } catch (error: any) {
    await db.integration.update({ where: { id: integration.id }, data: { metadata: { ...metadata, refreshError: String(error?.message || 'refresh_failed').slice(0, 500), refreshFailedAt: new Date().toISOString() } } });
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) throw new Error('Token Meta expirado e não renovado');
    return current;
  }
}
