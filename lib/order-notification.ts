export function shouldNotifyPaidOrder(input: { previousStatus?: string | null; paidAt?: string | Date | null; now?: number; maxAgeMs?: number }) {
  if (input.previousStatus === 'PAID') return false;
  if (!input.paidAt) return true;
  const paidAt = new Date(input.paidAt).getTime();
  if (!Number.isFinite(paidAt)) return false;
  const age = (input.now ?? Date.now()) - paidAt;
  return age >= -5 * 60_000 && age <= (input.maxAgeMs ?? 24 * 60 * 60_000);
}
