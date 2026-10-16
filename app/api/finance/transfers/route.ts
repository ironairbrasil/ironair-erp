import { NextResponse } from 'next/server';
import { getTenantId } from '@/lib/tenant';
import { listAmazonTransfers } from '@/lib/amazon';
import { getMercadoPagoAvailableBalance, listMercadoPagoWithdrawals } from '@/lib/mercado-pago';
import { shopifyGraphQL } from '@/lib/shopify';

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
    const shopifyPromise = shopifyGraphQL<{ shopifyPaymentsAccount: { balance: Array<{ amount: string; currencyCode: string }> } | null }>(
      'query FinanceBalance { shopifyPaymentsAccount { balance { amount currencyCode } } }'
    ).then(
      (result) => ({ status: result.shopifyPaymentsAccount ? 'connected' as const : 'unavailable' as const, amount: result.shopifyPaymentsAccount?.balance.filter(balance => balance.currencyCode === 'BRL').reduce((sum, balance) => sum + Number(balance.amount || 0), 0) || 0 }),
      () => ({ status: 'unavailable' as const, amount: 0 })
    );
    const [amazon, mercadoPago, shopify] = await Promise.all([amazonPromise, listMercadoPagoWithdrawals(tenantId), shopifyPromise]);
    const mercadoPagoBalance = await getMercadoPagoAvailableBalance(tenantId);
    const rows = [...amazon.rows];
    const transferred = rows.filter((row) => /TRANSFER|DONE|SUCCESS|SUCCEEDED/i.test(row.transferStatus) && row.amount > 0 && row.currency === 'BRL');
    const amazonPending = rows.filter((row) => /OPEN|PEND|PROCESS/i.test(row.transferStatus) && row.amount > 0 && row.currency === 'BRL').reduce((sum, row) => sum + row.amount, 0);
    const data = {
      ok: true,
      amazon,
      receivables: {
        amount: amazon.status === 'connected' || shopify.status === 'connected' || mercadoPagoBalance.amount !== null ? amazonPending + shopify.amount + (mercadoPagoBalance.amount || 0) : null,
        sources: [
          { name: 'Amazon', amount: amazonPending, available: amazon.status === 'connected' },
          { name: 'Shopify Payments', amount: shopify.amount, available: shopify.status === 'connected' },
          { name: 'Mercado Pago', amount: mercadoPagoBalance.amount, available: mercadoPagoBalance.amount !== null, asOf: mercadoPagoBalance.asOf, status: mercadoPagoBalance.status }
        ],
        partial: true
      },
      companyCash: {
        amount: transferred.reduce((total, row) => total + row.amount, 0) + mercadoPago.rows.filter(row => /approv|complet|success|done|paid/i.test(row.status)).reduce((total, row) => total + row.amount, 0),
        transfers: transferred.length + mercadoPago.rows.filter(row => /approv|complet|success|done|paid/i.test(row.status)).length,
        complete: mercadoPago.status === 'connected'
      },
      mercadoPago,
      bankConfirmationAvailable: false,
      updatedAt: new Date().toISOString()
    };
    if (amazon.status === 'connected' && mercadoPago.status !== 'processing') cache.set(tenantId, { expires: Date.now() + 5 * 60_000, data });
    return NextResponse.json(data);
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Falha ao consultar repasses' }, { status: 401 });
  }
}
