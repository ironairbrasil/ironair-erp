# Notificações no iPhone

O Iron Seller envia push quando um pedido passa para **PAID** e quando o estoque disponível de uma variante cruza o nível de segurança. Pedidos antigos importados não geram avisos de venda.

## Configuração do servidor

1. Gere um par de chaves com `npx web-push generate-vapid-keys`.
2. Configure `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` (por exemplo `mailto:suporte@seu-dominio.com`) no ambiente de produção. Preserve a chave privada e use o mesmo par após novos deploys para manter as inscrições existentes.
3. Aplique a migração com `npm run db:deploy` no banco usado pelo servidor.
4. Publique o site em HTTPS.

## Ativação no iPhone

No Safari, abra o site publicado, escolha **Compartilhar → Adicionar à Tela de Início** e abra o ícone instalado. No sino do Iron Seller, toque em **Ativar avisos neste aparelho** e permita as notificações. O recurso requer iOS 16.4 ou posterior. A inscrição é específica para este aparelho e para a empresa selecionada.
