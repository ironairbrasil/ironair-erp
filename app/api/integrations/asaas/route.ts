import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { encryptSecret, decryptSecret } from '@/lib/crypto-secrets';
import { requireTenantAdmin } from '@/lib/tenant';
import { asaasRequest, ASAAS_EVENTS } from '@/lib/asaas';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const tenantId = await requireTenantAdmin(req);
    const row = await db.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: 'Asaas' } }, include: { webhooks: true } });
    return NextResponse.json({ status: row?.status || 'DISCONNECTED', connectedAt: row?.connectedAt, lastError: row?.lastError, webhook: row?.webhooks[0] ? { status: row.webhooks[0].status, callbackUrl: row.webhooks[0].callbackUrl, lastError: row.webhooks[0].lastError } : null });
  } catch { return NextResponse.json({ error: 'Não autorizado' }, { status: 401 }); }
}

export async function POST(req: Request) {
  try {
    const tenantId = await requireTenantAdmin(req);
    const body = await req.json();
    const accessToken = String(body.accessToken || '').trim();
    if (!/^\$aact_prod_[A-Za-z0-9_:$-]{30,}$/.test(accessToken)) return NextResponse.json({ error: 'Chave de produção do Asaas inválida' }, { status: 400 });
    await asaasRequest(accessToken, '/myAccount');
    await asaasRequest(accessToken, '/transfers?limit=1&offset=0');
    await db.integration.upsert({ where: { tenantId_provider: { tenantId, provider: 'Asaas' } }, create: { tenantId, provider: 'Asaas', status: 'CONNECTED', mode: 'DEV_MANUAL', accessTokenEncrypted: encryptSecret(accessToken), connectedAt: new Date(), config: { hidden: false } }, update: { status: 'CONNECTED', accessTokenEncrypted: encryptSecret(accessToken), connectedAt: new Date(), disconnectedAt: null, lastError: null, config: { hidden: false } } });
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao conectar Asaas' }, { status: 400 }); }
}

export async function PUT(req: Request) {
  try {
    const tenantId = await requireTenantAdmin(req);
    const { callbackUrl, email } = await req.json();
    const url = new URL(String(callbackUrl));
    if (url.protocol !== 'https:' || !url.pathname.endsWith('/api/webhooks/asaas')) throw new Error('Informe uma URL HTTPS pública terminada em /api/webhooks/asaas.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) throw new Error('Informe um e-mail para falhas do webhook.');
    const integration = await db.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: 'Asaas' } }, include: { webhooks: true } });
    if (!integration?.accessTokenEncrypted) throw new Error('Conecte o Asaas primeiro.');
    const token = decryptSecret(integration.accessTokenEncrypted);
    const existing = integration.webhooks.find(w => w.topic === 'transfers');
    const authToken = existing && integration.webhookSecretEncrypted ? decryptSecret(integration.webhookSecretEncrypted) : crypto.randomBytes(32).toString('hex');
    const payload = { name: 'Iron Seller - Saques', url: url.toString(), email: String(email), enabled: true, interrupted: false, apiVersion: 3, authToken, sendType: 'SEQUENTIALLY', events: ASAAS_EVENTS };
    const remote = existing?.externalWebhookId ? await asaasRequest(token, `/webhooks/${encodeURIComponent(existing.externalWebhookId)}`, { method: 'PUT', body: JSON.stringify(payload) }) : await asaasRequest(token, '/webhooks', { method: 'POST', body: JSON.stringify(payload) });
    await db.integration.update({ where: { id: integration.id }, data: { webhookSecretEncrypted: encryptSecret(authToken) } });
    await db.integrationWebhook.upsert({ where: { integrationId_topic: { integrationId: integration.id, topic: 'transfers' } }, create: { tenantId, integrationId: integration.id, provider: 'Asaas', topic: 'transfers', callbackUrl: url.toString(), externalWebhookId: String(remote.id), status: 'ACTIVE', lastRegisteredAt: new Date() }, update: { callbackUrl: url.toString(), externalWebhookId: String(remote.id), status: 'ACTIVE', lastRegisteredAt: new Date(), lastError: null } });
    return NextResponse.json({ ok: true, webhookId: remote.id });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao criar webhook' }, { status: 400 }); }
}
