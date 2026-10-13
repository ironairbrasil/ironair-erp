import { NextResponse } from 'next/server';
import { getTenantId } from '@/lib/tenant';
import { backfillMercadoLivreCustomerLocations } from '@/lib/mercadolivre';

export const runtime = 'nodejs';

export async function POST(req: Request){
  try{
    const tenantId = await getTenantId(req);
    const result = await backfillMercadoLivreCustomerLocations(tenantId);
    return NextResponse.json({ ok: true, ...result });
  }catch(e: any){
    return NextResponse.json({ ok: false, error: e?.message || 'customer_location_backfill_failed' }, { status: 500 });
  }
}
