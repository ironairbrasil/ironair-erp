import { describe, expect, it } from 'vitest';
import { mercadoLivreRefundAmount } from './mercadolivre-refund';

describe('mercadoLivreRefundAmount', () => {
  it('reads confirmed full and partial refunds without substituting the order total', () => {
    expect(mercadoLivreRefundAmount({ payments: [{ status: 'refunded', transaction_amount: 1599, transaction_amount_refunded: 1599 }] })).toBe(1599);
    expect(mercadoLivreRefundAmount({ payments: [{ transaction_amount: 1599, transaction_amount_refunded: 300 }] })).toBe(300);
  });
  it('adds the refunded amounts across payments', () => {
    expect(mercadoLivreRefundAmount({ payments: [{ transaction_amount_refunded: '100.10' }, { transaction_amount_refunded: 200.20 }] })).toBe(300.30);
  });
  it('keeps unknown and unconfirmed refunds distinct from paid refunds', () => {
    expect(mercadoLivreRefundAmount({})).toBeNull();
    expect(mercadoLivreRefundAmount({ payments: [{ status: 'refunded', transaction_amount: 1599 }] })).toBeNull();
    expect(mercadoLivreRefundAmount({ payments: [{ transaction_amount_refunded: null }, { transaction_amount_refunded: -10 }, { transaction_amount_refunded: 'invalid' }] })).toBeNull();
    expect(mercadoLivreRefundAmount({ payments: [{ transaction_amount_refunded: 0 }] })).toBe(0);
  });
});
