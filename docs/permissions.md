# Matriz de permissões

| Recurso      | Superadmin        | Admin institucional       | Coordenador        | Orientador           | Avaliador                    | Aluno                |
| ------------ | ----------------- | ------------------------- | ------------------ | -------------------- | ---------------------------- | -------------------- |
| Instituições | gerencia todas    | consulta a própria        | consulta           | consulta             | consulta                     | consulta             |
| Vínculos     | supervisão        | aprova, bloqueia e revoga | consulta           | próprio              | próprio                      | próprio              |
| Projetos     | supervisão        | gerencia                  | gerencia           | consulta vinculados  | consulta designados          | consulta vinculados  |
| Bancas       | supervisão        | gerencia                  | gerencia           | consulta autorizadas | consulta designadas          | consulta autorizadas |
| Critérios    | supervisão        | gerencia                  | gerencia           | consulta             | consulta                     | consulta             |
| Avaliações   | auditoria         | auditoria                 | acompanha          | consulta autorizadas | envia e revisa pela política | sem escrita          |
| Ranking      | todos autorizados | rascunho/publicado        | rascunho/publicado | publicado            | publicado                    | publicado            |
| Música/pódio | supervisão        | configura                 | configura          | visualiza            | visualiza                    | visualiza            |
| Excel        | conforme escopo   | exporta                   | exporta            | conforme acesso      | conforme acesso              | conforme acesso      |

Menus do frontend não substituem as verificações da API.
