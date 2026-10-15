import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireIngestSecret } from '@/lib/security';

export async function POST(req: Request) {
  try {
    requireIngestSecret(req);
    const body = await req.json();
    const tenantId = String(body.tenantId || '');
    if (!tenantId) return NextResponse.json({ ok: false, error: 'tenantId obrigatório' }, { status: 400 });
    await db.integration.updateMany({
      where: { tenantId, provider: 'Meta Ads' },
      data: { status: 'DISCONNECTED', accessTokenEncrypted: null, refreshTokenEncrypted: null, scopes: null, disconnectedAt: new Date(), lastError: null }
    });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message === 'unauthorized' ? 'unauthorized' : 'meta_disconnect_failed' }, { status: error?.message === 'unauthorized' ? 401 : 500 });
  }
}
