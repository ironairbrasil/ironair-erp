import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';

const allowed = new Set([...Array.from({ length: 16 }, (_, i) => `kpi-${i}`), 'timeline', 'alerts', 'channels', 'inventory']);

export async function GET(req: Request) {
  try {
    const tenantId = await getTenantId(req);
    const saved = await db.dashboardLayout.findUnique({ where: { tenantId } });
    return NextResponse.json({ layout: saved?.layout ?? null, expanded: saved?.expanded ?? false, updatedAt: saved?.updatedAt ?? null });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Falha ao carregar layout' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const tenantId = await getTenantId(req);
    const body = await req.json();
    const layout = body.layout;
    if (!Array.isArray(layout) || layout.length !== allowed.size || new Set(layout).size !== allowed.size || layout.some((id) => typeof id !== 'string' || !allowed.has(id))) {
      return NextResponse.json({ ok: false, error: 'Layout inválido' }, { status: 400 });
    }
    const expanded = Boolean(body.expanded);
    const saved = await db.dashboardLayout.upsert({
      where: { tenantId },
      create: { tenantId, layout, expanded },
      update: { layout, expanded },
    });
    return NextResponse.json({ ok: true, updatedAt: saved.updatedAt });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Falha ao salvar layout' }, { status: 500 });
  }
}
