import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/supabase-auth';

export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth?.id || !auth.email || !auth.email_confirmed_at) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    const body = await req.json();
    const name = String(body.name || '').trim();
    if (name.length < 2 || name.length > 100) return NextResponse.json({ ok: false, error: 'Nome da empresa inválido' }, { status: 400 });
    const email = auth.email.toLowerCase();
    const tenant = await db.$transaction(async tx => {
      const existing = await tx.user.findUnique({ where: { email } });
      if (existing && existing.id !== auth.id) throw new Error('forbidden');
      const user = existing || await tx.user.create({ data: { id: auth.id, email } });
      const created = await tx.tenant.create({ data: { name, slug: `org-${crypto.randomUUID()}` } });
      await tx.organization.create({ data: { tenantId: created.id, name } });
      await tx.membership.create({ data: { tenantId: created.id, userId: user.id, role: 'OWNER' } });
      return created;
    });
    return NextResponse.json({ ok: true, tenantId: tenant.id });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message === 'forbidden' ? 'forbidden' : 'Falha ao criar empresa' }, { status: error?.message === 'forbidden' ? 403 : 500 });
  }
}
