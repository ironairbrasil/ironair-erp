import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';

export async function GET(req: Request) {
  const tenantId = await getTenantId(req);
  const cases = await db.returnCase.findMany({
    where: { tenantId },
    orderBy: [{ observedAt: 'desc' }, { externalOrderId: 'desc' }],
  });
  const orders = await db.order.findMany({
    where: { tenantId, externalId: { in: cases.map((item) => item.orderExternalId).filter((id): id is string => Boolean(id)) } },
    select: { externalId: true, status: true, customer: { select: { name: true } } },
  });
  const orderById = new Map(orders.map((order) => [order.externalId, order]));
  const rows = cases.map((item) => ({
    id: item.id,
    externalOrderId: item.externalOrderId,
    orderExternalId: item.orderExternalId,
    claimId: item.claimId,
    channel: item.channel,
    status: item.status,
    reason: item.reason,
    sku: item.sku,
    quantity: item.quantity,
    orderAmount: Number(item.orderAmount || 0),
    refundAmount: item.refundAmount === null ? null : Number(item.refundAmount),
    sourceUrl: item.sourceUrl,
    observedAt: item.observedAt,
    erpOrderStatus: item.orderExternalId ? orderById.get(item.orderExternalId)?.status || null : null,
    customerName: item.orderExternalId ? orderById.get(item.orderExternalId)?.customer?.name || null : null,
  }));

  // A marketplace can expose more than one return request for the same order.
  // Financially this is still one refunded sale, so keep the raw cases in the
  // database and consolidate the read model by channel + order number.
  const consolidated = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.channel}:${row.orderExternalId || row.externalOrderId}`;
    const current = consolidated.get(key);
    if (!current) {
      consolidated.set(key, row);
      continue;
    }

    const currentRefund = current.refundAmount ?? 0;
    const rowRefund = row.refundAmount ?? 0;
    const currentDate = new Date(current.observedAt).getTime();
    const rowDate = new Date(row.observedAt).getTime();
    const latest = rowDate > currentDate ? row : current;
    const confirmed = rowRefund > 0 ? row : currentRefund > 0 ? current : latest;
    consolidated.set(key, {
      ...latest,
      status: confirmed.status,
      refundAmount: Math.max(currentRefund, rowRefund) || null,
    });
  }

  return NextResponse.json([...consolidated.values()].sort((a, b) =>
    new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime()
  ));
}
