begin;

create table public.board_invitations (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  board_id uuid not null,
  project_id uuid not null,
  token_hash text not null unique check (char_length(token_hash) = 64),
  max_uses integer not null check (max_uses between 1 and 20),
  uses integer not null default 0 check (uses >= 0),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (uses <= max_uses),
  foreign key (board_id, project_id) references public.board_projects (board_id, project_id) on delete cascade
);
create index board_invitations_board_project_idx on public.board_invitations (board_id, project_id);
create index board_invitations_institution_idx on public.board_invitations (institution_id, created_at desc);

alter table public.institutional_memberships
  add column scope_board_id uuid references public.boards(id) on delete cascade,
  add column scope_project_id uuid references public.projects(id) on delete cascade,
  add column invitation_id uuid references public.board_invitations(id) on delete set null,
  add column organization text check (organization is null or char_length(organization) <= 160),
  add constraint memberships_scope_pair check ((scope_board_id is null) = (scope_project_id is null)),
  add constraint memberships_scope_evaluator_only check (scope_board_id is null or role = 'evaluator');

create or replace function public.claim_board_invitation(p_token_hash text)
returns public.board_invitations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.board_invitations;
begin
  update public.board_invitations i
     set uses = i.uses + 1
   where i.token_hash = p_token_hash
     and i.revoked_at is null
     and i.expires_at > now()
     and i.uses < i.max_uses
  returning i.* into v_row;
  if not found then
    raise exception 'invalid invitation';
  end if;
  return v_row;
end;
$$;

create or replace function public.release_board_invitation(p_id uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  update public.board_invitations set uses = greatest(uses - 1, 0) where id = p_id;
$$;

create or replace function public.enforce_evaluator_scope_on_evaluations()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from public.institutional_memberships m
    where m.institution_id = new.institution_id
      and m.user_id = new.evaluator_id
      and m.scope_board_id is not null
      and (m.scope_board_id <> new.board_id or m.scope_project_id <> new.project_id)
  ) then
    raise exception 'evaluator is restricted to the invited project' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger evaluations_enforce_scope before insert on public.evaluations
  for each row execute function public.enforce_evaluator_scope_on_evaluations();

create or replace function public.enforce_evaluator_scope_on_board_evaluators()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
    from public.institutional_memberships m
    join public.boards b on b.institution_id = m.institution_id
    where b.id = new.board_id
      and m.user_id = new.evaluator_id
      and m.scope_board_id is not null
      and m.scope_board_id <> new.board_id
  ) then
    raise exception 'evaluator is restricted to the invited board' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger board_evaluators_enforce_scope before insert on public.board_evaluators
  for each row execute function public.enforce_evaluator_scope_on_board_evaluators();

alter table public.board_invitations enable row level security;
revoke all on function public.claim_board_invitation(text) from public, anon, authenticated;
revoke all on function public.release_board_invitation(uuid) from public, anon, authenticated;
grant execute on function public.claim_board_invitation(text) to service_role;
grant execute on function public.release_board_invitation(uuid) to service_role;

commit;
