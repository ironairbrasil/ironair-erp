# Handoff para Codex — prioridade Shopify

## Decisão arquitetural
Shopify é a fonte primária dos pedidos do site. Não reintroduzir dependência do Payments para ingestão de vendas. Payments permanece checkout/pagamento/CAPI. ERP consolida operação, estoque e analytics.

## Já existe
- Adapter Shopify (`lib/shopify.ts`) com HMAC, mapper, GraphQL, sync de produtos e pedidos.
- Webhook idempotente em `/api/webhooks/shopify`.
- Sync/reconciliação em `/api/integrations/shopify/sync`.
- `Order` normalizado e ledger idempotente.
- Attribution a partir de atributos Shopify.
- Warehouses CENTRAL/FBA/FULL.

## Antes de produção
1. Instalar dependências e executar Prisma generate/typecheck/build.
2. Criar migration Prisma real para novos campos e `WebhookEvent`.
3. Validar queries GraphQL contra a versão Admin API configurada na loja real; ajustar apenas incompatibilidades confirmadas pela API.
4. Registrar webhooks Shopify e testar HMAC/idempotência.
5. Fazer bootstrap de produtos e depois pedidos. CUIDADO: carga histórica de pedidos PAID não deve baixar estoque atual automaticamente. Implementar `historical/import mode` ou snapshot inicial antes do primeiro sync de pedidos.
6. Resolver SKUs desconhecidos sem derrubar webhook: quarantine/retry e alerta operacional.
7. Implementar job periódico de reconciliação Shopify com cursor/checkpoint.
8. Adicionar autenticação do painel, rate limit no tracking e observabilidade.
9. Integrar Meta Marketing API; depois Mercado Livre/Amazon/Shopee.

## Regras que não podem quebrar
- Shopify order duplicado nunca pode duplicar SALE.
- Refund não significa retorno físico automático.
- Transferência entre warehouses não é venda.
- Falha do ERP não pode bloquear checkout/pagamento.
- Nunca expor Shopify token/webhook secret no browser.
- Não executar carga histórica de PAID contra estoque sem estratégia de corte/snapshot.
