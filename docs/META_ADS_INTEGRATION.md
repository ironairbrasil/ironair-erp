# Meta Ads no ERP

## Estado atual

- O painel usa Supabase Auth. APIs de usuário verificam o e-mail confirmado e a associação `Membership` antes de aceitar o tenant solicitado; um cabeçalho `x-tenant-id` sozinho não dá acesso.
- Cada empresa usa sua própria linha `Integration` (`tenantId` + `Meta Ads`). Conta e token não são globais.
- O token é criptografado com `SECRET_ENCRYPTION_KEY`; nunca é retornado pela API ou mostrado na interface.
- A sincronização lê insights diários por campanha e grava `AdSpendDaily` com chave que inclui `tenantId` e conta de anúncios.
- O cron consulta as conexões Meta de todas as empresas, com falhas isoladas por empresa. O agendamento Vercel está definido para 06:00 UTC diariamente; exige `CRON_SECRET` na produção.
- A tela mostra a conta vinculada, a última sincronização e eventuais erros reais.
- As páginas públicas `/privacidade`, `/termos` e `/exclusao-de-dados` estão publicadas em `https://ironair-hub-v4.vercel.app` e seus URLs foram salvos nas configurações do app Meta.
- O app Meta `1650076563220675` tem Login do Facebook com OAuth web habilitado e a URI exata `https://ironair-hub-v4.vercel.app/api/integrations/meta/callback` salva e confirmada após recarga.

## Provisionamento administrado

O administrador da empresa pode clicar em **Conectar Meta Ads** no ERP. O fluxo OAuth valida a sessão e a associação com a empresa, usa `state` assinado e nonce em cookie, pede `ads_read` e `read_insights`, e apresenta somente as contas retornadas pela Meta. A escolha grava o token criptografado na integração da empresa. Também há um endpoint de provisionamento administrado para suporte, protegido por `x-erp-secret: <ERP_INGEST_SECRET>`:

`POST /api/integrations/meta/connect`

Corpo JSON: `{ "tenantId": "...", "accountId": "act_...", "accessToken": "..." }`. O servidor valida acesso à conta e leitura de insights antes de salvar. Se `META_APP_ID` e `META_APP_SECRET` estiverem configurados, tenta trocar o token por um de duração maior. Use credenciais da própria empresa e conceda apenas as permissões necessárias para leitura.

`POST /api/integrations/meta/sync` com o mesmo cabeçalho e corpo `{ "tenantId": "...", "days": 30 }` faz uma sincronização sob demanda. `POST /api/integrations/meta/disconnect` com `{ "tenantId": "..." }` apaga o token dessa empresa. Nenhuma dessas rotas aceita um `x-tenant-id` anônimo para escolher o cliente.

## Variáveis de ambiente

`META_GRAPH_API_VERSION`, `META_APP_ID`, `META_APP_SECRET`, `NEXT_PUBLIC_APP_URL`, `SECRET_ENCRYPTION_KEY`, `ERP_INGEST_SECRET` e `CRON_SECRET` são necessárias para o fluxo completo. A URL de callback Meta é `${NEXT_PUBLIC_APP_URL}/api/integrations/meta/callback` e deve estar cadastrada no app Meta. A mesma chave de criptografia precisa estar disponível em todo ambiente que lê os tokens gravados naquele banco. Nunca coloque tokens de clientes em variáveis globais de ambiente ou no frontend.

## Bloqueios para abrir o SaaS a clientes

1. O proprietário informou que criou e confirmou `ironairbrasil@gmail.com`. Validar uma sessão real desse usuário no domínio de produção e o acesso ao tenant Iron Air. O cadastro de novos clientes cria empresas separadas; convites de equipe ainda não foram implementados.
2. Testar o fluxo OAuth Meta ponta a ponta com uma sessão autenticada. A URI de callback está cadastrada, mas a Meta ainda exibe a exigência de acesso avançado a `public_profile` para Login do Facebook. A rota pública de tracking ainda atende apenas a Iron Air; novas lojas precisam de chaves de tracking específicas por empresa.
3. Solicitar à Meta acesso avançado a `public_profile`, `ads_read` e `read_insights` para contas de terceiros e concluir a análise do app. O app permanece em modo de desenvolvimento e com acesso limitado à API de Marketing. Em 15/10/2026, a Meta indicava que o botão de acesso avançado pode levar até 24 horas após uma chamada de teste bem-sucedida para ficar ativo.
4. Confirmar uma execução real do cron em produção. O código e as variáveis de ambiente já foram publicados; a primeira execução agendada depende do horário configurado.
5. Confirmar no Supabase que o domínio de produção e `/reset-password` são aceitos nos URLs de redirecionamento e testar o e-mail de recuperação ponta a ponta.

Até concluir esses itens, não habilite o produto como SaaS público.
