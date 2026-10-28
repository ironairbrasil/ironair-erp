import { describe, expect, it } from 'vitest';
import { paidOrderStockDeltas } from './order-stock';

describe('paidOrderStockDeltas', () => {
  it('deducts the initial paid quantities', () => {
    expect(paidOrderStockDeltas([], [{ sku: 'A', quantity: 2, variantId: 'v1' }])).toEqual([{ sku: 'A', previous: 0, current: 2, variantId: 'v1', delta: 2 }]);
  });
  it('calculates corrections, removals and aggregate lines', () => {
    const result = paidOrderStockDeltas(
      [{ sku: 'A', quantity: 2, variantId: 'v1' }, { sku: 'B', quantity: 1, variantId: 'v2' }],
      [{ sku: 'A', quantity: 2, variantId: 'v1' }, { sku: 'A', quantity: 1, variantId: 'v1' }],
    );
    expect(result).toEqual([
      { sku: 'A', previous: 2, current: 3, variantId: 'v1', delta: 1 },
      { sku: 'B', previous: 1, current: 0, variantId: 'v2', delta: -1 },
    ]);
  });
  it('ignores unchanged and unknown variants', () => {
    expect(paidOrderStockDeltas([{ sku: 'A', quantity: 1 }], [{ sku: 'A', quantity: 2 }])).toEqual([]);
  });
});
