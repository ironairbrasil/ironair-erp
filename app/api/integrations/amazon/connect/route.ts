import { NextResponse } from 'next/server';
import { connectAmazonFromEnv } from '@/lib/amazon';
import { requireTenantAdmin } from '@/lib/tenant';

export const runtime = 'nodejs';

export async function POST(req: Request){
  try{
    const tenantId = await requireTenantAdmin(req);
    const integration = await connectAmazonFromEnv(tenantId);
    return NextResponse.json({ ok: true, status: integration.status, connectedAt: integration.connectedAt });
  }catch(e: any){
    return NextResponse.json({ ok: false, error: e?.message || 'amazon_connect_failed' }, { status: 400 });
  }
}

export async function GET(){
  return NextResponse.json({ ok: false, error: 'method_not_allowed' }, { status: 405 });
}
