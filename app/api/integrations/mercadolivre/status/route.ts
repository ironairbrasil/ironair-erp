import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';

export async function GET(req: Request){
  const tenantId = await getTenantId(req);
  const integration = await db.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: 'Mercado Livre' } }, include: { webhooks: true } });
  const configured = Boolean((process.env.MERCADO_LIVRE_CLIENT_ID || process.env.ML_CLIENT_ID) && (process.env.MERCADO_LIVRE_CLIENT_SECRET || process.env.ML_CLIENT_SECRET));
  const connected = Boolean(integration?.status === 'CONNECTED' && integration?.accessTokenEncrypted);
  const expiresAt = (integration?.metadata as any)?.expiresAt as string | undefined;
  const requiresReconnect = connected && !integration?.refreshTokenEncrypted;
  return NextResponse.json({
    provider: 'Mercado Livre',
    status: connected ? 'CONNECTED' : 'DISCONNECTED',
    mode: integration?.mode || 'OAUTH',
    configured,
    externalAccountId: connected ? integration?.externalAccountId || null : null,
    user: connected ? (integration?.metadata as any)?.user || null : null,
    expiresAt: connected ? expiresAt || null : null,
    requiresReconnect,
    refreshTokenAvailable: connected && Boolean(integration?.refreshTokenEncrypted),
    lastSyncAt: connected ? integration?.lastSyncAt || null : null,
    lastError: integration?.lastError || null,
    connectedAt: connected ? integration?.connectedAt || null : null,
    webhooks: integration?.webhooks.map(w => ({ topic: w.topic, status: w.status, callbackUrl: w.callbackUrl, lastRegisteredAt: w.lastRegisteredAt, lastError: w.lastError })) || []
  });
}
