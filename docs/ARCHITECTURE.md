# Arquitetura Iron Air Hub

## Fontes de verdade
- **Shopify:** fonte primária dos pedidos do site, clientes, itens, descontos, frete e estado financeiro do pedido.
- **ERP:** fonte central de estoque/ledger, custos, despesas, consolidação multicanal e analytics.
- **Tracker first-party:** fonte da jornada anterior à compra (visitor/session/UTMs/fbclid/fbp/fbc/gclid).
- **Meta Marketing API:** fonte de gasto, impressões e cliques.
- **Payments/Asaas:** continuam checkout/pagamento/CAPI, mas o ERP NÃO depende deles para criar a venda do site.
- **Amazon/ML/Shopee:** cada marketplace será fonte dos próprios pedidos e estoques remotos.

## Fluxo site
Meta/Google -> site/tracker -> checkout Payments/Asaas -> Shopify -> webhook Shopify -> ERP Order/Attribution -> SALE no ledger -> dashboards.

Há também sincronização Shopify protegida por segredo para bootstrap/reconciliação. Webhook é o caminho de baixa latência; sync periódico é a rede de segurança.

## Estoque
Ledger é a fonte de auditoria. `InventoryBalance` é saldo materializado. CENTRAL é estoque próprio; FBA/Full são warehouses separados. Venda Shopify baixa CENTRAL. Transferência para FBA/Full é TRANSFER_OUT + TRANSFER_IN, nunca venda. Refund não repõe estoque automaticamente: retorno físico exige movimento RETURN explícito.

## Tracking
`ironair-tracker.js` captura visitor/session e parâmetros first-party. Shopify recebe parte da attribution via atributos do pedido; o adapter normaliza esses atributos. `AdSpendDaily` recebe mídia e permite CPA/ROAS/lucro por campanha/ad.

## Idempotência
- Pedido: unique(channel, externalId)
- Movimento: idempotencyKey unique
- Tracking: eventId unique
- Webhook Shopify: unique(provider,eventId)

## Segurança
Webhook Shopify valida HMAC no corpo RAW. Sync servidor-servidor exige `x-erp-secret`. Tokens ficam apenas no servidor. Falha do ERP nunca deve impedir pagamento no Payments.
