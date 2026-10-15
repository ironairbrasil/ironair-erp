import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/supabase-auth';
import { getTenantId } from '@/lib/tenant';

export async function GET(req: Request) {
  const auth = await getAuthUser(req);
  if (!auth?.id || !auth.email || !auth.email_confirmed_at) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (auth.email.toLowerCase() === process.env.SAAS_BOOTSTRAP_OWNER_EMAIL?.toLowerCase()) await getTenantId(req);
  const user = await db.user.findUnique({ where: { email: auth.email.toLowerCase() }, include: { memberships: { include: { tenant: true } } } });
  if (user && user.id !== auth.id) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const tenants = user?.memberships.map(row => ({ id: row.tenantId, name: row.tenant.name, role: row.role })) || [];
  const activeTenantId = tenants.length ? await getTenantId(req) : null;
  return NextResponse.json({ ok: true, email: auth.email, displayName: auth.user_metadata?.full_name || auth.user_metadata?.name || null, companyName: auth.user_metadata?.company_name || null, tenants, activeTenantId });
}
