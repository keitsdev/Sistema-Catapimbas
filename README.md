# Sistema Catapimbas

Backend Node.js + TypeScript para uma plataforma SaaS multi-institucional de gestão e avaliação de projetos acadêmicos. O frontend e o esquema físico do Supabase podem evoluir separadamente desde que respeitem o contrato em `docs/supabase-contract.md`.

## Funcionalidades implementadas

- cadastro, login, recuperação de senha e validação de JWT do Supabase Auth;
- instituições, solicitações de ingresso, aprovação, bloqueio e revogação de vínculos;
- autorização por instituição e papel em todas as rotas protegidas;
- projetos, equipes, orientadores, bancas, avaliadores, critérios e rubricas;
- submissão e revisão transacional de avaliações;
- auditoria de operações sensíveis;
- ranking ponderado com empates explícitos;
- pódio com configuração de confete e música da equipe vencedora;
- dashboard institucional;
- exportação de projetos e ranking para `.xlsx`;
- validação Zod, rate limiting, CORS, Helmet, logs com campos sensíveis ocultos e Swagger.

## Requisitos

- Node.js 22;
- pnpm 10;
- projeto Supabase com Auth habilitado;
- tabelas e funções descritas em `docs/supabase-contract.md`.

## Configuração

```bash
cp .env.example .env
```

Preencha:

- `SUPABASE_URL`: URL pública do projeto;
- `SUPABASE_ANON_KEY`: chave pública usada para operações de autenticação;
- `SUPABASE_SERVICE_ROLE_KEY`: chave privada, somente no servidor; sem ela, apenas health e operações públicas de autenticação ficam disponíveis;
- `CORS_ORIGINS`: origens permitidas separadas por vírgula;
- `SUPABASE_STORAGE_BUCKET`: bucket privado ou público usado para músicas.

Nunca disponibilize `SUPABASE_SERVICE_ROLE_KEY` ao frontend.

## Execução

```bash
pnpm install
pnpm dev:server
```

API: `http://localhost:3001/api/v1`  
Swagger: `http://localhost:3001/api/v1/docs`

O frontend pode ser executado separadamente com `pnpm dev`.

## Comandos

```bash
pnpm test
pnpm build
pnpm start:server
```

## Autorização

Rotas protegidas exigem:

```http
Authorization: Bearer <access-token>
x-institution-id: <uuid-da-instituicao>
```

O backend ignora qualquer `institution_id` enviado no corpo e sempre usa a instituição validada pelo vínculo do usuário. O cliente deve trocar o cabeçalho ao alternar de instituição.

## Música do pódio

O administrador configura a apresentação em:

```http
PUT /api/v1/boards/:id/presentation
```

O frontend consulta:

```http
GET /api/v1/boards/:id/presentation
```

A resposta inclui ranking, pódio, `music_url`, volume, atraso de revelação e configuração de confete. O navegador deve iniciar a reprodução apenas após interação do usuário, respeitando as políticas de autoplay.

## Observação sobre o banco

O backend foi preparado para iniciar sem uma conexão administrativa ativa. Antes da implantação, aplique a migração documentada, configure as RLS e disponibilize as seis RPCs transacionais. A API falhará de forma explícita se esse contrato não estiver presente.

A implementação completa do contrato está disponível em:

```text
supabase/migrations/20261001000000_initial_schema.sql
```

Consulte `supabase/README.md` para aplicar a migração pelo SQL Editor ou pela CLI.
