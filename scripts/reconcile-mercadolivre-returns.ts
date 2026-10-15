import { db } from '../lib/db';
import { DEFAULT_TENANT_ID } from '../lib/tenant';

// Pacote -> pedido confirmado pela API /packs; valores pela API /orders.
// A classificação operacional em Vendas é REFUNDED para os quatro casos.
// O valor do reembolso permanece pendente nos dois pagamentos em mediação.
// Sem recebimento no estoque central, não cabe criar movimentação RETURN.
const observedAt = new Date('2026-10-14T18:47:00.000Z');
const cases = [
  { externalOrderId: '2000015275430289', orderExternalId: '2000018715020644', claimId: '5591686275', status: 'IN_TRANSIT', reason: 'Produto não funciona', sku: 'IRON-AIR-127V', refundAmount: null },
  { externalOrderId: '2000015263261941', orderExternalId: '2000018702421390', claimId: '5588421005', status: 'IN_TRANSIT', reason: 'Produto não funciona', sku: 'IRON-AIR-127V', refundAmount: null },
  { externalOrderId: '2000015002108573', orderExternalId: '2000018427528724', claimId: '5583988227', status: 'REFUNDED', reason: 'Comprador se arrependeu', sku: 'IRON-AIR-127V', refundAmount: 1599 },
  { externalOrderId: '2000015116539737', orderExternalId: '2000018547999366', claimId: '5583750985', status: 'DELIVERED', reason: 'Comprador se arrependeu', sku: 'IRON-AIR-220V', refundAmount: 1599 },
] as const;

async function main() {
  for (const item of cases) {
    const data = {
      tenantId: DEFAULT_TENANT_ID,
      channel: 'MERCADO_LIVRE' as const,
      externalOrderId: item.externalOrderId,
      orderExternalId: item.orderExternalId,
      claimId: item.claimId,
      status: item.status,
      reason: item.reason,
      sku: item.sku,
      quantity: 1,
      orderAmount: 1599,
      refundAmount: item.refundAmount,
      sourceUrl: `https://vendedores.mercadolivre.com.br/vendas/${item.externalOrderId}/detalhe`,
      observedAt,
    };
    await db.returnCase.upsert({
      where: { tenantId_channel_externalOrderId: { tenantId: data.tenantId, channel: data.channel, externalOrderId: data.externalOrderId } },
      create: data,
      update: data,
    });
    await db.order.updateMany({
      where: { tenantId: data.tenantId, channel: data.channel, externalId: item.orderExternalId },
      data: { status: 'REFUNDED', netRevenue: 0 },
    });
  }
  console.log(`Registradas ${cases.length} devoluções do Mercado Livre.`);
}

main().finally(() => db.$disconnect());
