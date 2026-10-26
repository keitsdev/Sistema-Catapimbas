# Complemento de funcionalidades por perfil

Este documento descreve o que foi **acrescentado** ao projeto (sem remover nem reestruturar a base), onde está, como testar e o que ainda depende de você.

## 1. Situação encontrada

| Camada | Estado ao receber |
|---|---|
| Banco (`supabase/migrations`) | Completo e coerente (contrato em inglês, RPCs, RLS). **Não foi alterado.** |
| Backend (`server/`) | 6 routers bons, mas **não subia**: importavam `server/lib/*`, `authenticate/requireInstitution/requireSystemRole`, `audit`, `calculateRanking`, `exportProjects/exportRanking` (inexistentes); `routes/evaluations.ts` era de outro esquema (tabelas em português). |
| Frontend (`sistema-catapimbas/`) | Telas de leitura sobre mock em memória; sem CRUD, cadastro, bloqueio, auditoria etc. |

## 2. O que foi adicionado

### Frontend (`sistema-catapimbas/src`)
- `servicos/` – camada de dados nova (mesmo contrato do backend): `acesso.ts`, `plataforma.ts`, `projetos.ts`, `bancas.ts`.
- `components/` – `ui.tsx` (hooks/paginação/Excel), `ProjetoEditores.tsx`. `extras.css`.
- Páginas novas: `Publico` (login + `Cadastro` + `Recuperar`), `Plataforma`, `Pessoas`, `Bancas`, `BancaDetalhe` (5 abas), `MinhasAvaliacoes`, `Auditoria`, `Perfil`.
- Páginas estendidas: `Instituicoes` (CRUD), `Projetos` (CRUD, equipe, filtros, Excel), `Dashboard` (filtros ano/semestre), `Resultados` (usa a configuração do pódio).

### Backend (`server/`)
- Encaixe: `lib/http-error.ts`, `lib/supabase.ts`, `types/auth.d.ts`, `middleware/auth.contract.ts`, `services/{audit,ranking,export}.contract.ts`, `services/ranking-core.ts` (cálculo puro), `services/visibility.ts`, `services/users.ts`, `routes/evaluations.contract.ts`.
- Rotas novas: `public.ts`, `session.ts`, `directory.ts`, `platform.ts`, `audit-logs.ts`, `boards-extra.ts`, `projects-extra.ts`.

## 3. Matriz de funcionalidades por perfil

| Perfil | Pode | Não pode (negado no servidor) |
|---|---|---|
| **Superadmin** | Criar/editar/suspender/ativar instituições; designar administrador; ver visão da plataforma, usuários e cadastros pendentes de todas as instituições e aprová-los/recusá-los; auditoria global | Ver notas ou conteúdo interno dos projetos pelo painel |
| **Admin institucional** | Aprovar/recusar (com justificativa); pessoas: mudar papel, bloquear, revogar, restaurar; CRUD de projetos + equipe/orientador + arquivar; bancas: CRUD, participantes, critérios/rubricas, status, publicar/retirar publicação, duplicar, arquivar; invalidar notas; auditoria da instituição | Agir em outra instituição; remover o último admin; alterar o próprio acesso |
| **Coordenador** | Criar/editar projetos e equipes; criar/gerir bancas, designar avaliadores, publicar resultados; acompanhar andamento; consultar pessoas | Aprovar cadastros; bloquear/revogar; arquivar projeto/banca; auditoria |
| **Orientador** | Ver só os projetos que orienta, equipe e resultados publicados | Editar projetos; ver outros projetos |
| **Avaliador** | Ver só bancas designadas; lançar notas; corrigir as próprias enquanto a banca está aberta (versionado e auditado) | Avaliar fora da designação/banca fechada; área administrativa |
| **Aluno** | Ver só seus projetos; editar **apenas a descrição**; resultados publicados | Criar/editar outros campos; ver outros projetos |
| **Todos** | Cadastro com pedido pendente, recuperação e troca de senha, vínculo em outra instituição, exportar dados / pedir exclusão (LGPD), exportar Excel do que podem ver | |

Regras de negócio cobertas: RN01–RN10, RF01–RF16 (veja `servicos/servicos.test.ts` e `server/*.test.ts`).

## 4. Mapa: função do mock → endpoint

| Mock (`servicos/*`) | Endpoint |
|---|---|
| `cadastrarUsuario` | `POST /public/signup-request` |
| `listarInstituicoesPublicas` | `GET /public/institutions` |
| `solicitarRecuperacao` / `redefinirSenha` | `POST /auth/password/reset` (existente) |
| `alterarSenha` | `POST /auth/password/change` |
| `listarPessoas` / `diretorio` | `GET /directory/members?role=&status=` |
| `alterarPapel` / `alterarSituacao` | `PATCH /members/:id` (existente) |
| `decidirSolicitacao` | `PATCH /institutions/:id/join-requests/:membershipId` (existente) |
| `criarInstituicao`, `atualizarInstituicao`, `definirStatusInstituicao` | `POST/PATCH /institutions` (existente) |
| `designarAdmin` | `POST /platform/institutions/:id/admins` |
| `visaoPlataforma` / `solicitacoesPlataforma` | `GET /platform/overview`, `GET /platform/memberships` |
| `listarAuditoria` | `GET /audit-logs` · `GET /platform/audit-logs` |
| `criarProjeto`, `atualizarProjeto`, `arquivarProjeto`, `definirEquipe` | `POST/PATCH/DELETE /projects`, `PUT /projects/:id/team` (existentes) |
| `atualizarProjetoAluno` | `PATCH /projects/:id/profile` |
| `criarBanca`, `atualizarBanca`, `definirParticipantes`, `definirCriterios`, `configurarApresentacao` | rotas de `/boards` (existentes) |
| `arquivarBanca` / `duplicarBanca` / `progressoBanca` | `DELETE /boards/:id` · `POST /boards/:id/duplicate` · `GET /boards/:id/progress` |
| `enviarAvaliacao` / `revisarAvaliacao` / `invalidarAvaliacao` | `POST /evaluations` · `PUT /evaluations/:id` · `POST /evaluations/:id/invalidate` |

## 5. Alterações em arquivos da base (todas pequenas e marcadas)

No backend, os pontos marcados com `[FIX]`:
- `middleware/validate.ts` – no Express 5 `req.query` é só leitura; a atribuição direta lança erro.
- `routes/projects.ts` – filtro por aluno/orientador precisava de `!inner`; visibilidade por perfil; `PATCH` voltava o status para `draft` (default do Zod 4 em `partial()`).
- `routes/boards.ts` – avaliador só vê bancas designadas; orientador/aluno só as publicadas.
- `routes/analytics.ts` – exportações agora recebem o solicitante (RN09; antes um aluno baixaria tudo e rankings não publicados).
- `app.ts` – montagem dos routers novos (antes de `analyticsRouter`, que aplica autenticação a tudo que chega nele).
- `middleware/auth.ts`, `services/{audit,ranking,export}.ts`, `routes/evaluations.ts` – **uma linha de `export … from` no fim**. O código legado acima dela (esquema em português) segue intacto e **sem uso**; pode apagar quando quiser.
- `package.json` – scripts (`dev:server`, `start:server`, `test`) e dependências que o código já usava e faltavam.

No frontend: `api.ts` (stores exportados; papel relido a cada chamada; aprovação passa a atualizar o vínculo; visibilidade; auditoria; ranking com política de empate/precisão e ignorando notas invalidadas), `types.ts` (campos opcionais), `auth.tsx` (menu + queda de sessão ao perder acesso), `App.tsx` (rotas, painel do superadmin, cor da instituição), `Login.tsx` (links), `main.tsx` (css).

## 6. Como rodar

```bash
# backend (precisa do .env com SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)
npm install && npm run dev:server        # http://localhost:3001/api/v1/docs
npm test                                  # testes do backend
# frontend (mock)
cd sistema-catapimbas && npm install && npm run dev && npm test
```
Contas de demonstração (senha `demo1234`): `super@demo.dev`, `admin@demo.dev`, `admin2@demo.dev`, `coord@demo.dev`, `andre@demo.dev` (avaliador na Inst. 1 e orientador na 2), `ricardo@demo.dev` (orientador), `aluno@demo.dev`.

## 7. O que foi verificado e o que não foi

**Executado e passando** (sem rede, então sem `npm install`):
- 29 testes de regras/isolamento da camada de dados (C1–C7, RN02–RN10, permissões por perfil).
- 6 testes do cálculo de ranking (pesos, nota ausente, arredondamento, empate competição/denso).
- 12 testes de autorização do middleware do backend (isolamento entre instituições, bloqueio/revogação/suspensão efetivos na chamada seguinte, superadmin, não gravar segredos em auditoria) – com Supabase/Zod substituídos por fakes mínimos.
- Roteiro no navegador (Chromium) percorrendo cadastro → aprovação → CRUD → banca → auditoria nos 7 perfis, sem erros de página.
- Checagem de tipos do frontend (com *stubs* das bibliotecas) e de sintaxe/imports do backend.

**Não executado** (precisa do seu ambiente): o backend contra um Supabase real; `tsc` do backend com os tipos reais de `express`/`zod`; `npm run build` do frontend; os testes dentro do vitest de verdade (rodei com um shim equivalente). Os routers novos (`public`, `directory`, `platform`, `boards-extra`, …) seguem o padrão dos existentes mas **não foram exercitados contra o banco** – trate o primeiro `npm run dev:server` como o teste deles.

## 8. Limitações e próximos passos
1. **O frontend ainda usa o mock** (em memória, some ao recarregar). A troca por `fetch` é o próximo passo (tabela da seção 4); como os IDs mudam de `number` para `uuid`, os tipos de `types.ts` precisarão acompanhar.
2. O mock não impõe o período (`inicio`/`fim`) da banca; a RPC `submit_evaluation` impõe (`now() between starts_at and ends_at`).
3. Escala de notas fixa em 1–5 na UI (o banco suporta mínimo/máximo por critério).
4. Música do pódio por URL (o bucket `winner-music` do Supabase Storage não foi integrado).
5. O superadmin supervisiona uma instituição agindo como `institution_admin` (mesma regra das funções SQL); restrinja em `auth.contract.ts` se preferir só leitura.
6. Contas criadas no mock guardam a senha em memória (apenas demo). No backend real, Supabase Auth faz o hash.
