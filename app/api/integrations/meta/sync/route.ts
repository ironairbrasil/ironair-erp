import { NextResponse } from 'next/server';
import { syncMetaAds } from '@/lib/meta-ads';
import { db } from '@/lib/db';
import { requireIngestSecret } from '@/lib/security';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    requireIngestSecret(req);
    const body = await req.json().catch(() => ({}));
    const tenantId = String(body.tenantId || '');
    if (!tenantId || !await db.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })) return NextResponse.json({ ok: false, error: 'Empresa inválida' }, { status: 400 });
    const rows = await syncMetaAds(Number(body.days) || 30, tenantId);
    return NextResponse.json({ ok: true, rows });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'meta_sync_failed' }, { status: error?.message === 'unauthorized' ? 401 : 500 });
  }
}
