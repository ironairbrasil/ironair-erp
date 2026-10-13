import { NextResponse } from 'next/server';
import { getTenantId } from '@/lib/tenant';
import { syncMercadoLivreOrders } from '@/lib/mercadolivre';

export const runtime = 'nodejs';

export async function POST(req: Request){
  try{
    const tenantId = await getTenantId(req);
    const body = await req.json().catch(() => ({}));
    const orders = await syncMercadoLivreOrders(Math.min(Math.max(Number(body.days) || 365, 1), 3650), tenantId);
    return NextResponse.json({ ok: true, orders });
  }catch(e: any){
    return NextResponse.json({ ok: false, error: e?.message || 'mercado_livre_sync_failed' }, { status: 500 });
  }
}
