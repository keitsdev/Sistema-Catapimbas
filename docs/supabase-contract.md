# Contrato do Supabase

Este documento é a interface entre a API e o banco. Nomes de tabelas, colunas, estados e RPCs abaixo devem ser preservados.

## Variáveis

| Variável                    | Uso                                          |
| --------------------------- | -------------------------------------------- |
| `SUPABASE_URL`              | URL do projeto Supabase                      |
| `SUPABASE_PUBLISHABLE_KEY` (ou `SUPABASE_ANON_KEY` legado) | autenticação de usuários |
| `SUPABASE_SECRET_KEY` (ou `SUPABASE_SERVICE_ROLE_KEY` legado) | consultas administrativas do backend; nunca expor ao cliente |
| `SUPABASE_STORAGE_BUCKET`   | bucket para músicas do pódio                 |

## Identidade

Usuários pertencem a `auth.users`. Nome público é armazenado em `raw_user_meta_data.name`. O superadministrador possui `raw_app_meta_data.system_role = "superadmin"`.

## Tabelas necessárias

### `institutions`

`id uuid PK`, `name text`, `slug text UNIQUE`, `status active|suspended`, `visual_config jsonb`, timestamps.

### `institutional_memberships`

`id uuid PK`, `institution_id FK`, `user_id FK auth.users`, `role`, `status`, `rejection_reason`, `status_reason`, `approved_by`, `approved_at`, `updated_by`, timestamps.

Papéis: `institution_admin`, `coordinator`, `advisor`, `evaluator`, `student`.  
Situações: `pending`, `approved`, `rejected`, `blocked`, `revoked`.  
Restrição única: `(institution_id, user_id)`.

### `projects`

`id uuid PK`, `institution_id FK`, `name`, `description`, `year`, `semester`, `status`, `archived_at`, `archived_by`, timestamps.

Índices mínimos: `(institution_id, year, semester)`, `(institution_id, status)` e índice de busca para `name`.

### `team_members` e `project_advisors`

`team_members(project_id, user_id, role)` e `project_advisors(project_id, user_id)`. Os usuários devem ter vínculo aprovado na mesma instituição do projeto.

### `boards`

`id uuid PK`, `institution_id FK`, `name`, `starts_at`, `ends_at`, `status`, `results_status`, `tie_policy`, `score_precision`, `archived_at`, timestamps.

Estados: `draft`, `open`, `closed`, `archived`.  
Resultados: `draft`, `published`.  
Empate: `competition` ou `dense`.

### `board_projects` e `board_evaluators`

`board_projects(board_id, project_id, eligible boolean)` e `board_evaluators(board_id, evaluator_id)`. Todos os relacionamentos precisam pertencer à mesma instituição.

### `criteria` e `rubrics`

`criteria(id, board_id, title, description, weight, minimum_score, maximum_score, active, version)` e `rubrics(id, criterion_id, score, descriptor)`.

Critérios usados por avaliações publicadas não devem ser alterados; uma nova versão deve ser criada.

### `evaluations` e `evaluation_scores`

`evaluations(id, institution_id, board_id, project_id, evaluator_id, status, notes, submitted_at, version, timestamps)`.

`evaluation_scores(id, evaluation_id, criterion_id, score, comment)`.

Restrição única parcial: apenas uma avaliação ativa por `(board_id, project_id, evaluator_id)`. Notas precisam estar dentro da escala do critério. Somente avaliadores designados podem submeter em bancas abertas.

### `presentation_settings`

`board_id PK/FK`, `institution_id FK`, `music_enabled boolean`, `music_title text nullable`, `music_url text nullable`, `volume numeric CHECK 0..1`, `reveal_delay_ms int`, `confetti_enabled boolean`, `updated_by`, `updated_at`.

Prefira armazenar o objeto de áudio no bucket configurado e persistir a URL pública ou assinada. Não armazene binários na tabela.

### `audit_logs`

`id`, `institution_id nullable`, `actor_id`, `action`, `entity_type`, `entity_id`, `changes jsonb`, `ip_address`, `user_agent`, `created_at`.

Registros de auditoria devem ser somente inserção para usuários da aplicação.

## RPCs obrigatórias

As RPCs devem executar em transação, validar instituição e lançar erro quando algum relacionamento cruzar instituições.

### `replace_project_team`

Parâmetros: `p_institution_id uuid`, `p_project_id uuid`, `p_members jsonb`, `p_advisor_ids uuid[]`, `p_actor_id uuid`.

Substitui equipe e orientadores após validar vínculos aprovados.

### `replace_board_participants`

Parâmetros: `p_institution_id uuid`, `p_board_id uuid`, `p_project_ids uuid[]`, `p_evaluator_ids uuid[]`, `p_actor_id uuid`.

Substitui projetos e avaliadores. Projetos e usuários devem pertencer à instituição.

### `replace_board_criteria`

Parâmetros: `p_institution_id uuid`, `p_board_id uuid`, `p_criteria jsonb`, `p_actor_id uuid`.

Substitui critérios apenas antes de avaliações válidas. Depois disso deve versionar ou rejeitar.

### `submit_evaluation`

Parâmetros: `p_institution_id uuid`, `p_board_id uuid`, `p_project_id uuid`, `p_evaluator_id uuid`, `p_scores jsonb`, `p_notes text`.

Valida banca aberta, designação, projeto participante, escala, completude e duplicidade; cria avaliação e notas atomicamente.

### `revise_evaluation`

Parâmetros: `p_institution_id uuid`, `p_evaluation_id uuid`, `p_evaluator_id uuid`, `p_scores jsonb`, `p_notes text`.

Aplica a política de edição, incrementa versão e registra valores anteriores na auditoria.

### `institution_dashboard`

Parâmetros: `p_institution_id uuid`, `p_year int nullable`, `p_semester int nullable`.

Retorna contagens, projetos por status/período e avaliações concluídas, sempre limitados à instituição.

## RLS

Mesmo usando `service_role` no backend, implemente RLS para acessos diretos futuros:

1. derive `auth.uid()` do JWT;
2. permita acesso somente com vínculo `approved`;
3. compare `institution_id` em toda política;
4. limite mutações por papel;
5. negue por padrão;
6. nunca aceite instituição apenas de parâmetros sem conferir os relacionamentos.

O isolamento também é aplicado pela API, que sempre filtra por `req.auth.institutionId`.

## Música

Tipos recomendados: `audio/mpeg`, `audio/ogg`, `audio/wav`. Defina limite de tamanho e valide MIME no upload. A API atual recebe uma URL; o fluxo de upload pode ser implementado diretamente pelo frontend com URL assinada ou por uma rota dedicada posterior.
