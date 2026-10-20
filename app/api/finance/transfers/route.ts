import { NextResponse } from 'next/server';
import { getTenantId } from '@/lib/tenant';
import { listAmazonTransfers } from '@/lib/amazon';
import { listMercadoPagoWithdrawals } from '@/lib/mercado-pago';
import { listAsaasTransfers } from '@/lib/asaas';

export const runtime = 'nodejs';
const cache = new Map<string, { expires: number; data: unknown }>();

export async function GET(req: Request) {
  try {
    const tenantId = await getTenantId(req);
    const cached = cache.get(tenantId);
    if (cached && cached.expires > Date.now() && new URL(req.url).searchParams.get('fresh') !== '1') return NextResponse.json(cached.data);
    const amazonPromise = listAmazonTransfers(tenantId).then(
      (rows) => ({ status: 'connected' as const, rows }),
      (error: unknown) => ({ status: 'unavailable' as const, rows: [], error: error instanceof Error ? error.message : 'Consulta indisponível' })
    );
    const [amazon, mercadoPago, asaas] = await Promise.all([amazonPromise, listMercadoPagoWithdrawals(tenantId), listAsaasTransfers(tenantId)]);
    const rows = [...amazon.rows];
    const transferred = rows.filter((row) => /TRANSFER|DONE|SUCCESS|SUCCEEDED/i.test(row.transferStatus) && row.amount > 0 && row.currency === 'BRL');
    const data = {
      ok: true,
      amazon,
      companyCash: {
        amount: transferred.reduce((total, row) => total + row.amount, 0) + mercadoPago.rows.filter(row => /approv|complet|success|done|paid/i.test(row.status)).reduce((total, row) => total + row.amount, 0) + asaas.rows.filter(row => row.status === 'DONE').reduce((total, row) => total + row.amount, 0),
        transfers: transferred.length + mercadoPago.rows.filter(row => /approv|complet|success|done|paid/i.test(row.status)).length + asaas.rows.filter(row => row.status === 'DONE').length,
        complete: amazon.status === 'connected' && mercadoPago.status === 'connected' && asaas.status === 'connected'
      },
      mercadoPago,
      asaas,
      bankConfirmationAvailable: false,
      updatedAt: new Date().toISOString()
    };
    if (amazon.status === 'connected' && mercadoPago.status !== 'processing') cache.set(tenantId, { expires: Date.now() + 5 * 60_000, data });
    return NextResponse.json(data);
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Falha ao consultar repasses' }, { status: 401 });
  }
}
