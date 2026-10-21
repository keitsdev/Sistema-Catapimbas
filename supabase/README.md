# Banco Supabase

A migração `migrations/20261001000000_initial_schema.sql` contém o esquema completo esperado pela API.

> O projeto remoto validado já possui tabelas em português com estrutura diferente. Não aplique esta migração diretamente sobre esse banco sem ler `docs/database-gap-report.md` e planejar a conversão com a equipe responsável pelos dados.

## Aplicação pelo painel

1. Rotacione a senha do banco que foi compartilhada fora do painel.
2. Acesse Supabase Dashboard → SQL Editor → New query.
3. Cole o conteúdo integral da migração.
4. Execute a consulta uma única vez.
5. Em Project Settings → API Keys, copie uma chave do tipo `service_role`/secret para `SUPABASE_SERVICE_ROLE_KEY` no ambiente do backend.
6. Não use a chave privada em código frontend.

## Aplicação pela CLI

Quando o projeto estiver vinculado e a rede permitir conexão PostgreSQL:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

Não inclua senha ou token de acesso em comandos versionados.

## Primeiro superadministrador

Crie o usuário pelo Supabase Auth e, no SQL Editor, atribua o papel de sistema usando o UUID exibido no painel:

```sql
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"system_role":"superadmin"}'::jsonb
where id = '<uuid-do-usuario>';
```

Use apenas uma conta administrativa controlada para o primeiro acesso.

## Verificação

Depois de aplicar:

1. configure `SUPABASE_SERVICE_ROLE_KEY`;
2. inicie a API;
3. confirme `/api/v1/health`;
4. cadastre o primeiro usuário;
5. crie duas instituições;
6. teste que um usuário da instituição A não acessa registros da instituição B;
7. configure banca, critérios, avaliador e projeto;
8. envie uma avaliação e consulte ranking e apresentação;
9. configure uma URL de áudio em `presentation_settings`.

## Observações

- A migração cria o bucket privado `winner-music`.
- O limite por arquivo é 20 MiB.
- MIME types permitidos: MP3, OGG e WAV.
- Exclusões de projeto são lógicas pela API.
- Avaliações submetidas são preservadas e revisões ficam registradas na auditoria.
