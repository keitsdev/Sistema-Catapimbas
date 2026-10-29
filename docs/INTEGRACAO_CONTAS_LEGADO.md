# Integração persistente de contas com o Supabase legado

## O que foi conectado

Esta entrega adapta **o fluxo de contas e vínculos** ao esquema português documentado no projeto, mantendo IDs inteiros do domínio e usando UUID somente para a identidade do Supabase Auth. As rotas ficam sob `/api/v1/legacy` e o backend, nunca o navegador, usa a `service_role`.

- Cadastro público: cria identidade no Supabase Auth, perfil em `public."Usuario"` e vínculo pendente em `public."VinculoInstitucional"`. Se as gravações no PostgREST falharem, a API tenta compensar removendo o perfil e a identidade recém-criados.
- Instituições públicas: lê `public."Instituicao"`.
- Aprovações: lista solicitações pendentes e aprova/recusa vínculos.
- Pessoas: lista vínculos e permite alterar papel, bloquear, revogar ou restaurar acesso. A API impede alteração do próprio acesso e remoção do último administrador.
- Meu perfil: solicitação de ingresso, alteração de senha via Supabase Auth, exportação de dados e pedido de exclusão registrado para análise humana.
- Auditoria de contas: grava eventos sem senha/token em `public."AuditoriaIntegracaoContas"`.

A exclusão disponível na interface é uma **solicitação registrada**, não uma remoção física de Auth, perfil, avaliações ou histórico. A gestão institucional oferece bloqueio/revogação, que preserva integridade e trilha histórica.

## Contrato legado usado

O adaptador concentra os nomes físicos em `server/repositories/legacy-users.ts` e atualmente assume:

- `public."Usuario"`: `id` inteiro com geração automática, `nome`, `email`, `status` e `auth_user_id uuid`; `hash_senha` pode existir como legado e é tornado nullable, mas novas senhas ficam somente no Supabase Auth;
- `public."VinculoInstitucional"`: `usuario_id`, `instituicao_id`, `papel`, `situacao` e `justificativa`;
- `public."Instituicao"`: `id`, `nome`, `identificador` e `status`;
- valores portugueses de papel como `admin`, `coordenador`, `orientador`, `avaliador`, `aluno`; situações `pendente`, `aprovado`, `recusado`, `bloqueado`, `revogado`; instituição ativa `ativa` (também são aceitas algumas variantes inglesas);
- unicidade lógica de `(usuario_id, instituicao_id)` e e-mail de perfil sem diferenciar maiúsculas/minúsculas.

Confirme esses nomes e tipos no SQL Editor do projeto Supabase antes de aplicar. Em especial, confirme se `Usuario.id` tem `identity/serial` ou outro default. A criação usa apenas os campos acima; qualquer coluna adicional `NOT NULL` sem default precisa ser tratada antes.

## Migration aditiva

Foi acrescentado `supabase/migrations/20261028193000_legacy_accounts_auth.sql`. Ela:

1. exige que as três tabelas legadas existam;
2. garante a relação única `Usuario.auth_user_id → auth.users.id`;
3. torna `hash_senha` nullable, se a coluna existir, para que novas contas não dupliquem senhas fora do Supabase Auth;
4. adiciona `justificativa` ao vínculo;
5. cria índices únicos para `lower(Usuario.email)` e `(VinculoInstitucional.usuario_id, instituicao_id)`;
6. cria `AuditoriaIntegracaoContas` e `SolicitacaoExclusaoConta`, ambas com RLS habilitado e sem política de leitura/escrita pública.

**Antes de executar a migration:** faça backup; procure e resolva duplicidades de e-mail (ignorando caixa) e de vínculo por usuário/instituição. Os índices únicos falham deliberadamente se houver duplicados; a migration não apaga nem escolhe registros automaticamente. Confirme os tipos físicos e faça revisão do SQL. A migration anterior `20261028145900_link_auth_user_id.sql` também adiciona o vínculo Auth; a migration nova é idempotente nessa parte.

No SQL Editor, confira primeiro o DDL e rode estas consultas de pré-verificação. A primeira deve mostrar as colunas esperadas; as duas últimas não devem retornar linhas:

```sql
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('Usuario', 'VinculoInstitucional', 'Instituicao')
order by table_name, ordinal_position;

select lower(email) as email_normalizado, count(*)
from public."Usuario"
where email is not null
group by lower(email)
having count(*) > 1;

select usuario_id, instituicao_id, count(*)
from public."VinculoInstitucional"
group by usuario_id, instituicao_id
having count(*) > 1;
```

Não execute cegamente `supabase db push` enquanto a migration inicial em inglês `20261001000000_initial_schema.sql` estiver pendente. Ela cria outro modelo e não migra automaticamente as tabelas portuguesas. Use o processo de migration já adotado pela equipe, verificando primeiro o histórico remoto e aplicando apenas o SQL aditivo revisado.

## Configuração local

1. Faça cópia de segurança do banco e aplique as migrations aditivas após revisão.
2. No backend, configure o `.env` a partir da `.env.example`:
   ```env
   NODE_ENV=development
   API_PORT=3001
   API_BASE_PATH=/api/v1
   CORS_ORIGINS=http://localhost:5173
   SUPABASE_URL=https://SEU-PROJETO.supabase.co
   SUPABASE_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICA
   SUPABASE_SECRET_KEY=SUA_CHAVE_PRIVADA_DO_SERVIDOR
   ```
3. No frontend, copie `sistema-catapimbas/.env.example` para `sistema-catapimbas/.env.local`:
   ```env
   VITE_AUTH_MODE=api
   VITE_DATA_MODE=api
   VITE_API_BASE_URL=/api/v1
   ```
4. Inicie backend e frontend em terminais separados:
   ```bash
   npm ci
   npm run dev:server
   ```
   ```bash
   cd sistema-catapimbas
   npm ci
   npm run dev
   ```
5. Verifique `http://localhost:3001/api/v1/health/ready`. Deve retornar `200` e `status: ready`. Se retornar `schema_mismatch`, confira migration, nomes/capitalização e colunas indicados acima.

O backend aceita os nomes atuais `SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY`, além dos aliases antigos `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. A secret key (ou o antigo `service_role`) só pode existir no ambiente secreto do backend: nunca a coloque no `.env.local` do frontend, em variável `VITE_*`, no Vercel nem no Git. A documentação atual do Supabase indica a transição das chaves `anon`/`service_role` para `publishable`/`secret`; para um projeto novo prefira as chaves atuais.

## Produção: backend no Render e frontend no Vercel

O Vercel hospeda o frontend Vite deste projeto; o Express é um processo Node separado. Os arquivos `server/index.ts` e `package.json` estão na raiz do repositório. O comando de produção executa o servidor TypeScript com `tsx`, sem exigir um `.env` no host. `tsx` é dependência de produção. O servidor usa o `PORT` atribuído pelo Render e faz bind em `0.0.0.0`.

### 1. Publique o código em GitHub

Extraia o ZIP adaptado, copie as alterações para o repositório que alimenta o site e envie um commit para o branch de produção. O Render e o Vercel precisam acessar esse código pelo provedor Git. Não envie arquivos `.env` nem chaves.

### 2. Implante o Express no Render

No Render, escolha **New → Web Service**, conecte o repositório e informe:

- **Root Directory:** vazio/raiz do repositório;
- **Runtime:** Node; use Node 22;
- **Build Command:** `npm ci --include=dev && npx tsc -p tsconfig.server.json --noEmit && npm test`;
- **Start Command:** `npm run start:server`;
- **Health Check Path:** `/api/v1/health`.

Em **Environment**, adicione estas variáveis. Use a URL e as chaves do mesmo projeto Supabase:

```env
NODE_ENV=production
NODE_VERSION=22.23.4
API_BASE_PATH=/api/v1
CORS_ORIGINS=https://SEU-FRONTEND.vercel.app
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICA
SUPABASE_SECRET_KEY=SUA_CHAVE_PRIVADA_DO_SERVIDOR
SUPABASE_STORAGE_BUCKET=winner-music
LOG_LEVEL=info
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
```

Não defina `PORT`: o Render fornece essa variável e esta versão do servidor a usa automaticamente. `API_PORT` fica como fallback local. Não é necessário criar nem enviar um `.env` para o Render. Salve as variáveis e aguarde o deploy. Copie a URL HTTPS do serviço, por exemplo `https://catapimbas-api.onrender.com`.

Teste primeiro `https://SEU-HOST-DA-API/api/v1/health`; deve retornar JSON com `status: "ok"`. Depois de aplicar a migration, teste `https://SEU-HOST-DA-API/api/v1/health/ready`; deve retornar `status: "ready"`. Se retornar 503, abra os logs do Render e confira as variáveis e o esquema no Supabase.

### 3. Configure o projeto Vercel

No projeto Vercel, em **Settings → Build and Deployment → Root Directory**, escolha `sistema-catapimbas`. Salve a alteração. Se necessário, escolha o preset **Vite**, com **Build Command** `npm run build` e **Output Directory** `dist`; o install command pode ser `npm ci`. A configuração `sistema-catapimbas/vercel.json` adicionada ao projeto redireciona rotas internas do React para `index.html`, permitindo recarregar páginas internas.

Em **Settings → Environment Variables**, crie estas três variáveis para **Production** (adicione-as também a Preview somente se as URLs de preview forem autorizadas no CORS do backend):

```env
VITE_AUTH_MODE=api
VITE_DATA_MODE=api
VITE_API_BASE_URL=https://SEU-HOST-DA-API/api/v1
```

Substitua o host pelo URL HTTPS real do Render, sem barra final depois de `/api/v1`. **Não** coloque `SUPABASE_SECRET_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` no Vercel: o bundle Vite é enviado ao navegador. Salve e faça um novo deploy de produção para incluir as variáveis no build.

### 4. Autorize CORS e faça o smoke test

O `CORS_ORIGINS` do Render precisa ser igual à origem do site, sem caminho ou barra final. Por exemplo, para `https://catapimbas.vercel.app`, use exatamente essa origem. Para domínio personalizado, substitua pelo domínio final. O backend aceita várias origens separadas por vírgula; cada domínio de Preview precisa ser incluído explicitamente.

No navegador, abra o site Vercel e teste: (1) carregar a tela de cadastro; (2) criar um usuário de teste; (3) confirmar o e-mail, caso o Supabase exija; (4) aprovar o vínculo com um administrador já associado a `auth_user_id`; (5) entrar com a nova conta; (6) mudar um papel/situação e atualizar a página; (7) confirmar a persistência em `Usuario`, `VinculoInstitucional` e `AuditoriaIntegracaoContas` no Table Editor. O Vercel aplica variáveis de ambiente somente a novos deploys; o Render precisa reiniciar/reimplantar quando variáveis do backend forem alteradas.

## Conta administrativa inicial

O login real legado só aceita perfis que possuam `Usuario.auth_user_id` vinculado a um usuário de `auth.users`. Para o primeiro administrador, valide manualmente a identidade no Auth e na tabela `Usuario`, e associe o UUID à linha correta. **Não vincule usuários em massa apenas por e-mail.** Depois, confirme que essa linha tem vínculo `aprovado` e papel administrativo em `VinculoInstitucional`.

## Validação realizada nesta cópia

- Typecheck TypeScript do backend: passou; `npm run start:server` respondeu HTTP 200 em `/api/v1/health` sem arquivo `.env`, usando a porta `PORT` injetada no smoke test.
- Testes automatizados do backend: 48 passaram (`npm test`).
- Build de produção e testes do frontend: passaram; o Vite avisou que o bundle inicial é grande (aviso pré-existente de otimização).
- Não foi feito teste de escrita no Supabase remoto, nem verificação das variáveis do Vercel. A validação real de banco depende de aplicar a migration revisada e executar o smoke test com uma conta de teste.

## Limite funcional explícito

Este primeiro corte integra contas, vínculos e seus formulários. Os serviços de projetos, bancas, critérios, notas, instituições da plataforma/superadmin e parte dos relatórios ainda possuem mocks ou rotas baseadas no contrato inglês/UUID. Não use esses módulos para gravações reais até que o DDL português completo de cada tabela e suas relações/RLS seja confirmado e cada rota correspondente seja adaptada.

## Referências oficiais

- [Render: deploy de aplicação Node/Express](https://render.com/docs/deploy-node-express-app)
- [Render: web services, porta e host](https://render.com/docs/web-services)
- [Render: variáveis de ambiente e segredos](https://render.com/docs/configure-environment-variables)
- [Vercel: Vite](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel: Root Directory e configuração de build](https://vercel.com/docs/builds/configure-a-build)
- [Vercel: variáveis de ambiente](https://vercel.com/docs/environment-variables)
- [Supabase: API keys e segurança de secret keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase: banco de dados e SQL Editor](https://supabase.com/docs/guides/database/overview)
