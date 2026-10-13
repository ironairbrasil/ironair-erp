# Shopify como fonte primária

## Webhook
Endpoint: `POST /api/webhooks/shopify`

Configurar no Shopify os tópicos de pedido relevantes apontando para esse endpoint, especialmente criação, atualização, pagamento e cancelamento. O endpoint valida `X-Shopify-Hmac-Sha256`, usa `X-Shopify-Webhook-Id` para idempotência e normaliza o pedido para o modelo `Order`.

## Reconciliação / bootstrap
`POST /api/integrations/shopify/sync` com header `x-erp-secret` igual a `ERP_INGEST_SECRET`.
Body opcional: `{ "days": 90, "products": true, "orders": true }`.

O sync importa catálogo/SKUs primeiro e depois pedidos. Deve ser usado para carga inicial e reconciliação periódica, não como substituto do webhook.

## Attribution
O adapter lê `note_attributes` (REST webhook) ou `customAttributes` (GraphQL), incluindo `utm_*`, `fbclid`, `_fbp/fbp`, `_fbc/fbc`, `gclid`, campaign/adset/ad IDs e IDs de sessão/visitante quando presentes. Também preserva landing/referrer disponíveis no Shopify.

## Regra de estoque
Primeira transição do pedido para `PAID` gera exatamente uma SALE por SKU em CENTRAL. Reprocessamento não baixa novamente. Refund/cancelamento não devolve unidade automaticamente ao estoque físico.

## Payments
Payments deixa de ser integração obrigatória do ERP. Ele continua fazendo checkout, Asaas e Meta CAPI. `externalReference` pode continuar no Shopify para conciliação, mas a existência da venda no ERP vem do Shopify.
