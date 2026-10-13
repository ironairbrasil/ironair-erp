import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';

export const runtime = 'nodejs';

export async function POST(req: Request){
  try{
    const tenantId = await getTenantId(req);
    const integration = await db.integration.update({
      where: { tenantId_provider: { tenantId, provider: 'Amazon' } },
      data: {
        status: 'DISCONNECTED',
        disconnectedAt: new Date(),
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        lastError: null
      }
    });
    await db.integrationWebhook.updateMany({ where: { tenantId, integrationId: integration.id }, data: { status: 'DISCONNECTED' } });
    return NextResponse.json({ ok: true });
  }catch(e: any){
    return NextResponse.json({ ok: false, error: e?.message || 'amazon_disconnect_failed' }, { status: 400 });
  }
}
