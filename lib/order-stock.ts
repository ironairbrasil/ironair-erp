export type StockLine = { sku: string; quantity: number; variantId?: string | null };

export function paidOrderStockDeltas(previousItems: StockLine[], currentItems: StockLine[]) {
  const totals = (items: StockLine[]) => {
    const result = new Map<string, { quantity: number; variantId?: string | null }>();
    for (const item of items) {
      const prior = result.get(item.sku);
      result.set(item.sku, { quantity: (prior?.quantity || 0) + item.quantity, variantId: item.variantId || prior?.variantId });
    }
    return result;
  };
  const previous = totals(previousItems), current = totals(currentItems);
  return [...new Set([...previous.keys(), ...current.keys()])]
    .map(sku => ({ sku, previous: previous.get(sku)?.quantity || 0, current: current.get(sku)?.quantity || 0, variantId: current.get(sku)?.variantId || previous.get(sku)?.variantId }))
    .map(row => ({ ...row, delta: row.current - row.previous }))
    .filter(row => row.delta !== 0 && row.variantId);
}
