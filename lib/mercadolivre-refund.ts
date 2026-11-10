// Use the financial API's refunded amount; delivery or the order total alone
// does not confirm how much money was returned (refunds may be partial).
export function mercadoLivreRefundAmount(order: { payments?: unknown }): number | null {
  if (!Array.isArray(order.payments)) return null;
  let total = 0;
  let known = false;
  for (const payment of order.payments) {
    const value = payment?.transaction_amount_refunded;
    if (value === null || value === undefined || value === '') continue;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) continue;
    known = true;
    total += amount;
  }
  return known ? Math.round(total * 100) / 100 : null;
}
