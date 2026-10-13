import { NextResponse } from 'next/server';
import { getTenantId } from '@/lib/tenant';
import { refreshMercadoLivreTenant } from '@/lib/mercadolivre';

export const runtime = 'nodejs';

export async function POST(req: Request){
  try{
    const tenantId = await getTenantId(req);
    const body = await req.json().catch(() => ({}));
    const provider = String(body.provider || 'all');
    const results: Record<string, unknown> = {};
    if(provider === 'all' || provider === 'Mercado Livre' || provider === 'MERCADO_LIVRE'){
      try{
        results.mercadoLivre = await refreshMercadoLivreTenant(tenantId);
      }catch(e: any){
        results.mercadoLivre = { ok: false, error: e?.message || 'mercado_livre_refresh_failed' };
      }
    }
    return NextResponse.json({ ok: true, results });
  }catch(e: any){
    return NextResponse.json({ ok: false, error: e?.message || 'integration_refresh_failed' }, { status: 500 });
  }
}
