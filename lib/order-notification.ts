export function shouldNotifyPaidOrder(input: { previousStatus?: string | null; paidAt?: string | Date | null; now?: number; maxAgeMs?: number }) {
  return input.previousStatus !== 'PAID';
}
