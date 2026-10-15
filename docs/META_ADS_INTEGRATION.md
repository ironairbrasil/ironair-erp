# Meta Ads no ERP

## Estado atual

- O painel usa Supabase Auth. APIs de usuário verificam o e-mail confirmado e a associação `Membership` antes de aceitar o tenant solicitado; um cabeçalho `x-tenant-id` sozinho não dá acesso.
- Cada empresa usa sua própria linha `Integration` (`tenantId` + `Meta Ads`). Conta e token não são globais.
- O token é criptografado com `SECRET_ENCRYPTION_KEY`; nunca é retornado pela API ou mostrado na interface.
- A sincronização lê insights diários por campanha e grava `AdSpendDaily` com chave que inclui `tenantId` e conta de anúncios.
- O cron consulta as conexões Meta de todas as empresas, com falhas isoladas por empresa. O agendamento Vercel está definido para 06:00 UTC diariamente; exige `CRON_SECRET` na produção.
- A tela mostra a conta vinculada, a última sincronização e eventuais erros reais.
- As páginas públicas preparadas para o app Meta são `/privacidade`, `/termos` e `/exclusao-de-dados`. Publicá-las no domínio final e conferir os links antes de cadastrá-los na Meta.

## Provisionamento administrado

O administrador da empresa pode clicar em **Conectar Meta Ads** no ERP. O fluxo OAuth valida a sessão e a associação com a empresa, usa `state` assinado e nonce em cookie, pede `ads_read` e `read_insights`, e apresenta somente as contas retornadas pela Meta. A escolha grava o token criptografado na integração da empresa. Também há um endpoint de provisionamento administrado para suporte, protegido por `x-erp-secret: <ERP_INGEST_SECRET>`:

`POST /api/integrations/meta/connect`

Corpo JSON: `{ "tenantId": "...", "accountId": "act_...", "accessToken": "..." }`. O servidor valida acesso à conta e leitura de insights antes de salvar. Se `META_APP_ID` e `META_APP_SECRET` estiverem configurados, tenta trocar o token por um de duração maior. Use credenciais da própria empresa e conceda apenas as permissões necessárias para leitura.

`POST /api/integrations/meta/sync` com o mesmo cabeçalho e corpo `{ "tenantId": "...", "days": 30 }` faz uma sincronização sob demanda. `POST /api/integrations/meta/disconnect` com `{ "tenantId": "..." }` apaga o token dessa empresa. Nenhuma dessas rotas aceita um `x-tenant-id` anônimo para escolher o cliente.

## Variáveis de ambiente

`META_GRAPH_API_VERSION`, `META_APP_ID`, `META_APP_SECRET`, `NEXT_PUBLIC_APP_URL`, `SECRET_ENCRYPTION_KEY`, `ERP_INGEST_SECRET` e `CRON_SECRET` são necessárias para o fluxo completo. A URL de callback Meta é `${NEXT_PUBLIC_APP_URL}/api/integrations/meta/callback` e deve estar cadastrada no app Meta. A mesma chave de criptografia precisa estar disponível em todo ambiente que lê os tokens gravados naquele banco. Nunca coloque tokens de clientes em variáveis globais de ambiente ou no frontend.

## Bloqueios para abrir o SaaS a clientes

1. Concluir a ativação do login em produção: configurar `SAAS_BOOTSTRAP_OWNER_EMAIL`, criar/confirmar a conta do proprietário e testar acesso às rotas do ERP. O cadastro de novos clientes cria empresas separadas; convites de equipe ainda não foram implementados.
2. Testar o fluxo OAuth Meta ponta a ponta após cadastrar a URL de callback no app. A rota pública de tracking ainda atende apenas a Iron Air; para novas lojas será necessário criar chaves de tracking específicas por empresa.
3. Publicar e revisar as páginas de privacidade, termos e exclusão de dados; cadastrar seus URLs finais na Meta e obter acesso avançado a `ads_read` e `read_insights` para contas de terceiros. O app está em modo de desenvolvimento e com acesso limitado à API de Marketing. Em 15/10/2026, a tela da Meta exigia uma chamada de teste bem-sucedida e avisava que o botão de acesso avançado pode levar até 24 horas para ficar ativo. O fluxo OAuth pede `ads_read` e `read_insights`, conforme autorizado pelo proprietário.
4. Configurar `META_GRAPH_API_VERSION`, `META_APP_ID` e, depois da reautenticação do proprietário, `META_APP_SECRET` no ambiente de produção. Confirmar que `SECRET_ENCRYPTION_KEY` em produção consegue ler as conexões desse banco.
5. Publicar o código e confirmar uma execução real do cron em produção. O cron configurado no repositório só começa a rodar após o deploy.

Até concluir esses itens, não habilite o produto como SaaS público.
