import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { syncAmazonOrders } from '@/lib/amazon';
import { syncMercadoLivreReturns } from '@/lib/mercadolivre';
import { getTenantId } from '@/lib/tenant';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request){
  const tenantId = await getTenantId(req);
  const run = async (provider: string, task: () => Promise<unknown>) => {
    try {
      return { provider, ok: true, result: await task() };
    } catch (error: any) {
      const message = error?.message || 'return_sync_failed';
      await db.integration.updateMany({ where: { tenantId, provider }, data: { lastError: message } });
      return { provider, ok: false, error: message };
    }
  };
  const results = await Promise.all([
    run('Mercado Livre', () => syncMercadoLivreReturns(tenantId)),
    run('Amazon', () => syncAmazonOrders(120, tenantId)),
  ]);
  return NextResponse.json({ ok: results.some((item) => item.ok), syncedAt: new Date().toISOString(), results });
}
