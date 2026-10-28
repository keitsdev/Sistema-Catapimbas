# Diagnóstico de persistência e validação do backend

## Diagnóstico do código entregue

O frontend em `sistema-catapimbas/` não lê nem grava no Supabase. `src/api.ts` inicializa instituições, usuários, projetos, bancas e avaliações em arrays JavaScript e funções como `login` e os serviços de `src/servicos/` alteram esses arrays em memória. Ao recarregar a página ou abrir em outro navegador, as alterações desaparecem. Isso explica também por que um convite gerado no frontend de demonstração não pode ser aceito em outro dispositivo.

O servidor Express separado tem rotas Supabase em `server/`, mas elas não estão conectadas aos serviços de dados usados pelas telas React. Um proxy Vite, por si só, não persiste nada; ele apenas encaminha requisições HTTP que o frontend efetivamente fizer. A configuração do proxy estava apontando para `3333`, enquanto a porta padrão da API é `3001`; foi corrigida para `3001`, com `API_PROXY_TARGET` como opção de override.

Há ainda uma incompatibilidade de esquema documentada em `database-gap-report.md`: o Supabase remoto foi descrito com tabelas em português e IDs inteiros, enquanto a API espera tabelas como `institutions`, `projects` e `institutional_memberships`, IDs UUID e associação de `auth.users.id`. O relatório registra que faltam, entre outros itens, um vínculo UUID para identidade e RPCs transacionais. Conectividade de rede com Supabase não significa que o esquema esteja compatível nem que as operações da aplicação possam gravar com segurança.

**Não aplique a migração `20261001000000_initial_schema.sql` diretamente no banco existente sem plano de migração e backup.** Ela cria o modelo esperado pela API, mas não converte as tabelas em português nem reconcilia os dados atuais.

## Executar e validar a API localmente

1. Na raiz do projeto, copie `.env.example` para `.env` e preencha as variáveis com as credenciais do projeto Supabase. Mantenha `SUPABASE_SERVICE_ROLE_KEY` exclusivamente no servidor; nunca a coloque em `sistema-catapimbas/.env`, no frontend ou no Git.

   ```bash
   cp .env.example .env
   ```

2. Inicie a API na raiz do projeto:

   ```bash
   pnpm install
   pnpm dev:server
   ```

   A configuração padrão inicia em `http://localhost:3001`.

3. Em outro terminal, pode iniciar o frontend:

   ```bash
   cd sistema-catapimbas
   npm ci
   npm run dev
   ```

   O proxy `/api` do Vite agora aponta para `http://localhost:3001`. **Enquanto os serviços React continuarem usando os mocks em memória, esse proxy não faz com que as telas salvem no banco.**

4. Verifique os dois níveis de health check:

   ```bash
   curl -i http://localhost:3001/api/v1/health
   curl -i http://localhost:3001/api/v1/health/ready
   ```

   - `/health` confirma somente que o processo HTTP da API está vivo.
   - `/health/ready` tenta consultar `Usuario.id` e `Usuario.auth_user_id` com a credencial administrativa do backend. `200` e `{"status":"ready"...}` confirmam conectividade PostgREST e presença da tabela/coluna usada pelo login integrado. `503` com `supabase: "unavailable"` indica problema de configuração, credenciais, rede ou permissão. `503` com `supabase: "schema_mismatch"` indica que o Supabase respondeu, mas a tabela/coluna esperada pela adaptação não está disponível.

5. Os testes automatizados do backend não precisam gravar no Supabase real:

   ```bash
   pnpm test
   ```

   Para compilar o frontend:

   ```bash
   cd sistema-catapimbas
   npm run build
   ```

   A compilação e os testes verificam código; não substituem um teste de gravação no projeto Supabase de desenvolvimento.

## Próximo passo para tornar as alterações persistentes

A equipe precisa escolher, com backup e validação, uma destas estratégias:

1. Migrar os dados para o esquema UUID em inglês esperado pela API, preservando o vínculo entre perfis e `auth.users`; ou
2. Implementar uma camada de compatibilidade segura/adaptar a API para o esquema existente, com chaves estrangeiras, autorização multi-instituição, transações, auditoria e operações de convite.

Depois, é necessário substituir os serviços em memória do frontend por chamadas autenticadas à API. No caminho de preservar o esquema existente, o repositório converte IDs inteiros legados para os DTOs que o React já entende; ainda será necessário criar repositórios para as outras entidades e adaptar as rotas uma por vez.

## Login real inicial e repositório legado

O primeiro corte de integração usa `server/repositories/legacy-users.ts` como adaptador entre `Usuario`, `VinculoInstitucional` e `Instituicao` e o DTO da aplicação. Os nomes/colunas ficam localizados no arquivo. O adaptador assume as colunas documentadas `id`, `nome`, `email`, `status`, `usuario_id`, `instituicao_id`, `papel` e `situacao`, mais `Usuario.auth_user_id` criada pela migration aditiva. Confirme os nomes reais e ajuste só o adaptador caso o banco difira.

1. Faça backup e aplique `supabase/migrations/20261028145900_link_auth_user_id.sql` apenas depois de confirmar que a tabela se chama exatamente `public."Usuario"` e preservando `Usuario.id`.
2. Crie/vincule uma conta no Supabase Auth e associe manualmente seu UUID a uma única linha de `Usuario.auth_user_id`, após validar a identidade. Não copie `hash_senha` para Auth nem faça vínculo em massa apenas por e-mail.
3. No frontend, copie `sistema-catapimbas/.env.example` para `sistema-catapimbas/.env.local`. `VITE_AUTH_MODE=api` seleciona o endpoint real; sem essa variável, o mock continua ativo.
4. Inicie o backend e o frontend. No login real, o React chama `/api/v1/auth/login`, recebe o DTO e o token, e usa os metadados Auth para o papel de superadmin. A sessão fica apenas em memória nesta primeira versão; recarregar a página exige entrar novamente.
5. Os demais módulos **continuam sendo mocks**. O aviso no painel explicita isso; não use as telas ainda não migradas para fazer alterações reais.
