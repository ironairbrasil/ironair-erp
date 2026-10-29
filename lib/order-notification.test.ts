import { describe, expect, it } from 'vitest';
import { shouldNotifyPaidOrder } from './order-notification';

describe('shouldNotifyPaidOrder', () => {
  const now = Date.parse('2026-10-29T18:00:00Z');

  it('notifies for a newly observed paid order even when marketplace delivery is delayed', () => {
    expect(shouldNotifyPaidOrder({ previousStatus: undefined, paidAt: '2026-10-29T16:00:00Z', now })).toBe(true);
  });

  it('notifies when a pending order becomes paid', () => {
    expect(shouldNotifyPaidOrder({ previousStatus: 'PENDING', paidAt: '2026-10-29T17:55:00Z', now })).toBe(true);
  });

  it('does not duplicate paid notifications but alerts on any newly found sale', () => {
    expect(shouldNotifyPaidOrder({ previousStatus: 'PAID', paidAt: '2026-10-29T17:55:00Z', now })).toBe(false);
    expect(shouldNotifyPaidOrder({ previousStatus: undefined, paidAt: '2026-10-27T17:55:00Z', now })).toBe(true);
    expect(shouldNotifyPaidOrder({ previousStatus: undefined, paidAt: 'data inválida', now })).toBe(true);
  });
});
