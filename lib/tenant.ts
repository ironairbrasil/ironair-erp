import { db } from './db';

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
  const headerTenant = req?.headers.get('x-tenant-id')?.trim();
  if(headerTenant){
    const exists = await db.tenant.findUnique({ where: { id: headerTenant }, select: { id: true } });
    if(exists) return exists.id;
  }
  return DEFAULT_TENANT_ID;
}
