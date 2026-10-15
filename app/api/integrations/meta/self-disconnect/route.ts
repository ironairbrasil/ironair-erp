import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireTenantAdmin } from '@/lib/tenant';
export async function POST(req: Request) {
  try {
    const tenantId = await requireTenantAdmin(req);
    await db.integration.updateMany({ where: { tenantId, provider: 'Meta Ads' }, data: { status: 'DISCONNECTED', accessTokenEncrypted: null, refreshTokenEncrypted: null, scopes: null, metadata: {}, disconnectedAt: new Date(), lastError: null } });
    return NextResponse.json({ ok: true });
  } catch (error: any) { return NextResponse.json({ ok: false, error: error?.message || 'meta_disconnect_failed' }, { status: 403 }); }
}
