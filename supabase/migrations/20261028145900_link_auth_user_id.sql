begin;

alter table public."Usuario"
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists usuario_auth_user_id_unique
  on public."Usuario" (auth_user_id)
  where auth_user_id is not null;

comment on column public."Usuario".auth_user_id is
  'UUID de auth.users associado ao perfil legado; deve ser vinculado com validação administrativa.';

commit;
