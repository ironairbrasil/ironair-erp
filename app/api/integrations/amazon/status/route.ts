import { NextResponse } from 'next/server';
import { amazonStatus } from '@/lib/amazon';
import { getTenantId } from '@/lib/tenant';

export const runtime = 'nodejs';

export async function GET(req: Request){
  const tenantId = await getTenantId(req);
  return NextResponse.json(await amazonStatus(tenantId));
}
