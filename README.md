# Iron Air Hub — ERP + Tracking

ERP operacional + tracking first-party para a Iron Air.

## Arquitetura atual
**Shopify é a fonte primária dos pedidos do site.** Payments/Asaas continuam responsáveis por checkout/pagamento/Meta CAPI, mas o ERP não depende deles para registrar vendas. O ERP recebe Shopify por webhook e faz reconciliação via Admin GraphQL API.

## Implementado
- PostgreSQL + Prisma: pedidos, clientes, produtos/SKUs, warehouses, ledger/saldos, attribution, tracking, mídia, despesas e integrações.
- Shopify adapter: validação HMAC, webhook idempotente, mapper de pedidos, sync de produtos e pedidos.
- Baixa idempotente de estoque na primeira transição para PAID.
- Tracker first-party com visitor/session, UTMs, fbclid/fbp/fbc/gclid.
- Dashboard/APIs iniciais de vendas, estoque e campanhas.
- CENTRAL, FBA e Mercado Livre Full separados.

## Rodar local
```bash
cp .env.example .env
docker compose up -d
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

Em um banco novo, use `npm run db:bootstrap` para materializar o schema atual. Em bancos já provisionados, use `npm run db:deploy` para aplicar somente as migrações pendentes.

Leia `docs/SHOPIFY_INTEGRATION.md` e `docs/CODEX_HANDOFF.md` antes de produção. A carga histórica de pedidos pagos exige estratégia de corte para não alterar o estoque atual.

## V4 Local Interactive UI
A interface local agora inclui modais e ações funcionais para: movimentação de estoque, venda manual, criação/edição de produto, campanha, criativo, despesa, configurações e detalhes de pedido. A área de Integrações inclui catálogo de parceiros (Shopify, Meta, Asaas, Mercado Livre, Amazon, Shopee, Google Ads, TikTok Ads/Shop, Correios, Kiwify, Hotmart, Yampi, Pagar.me e Mercado Pago), campos de credenciais, URLs de webhook, seleção de eventos e sincronização manual. No modo localhost os saves de UI ficam em memória; o Codex deve ligar persistência/segredos e APIs reais.
