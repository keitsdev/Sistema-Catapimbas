# Relatório de compatibilidade com o Supabase

Validação realizada com acesso administrativo ao PostgREST.

## Conectividade

- Supabase Auth: acessível.
- PostgREST com chave administrativa: acessível.
- Chave de servidor: válida.
- Conexão PostgreSQL direta pelo pooler: indisponível no ambiente de validação por timeout.

## Esquema encontrado

O banco publica 18 tabelas:

- `Auditoria`
- `Avaliacao`
- `Avaliador`
- `Banca`
- `BancaAvaliador`
- `BancaProjeto`
- `CriterioAvaliativo`
- `Equipe`
- `Instituicao`
- `IntegranteEquipe`
- `Orientacao`
- `Orientador`
- `Papel`
- `PapelPermissao`
- `Permissao`
- `Projeto`
- `Usuario`
- `VinculoInstitucional`

A única RPC publicada é `rls_auto_enable`.

## Bloqueios para a API

### Identidade

`Usuario.id` e `VinculoInstitucional.usuario_id` são inteiros, enquanto o Supabase Auth identifica usuários por UUID em `auth.users.id`. Não existe uma coluna pública `auth_user_id uuid` que permita associar com segurança o JWT a um usuário do domínio.

Sem esse vínculo, o backend não pode determinar de forma segura qual vínculo institucional pertence ao usuário autenticado.

### Autenticação

`Usuario` contém `hash_senha`, mas o backend usa Supabase Auth. Senhas não devem ser duplicadas na tabela pública. A equipe do banco deve escolher uma única fonte de identidade:

1. manter Supabase Auth e substituir `hash_senha` por `auth_user_id uuid unique references auth.users(id)`; ou
2. substituir integralmente o fluxo de autenticação do backend, o que não é recomendado.

### Isolamento institucional

Diversas tabelas usam nomes de pessoas e recursos em campos `varchar`, por exemplo:

- `Avaliacao.avaliador`;
- `Avaliacao.banca`;
- `Avaliacao.projeto`;
- `Avaliacao.criterio`;
- `CriterioAvaliativo.banca`.

Esses campos precisam ser chaves estrangeiras. Nomes livres não garantem integridade, impedem isolamento multi-tenant confiável e tornam alterações históricas inseguras.

### Avaliações

O banco atual não publica funções transacionais para:

- rejeitar avaliação duplicada;
- validar avaliador designado;
- conferir projeto participante;
- conferir escala dos critérios;
- registrar todas as notas atomicamente;
- auditar revisões.

### Ranking

`CriterioAvaliativo` mistura configuração de critério com campo `nota`. O backend necessita separar:

- definição do critério e peso;
- descritores/rubricas;
- avaliação;
- notas por critério.

### Apresentação e música

Não existe tabela publicada para URL da música, volume, atraso da revelação e configuração de confete.

## Decisão de integração

O backend não foi adaptado diretamente a esse esquema porque isso removeria garantias obrigatórias de autenticação, integridade e isolamento institucional.

A migração em `supabase/migrations/20261001000000_initial_schema.sql` representa o contrato seguro esperado pela API. A equipe responsável pelo banco pode:

1. aplicar esse modelo em um esquema limpo; ou
2. migrar as tabelas existentes para as mesmas garantias e fornecer uma camada de compatibilidade.

Não aplique a migração sem revisar os dados existentes. Ela cria novas tabelas em inglês e não converte automaticamente as tabelas atuais.

## Mudanças mínimas para compatibilidade

1. adicionar vínculo UUID entre perfil público e `auth.users`;
2. criar chaves estrangeiras reais em avaliações e critérios;
3. separar avaliações de notas por critério;
4. adicionar configuração de apresentação;
5. implementar as seis RPCs documentadas;
6. configurar RLS por instituição;
7. preservar auditoria e versionamento de avaliações;
8. informar ao backend os nomes finais de tabelas, colunas e RPCs.
