import { db } from '@/lib/db';
import { decryptSecret } from '@/lib/crypto-secrets';

const BASE = 'https://api.mercadopago.com/v1/reporting/operations/activities_withdraw';
const RELEASE_BASE = 'https://api.mercadopago.com/v1/account/release_report';
type Withdrawal = { id: string; date: string | null; amount: number; status: string; operationType: string; account: string };

async function mpFetch(token: string, path: string, init?: RequestInit) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const raw = await response.text();
    let detail: { error?: string; message?: string; cause?: Array<{ code?: string; description?: string }> } = {};
    try { detail = JSON.parse(raw); } catch { detail = { message: raw }; }
    const reason = [detail.error, detail.message, detail.cause?.map(item => `${item.code || ''} ${item.description || ''}`).join('; ')].filter(Boolean).join(' · ');
    throw new Error(`Mercado Pago ${path}: HTTP ${response.status}${reason ? ` (${reason.slice(0, 350)})` : ''}`);
  }
  return response;
}

function csvRows(input: string): string[][] {
  const rows: string[][] = [];
  const delimiter = input.split(/\r?\n/, 1)[0].includes(';') ? ';' : ',';
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') { if (quoted && input[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (c === delimiter && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && input[i + 1] === '\n') i++; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  row.push(cell); if (row.some(Boolean)) rows.push(row);
  return rows;
}

function releaseBalance(csv: string): number | null {
  const [header, ...records] = csvRows(csv.replace(/^\uFEFF/, ''));
  if (!header) return null;
  const keys = header.map(key => key.trim().toUpperCase());
  const typeIndex = keys.indexOf('RECORD_TYPE');
  const creditIndex = keys.indexOf('NET_CREDIT_AMOUNT');
  const debitIndex = keys.indexOf('NET_DEBIT_AMOUNT');
  if (typeIndex < 0 || creditIndex < 0 || debitIndex < 0) return null;
  const total = [...records].reverse().find(row => row[typeIndex]?.trim().toLowerCase() === 'total');
  if (!total) return null;
  const parseAmount = (value: string) => Number(value.trim().replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  const amount = parseAmount(total[creditIndex] || '0') - parseAmount(total[debitIndex] || '0');
  return Number.isFinite(amount) ? amount : null;
}

export async function getMercadoPagoAvailableBalance(tenantId: string) {
  const integration = await db.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: 'Mercado Pago' } } });
  if (!integration?.accessTokenEncrypted) return { status: 'unavailable' as const, amount: null, asOf: null };
  const token = decryptSecret(integration.accessTokenEncrypted);
  const metadata = (integration.metadata || {}) as Record<string, unknown>;
  const lastAmount = typeof metadata.releaseBalanceAmount === 'number' ? metadata.releaseBalanceAmount : null;
  const lastAsOf = typeof metadata.releaseBalanceAsOf === 'string' ? metadata.releaseBalanceAsOf : null;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const request = (path: string, init?: RequestInit) => fetch(`${RELEASE_BASE}${path}`, { ...init, headers, cache: 'no-store', signal: AbortSignal.timeout(15000) });
  try {
    let taskId = typeof metadata.releaseReportTaskId === 'string' ? metadata.releaseReportTaskId : '';
    if (taskId) {
      const response = await request(`/task/${encodeURIComponent(taskId)}`);
      if (!response.ok) throw new Error(`Consulta de saldo: HTTP ${response.status}`);
      const task = await response.json();
      if (task.status === 'processed' && task.file_name) {
        const downloaded = await request(`/${encodeURIComponent(task.file_name)}`);
        if (!downloaded.ok) throw new Error(`Download de saldo: HTTP ${downloaded.status}`);
        const amount = releaseBalance(await downloaded.text());
        if (amount === null) throw new Error('Relatório de saldo sem total válido');
        const asOf = String(task.generation_date || new Date().toISOString());
        if (amount !== lastAmount || asOf !== lastAsOf) {
          const current = await db.integration.findUnique({ where: { id: integration.id }, select: { metadata: true } });
          await db.integration.update({ where: { id: integration.id }, data: { metadata: { ...((current?.metadata || {}) as object), releaseBalanceAmount: amount, releaseBalanceAsOf: asOf } } });
        }
        if (Date.now() - new Date(asOf).getTime() < 15 * 60_000) return { status: 'connected' as const, amount, asOf };
      } else if (['pending', 'data-ready', 'processing'].includes(task.status)) {
        return { status: 'processing' as const, amount: lastAmount, asOf: lastAsOf };
      }
    }
    const end = new Date();
    const begin = new Date(end.getTime() - 7 * 86400000);
    const format = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const created = await request('', { method: 'POST', body: JSON.stringify({ begin_date: format(begin), end_date: format(end) }) });
    if (!created.ok) throw new Error(`Geração de saldo: HTTP ${created.status}`);
    taskId = String((await created.json()).id || '');
    if (!taskId) throw new Error('Mercado Pago não retornou a tarefa do saldo');
    const current = await db.integration.findUnique({ where: { id: integration.id }, select: { metadata: true } });
    await db.integration.update({ where: { id: integration.id }, data: { metadata: { ...((current?.metadata || {}) as object), releaseReportTaskId: taskId } } });
    return { status: 'processing' as const, amount: lastAmount, asOf: lastAsOf };
  } catch {
    return { status: 'unavailable' as const, amount: lastAmount, asOf: lastAsOf };
  }
}

function readWithdrawals(csv: string): Withdrawal[] {
  const [header, ...records] = csvRows(csv.replace(/^\uFEFF/, ''));
  if (!header) return [];
  const keys = header.map(key => (key.match(/\(([^)]+)\)\s*$/)?.[1] || key).trim().toLowerCase());
  const get = (record: string[], key: string) => record[keys.indexOf(key)]?.trim() || '';
  return records.map(record => {
    const rawAmount = get(record, 'amount') || get(record, 'net_received_amount') || get(record, 'transaction_amount');
    const amount = Number(rawAmount.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
    return { id: get(record, 'withdraw_id') || get(record, 'operation_id'), date: get(record, 'date_created') || null, amount: Math.abs(amount), status: get(record, 'status'), operationType: get(record, 'operation_type') || 'Saque', account: [get(record, 'bank_name'), get(record, 'bank_account_number')].filter(Boolean).join(' · ') || get(record, 'bank_account') };
  }).filter(row => row.id && Number.isFinite(row.amount));
}

export async function listMercadoPagoWithdrawals(tenantId: string) {
  const integration = await db.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: 'Mercado Pago' } } });
  if (!integration?.accessTokenEncrypted) return { status: 'credential_required', rows: [] as Withdrawal[], message: 'Conecte o Access Token de produção do Mercado Pago.' };
  const token = decryptSecret(integration.accessTokenEncrypted);
  const metadata = (integration.metadata || {}) as Record<string, unknown>;
  try {
    let config = await fetch(`${BASE}/config`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (config.status === 404) {
      config = await mpFetch(token, '/config', { method: 'POST', body: JSON.stringify({
        structure: { name: 'iron-air-withdrawals', columns: ['date_created', 'operation_id', 'status', 'operation_type', 'transaction_amount', 'net_received_amount', 'bank_account'].map(key => ({ key })) },
        notifiers: [{ type: 'internal_sftp', data: {} }]
      }) });
    } else if (!config.ok) throw new Error(`Mercado Pago: configuração de saques retornou HTTP ${config.status}`);

    let reportId = typeof metadata.withdrawReportId === 'string' ? metadata.withdrawReportId : '';
    if (metadata.withdrawReportCreatedAt && Date.now() - new Date(String(metadata.withdrawReportCreatedAt)).getTime() > 24 * 3600000) reportId = '';
    if (!reportId) {
      const start = new Date(); start.setUTCFullYear(start.getUTCFullYear() - 1); start.setUTCDate(start.getUTCDate() + 1);
      const saoPaulo = (date: Date) => new Date(date.getTime() - 3 * 3600000).toISOString().replace('Z', '-03:00');
      const created = await mpFetch(token, '/statements', { method: 'POST', body: JSON.stringify({ filters: { creation_date: { range: { gte: saoPaulo(start), lte: saoPaulo(new Date()) } } }, file_format: 'application/csv' }) });
      reportId = String((await created.json()).record_id || '');
      if (!reportId) throw new Error('Mercado Pago não retornou o identificador do relatório.');
      await db.integration.update({ where: { id: integration.id }, data: { metadata: { ...metadata, withdrawReportId: reportId, withdrawReportCreatedAt: new Date().toISOString() } } });
    }
    const report = await mpFetch(token, `/statements/${encodeURIComponent(reportId)}`);
    const detail = await report.json();
    if (detail.status === 'pending') {
      let rows: Withdrawal[] = [];
      if (typeof metadata.withdrawFallbackReportId === 'string') {
        const fallback = await mpFetch(token, `/statements/${encodeURIComponent(metadata.withdrawFallbackReportId)}/download?format=csv`);
        rows = readWithdrawals(await fallback.text()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      }
      return { status: 'processing', rows, message: rows.length ? `${rows.length} saques recentes · histórico completo em preparação` : 'Mercado Pago está preparando o relatório de saques. Atualize em instantes.' };
    }
    if (detail.status === 'empty') return { status: 'connected', rows: [] as Withdrawal[], message: 'Nenhum saque no período consultado.' };
    if (detail.status !== 'available') throw new Error(`Relatório de saques: ${detail.status || 'status desconhecido'}`);
    const downloaded = await mpFetch(token, `/statements/${encodeURIComponent(reportId)}/download?format=csv`);
    if ((downloaded.headers.get('content-type') || '').includes('zip')) throw new Error('O relatório veio compactado; download ZIP ainda não é suportado.');
    const rows = readWithdrawals(await downloaded.text()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (metadata.withdrawFallbackReportId !== reportId) {
      const current = await db.integration.findUnique({ where: { id: integration.id }, select: { metadata: true } });
      await db.integration.update({ where: { id: integration.id }, data: { metadata: { ...((current?.metadata || {}) as object), withdrawFallbackReportId: reportId } } });
    }
    return { status: 'connected', rows, message: `${rows.length} saques encontrados` };
  } catch (error) {
    return { status: 'unavailable', rows: [] as Withdrawal[], message: error instanceof Error ? error.message : 'Consulta ao Mercado Pago indisponível' };
  }
}
