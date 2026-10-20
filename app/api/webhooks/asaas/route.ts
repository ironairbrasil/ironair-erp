import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { decryptSecret } from '@/lib/crypto-secrets';
import { ASAAS_EVENTS } from '@/lib/asaas';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const token = req.headers.get('asaas-access-token') || '';
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const integrations = await db.integration.findMany({ where: { provider: 'Asaas', status: 'CONNECTED', webhookSecretEncrypted: { not: null } } });
  const integration = integrations.find(row => {
    const expected = decryptSecret(row.webhookSecretEncrypted!);
    return token.length === expected.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  });
  if (!integration) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let payload: any;
  try { payload = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  if (!ASAAS_EVENTS.includes(payload?.event) || !payload?.id || !payload?.transfer?.id) return NextResponse.json({ error: 'invalid_event' }, { status: 400 });
  const raw = JSON.stringify(payload);
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  await db.webhookReceipt.upsert({ where: { tenantId_provider_eventId: { tenantId: integration.tenantId, provider: 'Asaas', eventId: String(payload.id) } }, create: { tenantId: integration.tenantId, provider: 'Asaas', eventId: String(payload.id), eventType: String(payload.event), payloadHash: hash, processedAt: new Date() }, update: {} });
  await db.integration.update({ where: { id: integration.id }, data: { lastSyncAt: new Date(), lastError: null } });
  return NextResponse.json({ ok: true });
}
