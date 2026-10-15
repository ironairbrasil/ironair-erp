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
  return NextResponse.json(cases.map((item) => ({
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
  })));
}
