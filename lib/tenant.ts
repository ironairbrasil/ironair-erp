import { db } from './db';
import { getAuthUser } from './supabase-auth';

export const DEFAULT_TENANT_ID = 'tenant_ironair_dev';
export const DEFAULT_TENANT_SLUG = 'iron-air-dev';
export const DEFAULT_TENANT_NAME = 'Iron Air Brasil';

export async function ensureDefaultTenant(){
  const tenant = await db.tenant.upsert({
    where: { slug: DEFAULT_TENANT_SLUG },
    create: { id: DEFAULT_TENANT_ID, slug: DEFAULT_TENANT_SLUG, name: DEFAULT_TENANT_NAME },
    update: { name: DEFAULT_TENANT_NAME }
  });
  await db.organization.upsert({
    where: { tenantId: tenant.id },
    create: { id: 'org_ironair_dev', tenantId: tenant.id, name: DEFAULT_TENANT_NAME },
    update: { name: DEFAULT_TENANT_NAME }
  });
  return tenant;
}

export async function getTenantId(req?: Request){
  if(!req) return DEFAULT_TENANT_ID;
  const auth = await getAuthUser(req);
  if(!auth?.id || !auth.email || !auth.email_confirmed_at) throw new Error('unauthorized');
  const email = auth.email.toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if(existing && existing.id !== auth.id) throw new Error('forbidden');
  const user = existing || await db.user.create({ data: { id: auth.id, email } });
  let memberships = await db.membership.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
  if(!memberships.length && email === process.env.SAAS_BOOTSTRAP_OWNER_EMAIL?.toLowerCase()){
    await db.membership.upsert({ where: { tenantId_userId: { tenantId: DEFAULT_TENANT_ID, userId: user.id } }, create: { tenantId: DEFAULT_TENANT_ID, userId: user.id, role: 'OWNER' }, update: {} });
    memberships = await db.membership.findMany({ where: { userId: user.id } });
  }
  if(!memberships.length) throw new Error('no_membership');
  const cookieTenant = req.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith('ironair_tenant='))?.slice('ironair_tenant='.length);
  const requested = req.headers.get('x-tenant-id')?.trim() || cookieTenant;
  const membership = requested ? memberships.find(row => row.tenantId === requested) : memberships[0];
  if(!membership) throw new Error('forbidden');
  return membership.tenantId;
}

export async function requireTenantAdmin(req: Request) {
  const tenantId = await getTenantId(req);
  const auth = await getAuthUser(req);
  const membership = await db.membership.findUnique({ where: { tenantId_userId: { tenantId, userId: auth!.id } } });
  if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) throw new Error('forbidden');
  return tenantId;
}

export async function getServiceTenantId(req: Request) {
  const requested = req.headers.get('x-tenant-id')?.trim();
  if (!requested) return DEFAULT_TENANT_ID;
  const tenant = await db.tenant.findUnique({ where: { id: requested }, select: { id: true } });
  if (!tenant) throw new Error('tenant_not_found');
  return tenant.id;
}
