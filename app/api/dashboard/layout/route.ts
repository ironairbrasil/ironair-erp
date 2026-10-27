import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';

const allowed = new Set([...Array.from({ length: 16 }, (_, i) => `kpi-${i}`), 'performance-margin', 'performance-meta-ads', 'performance-google-ads', 'performance-tiktok-ads', 'timeline', 'alerts', 'channels', 'inventory', 'performance-insights', 'performance-location', 'performance-dre', 'performance-channels', 'performance-campaigns']);

export async function GET(req: Request) {
  try {
    const tenantId = await getTenantId(req);
    const saved = await db.dashboardLayout.findUnique({ where: { tenantId } });
    const stored = saved?.layout;
    const layout = Array.isArray(stored) ? stored : stored && typeof stored === 'object' && Array.isArray((stored as any).order) ? (stored as any).order : null;
    const widths = stored && !Array.isArray(stored) && typeof stored === 'object' && (stored as any).widths && typeof (stored as any).widths === 'object' ? (stored as any).widths : {};
    return NextResponse.json({ layout, widths, expanded: saved?.expanded ?? false, updatedAt: saved?.updatedAt ?? null });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Falha ao carregar layout' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const tenantId = await getTenantId(req);
    const body = await req.json();
    const layout = body.layout;
    if (!Array.isArray(layout) || new Set(layout).size !== layout.length || layout.some((id) => typeof id !== 'string' || !allowed.has(id))) {
      return NextResponse.json({ ok: false, error: 'Layout inválido' }, { status: 400 });
    }
    const widths = body.widths && typeof body.widths === 'object' ? Object.fromEntries(Object.entries(body.widths).filter(([id, width]) => allowed.has(id) && Number.isInteger(Number(width)) && Number(width) >= 1 && Number(width) <= 4).map(([id, width]) => [id, Number(width)])) : {};
    const expanded = Boolean(body.expanded);
    const saved = await db.dashboardLayout.upsert({
      where: { tenantId },
      create: { tenantId, layout: { order: layout, widths }, expanded },
      update: { layout: { order: layout, widths }, expanded },
    });
    return NextResponse.json({ ok: true, updatedAt: saved.updatedAt });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Falha ao salvar layout' }, { status: 500 });
  }
}
