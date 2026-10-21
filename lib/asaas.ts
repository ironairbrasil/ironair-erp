import { db } from '@/lib/db';
import { decryptSecret } from '@/lib/crypto-secrets';
import { normalizePaymentMethod } from '@/lib/payment-method';

export const ASAAS_EVENTS = ['TRANSFER_CREATED', 'TRANSFER_PENDING', 'TRANSFER_IN_BANK_PROCESSING', 'TRANSFER_BLOCKED', 'TRANSFER_DONE', 'TRANSFER_FAILED', 'TRANSFER_CANCELLED'];
export type AsaasTransfer = { id: string; date: string | null; amount: number; status: string; account: string; type: string };

export async function asaasRequest(token: string, path: string, init?: RequestInit) {
  const response = await fetch(`https://api.asaas.com/v3${path}`, {
    ...init, cache: 'no-store', signal: AbortSignal.timeout(20000),
    headers: { 'access_token': token, 'accept': 'application/json', 'content-type': 'application/json', 'User-Agent': 'IronSeller/1.0', ...init?.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Asaas HTTP ${response.status}: ${body?.errors?.[0]?.description || 'Não foi possível consultar a API'}`);
  return body;
}

export function asaasTransfer(row: any): AsaasTransfer {
  const bank = row.bankAccount;
  return {
    id: String(row.id), date: row.effectiveDate || row.transferDate || row.scheduleDate || row.dateCreated || null,
    amount: Number(row.value || 0), status: String(row.status || 'PENDING'), type: String(row.type || ''),
    account: [bank?.bank?.name, bank?.accountName, bank?.account ? `Final ${String(bank.account).slice(-4)}` : ''].filter(Boolean).join(' · ') || (row.type === 'ASAAS_ACCOUNT' ? 'Conta Asaas' : '—'),
  };
}

export async function listAsaasTransfers(tenantId: string) {
  const integration = await db.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: 'Asaas' } } });
  if (!integration?.accessTokenEncrypted) return { status: 'credential_required', rows: [] as AsaasTransfer[], message: 'Conecte sua conta Asaas em Integrações.' };
  try {
    const token = decryptSecret(integration.accessTokenEncrypted);
    const rows: AsaasTransfer[] = [];
    for (let offset = 0; offset < 10000; offset += 100) {
      const page = await asaasRequest(token, `/transfers?limit=100&offset=${offset}`);
      rows.push(...(page.data || []).map(asaasTransfer));
      if (!page.hasMore) break;
      if (offset === 9900) throw new Error('Histórico de transferências excede 10.000 registros.');
    }
    return { status: 'connected', rows, message: `${rows.length} saques encontrados` };
  } catch (error) {
    return { status: 'unavailable', rows: [] as AsaasTransfer[], message: error instanceof Error ? error.message : 'Consulta indisponível' };
  }
}

export async function findAsaasPaymentMethod(tenantId: string, order: { id?: unknown; externalId?: unknown; displayId?: unknown; name?: unknown; order_number?: unknown; orderNumber?: unknown; total_price?: unknown; grossAmount?: unknown; processed_at?: unknown; created_at?: unknown; processedAt?: unknown; createdAt?: unknown; paidAt?: unknown; currentTotalPriceSet?: any; attribution?: { externalReference?: unknown } }) {
  const integration = await db.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: 'Asaas' } } });
  if (!integration?.accessTokenEncrypted) return '';
  try {
    const token = decryptSecret(integration.accessTokenEncrypted);
    const references = [order.id, order.externalId, order.displayId, order.name, order.order_number, order.orderNumber, order.attribution?.externalReference].filter(Boolean).map(String);
    for (const reference of references) {
      const page = await asaasRequest(token, `/payments?limit=10&externalReference=${encodeURIComponent(reference)}`);
      const match = page.data?.[0];
      if (match) return normalizePaymentMethod(match.billingType);
    }
    const date = String(order.processed_at || order.processedAt || order.created_at || order.createdAt || order.paidAt || '').slice(0, 10);
    const amount = Number(order.total_price || order.currentTotalPriceSet?.shopMoney?.amount || order.grossAmount || 0);
    if (!date || !amount) return '';
    const page = await asaasRequest(token, `/payments?limit=100&dateCreated[ge]=${date}&dateCreated[le]=${date}`);
    const payments:any[]=page.data||[];
    const direct=payments.filter((payment:any)=>Math.abs(Number(payment.value||0)-amount)<0.01);
    if(direct.length===1) return normalizePaymentMethod(direct[0].billingType);
    const groups=new Map<string,any[]>();
    for(const payment of payments){
      const reference=String(payment.externalReference||payment.id||'');
      groups.set(reference,[...(groups.get(reference)||[]),payment]);
    }
    const installmentGroups=[...groups.values()].filter(group=>Math.abs(group.reduce((sum,payment)=>sum+Number(payment.value||0),0)-amount)<0.02);
    return installmentGroups.length===1?normalizePaymentMethod(installmentGroups[0][0]?.billingType):'';
  } catch {
    return '';
  }
}
