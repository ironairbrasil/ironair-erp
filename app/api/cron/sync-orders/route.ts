import { NextResponse } from 'next/server';
import { syncAmazonOrders } from '@/lib/amazon';
import { syncMercadoLivreOrders } from '@/lib/mercadolivre';
import { getTenantId } from '@/lib/tenant';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: Request){
  const secret = process.env.CRON_SECRET;
  if(!secret || req.headers.get('authorization') !== `Bearer ${secret}`){
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const tenantId = await getTenantId(req);
  const run = async(name: string, task: () => Promise<number>) => {
    try{return { provider: name, ok: true, orders: await task() }}
    catch(e: any){return { provider: name, ok: false, orders: 0, error: e?.message || 'sync_failed' }}
  };
  const results = await Promise.all([
    run('Amazon', () => syncAmazonOrders(2, tenantId)),
    run('Mercado Livre', () => syncMercadoLivreOrders(2, tenantId))
  ]);
  return NextResponse.json({ ok: results.some(result => result.ok), results });
}
