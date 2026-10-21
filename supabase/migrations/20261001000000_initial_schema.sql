begin;

create extension if not exists pgcrypto;

create type public.institution_status as enum ('active', 'suspended');
create type public.membership_role as enum (
  'institution_admin',
  'coordinator',
  'advisor',
  'evaluator',
  'student'
);
create type public.membership_status as enum ('pending', 'approved', 'rejected', 'blocked', 'revoked');
create type public.project_status as enum ('draft', 'active', 'completed', 'cancelled');
create type public.board_status as enum ('draft', 'open', 'closed', 'archived');
create type public.results_status as enum ('draft', 'published');
create type public.tie_policy as enum ('competition', 'dense');
create type public.evaluation_status as enum ('submitted', 'validated', 'invalidated');

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status public.institution_status not null default 'active',
  visual_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.institutional_memberships (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.membership_role not null,
  status public.membership_status not null default 'pending',
  rejection_reason text,
  status_reason text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, user_id),
  check (status <> 'rejected' or rejection_reason is not null),
  check (status not in ('blocked', 'revoked') or status_reason is not null)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 180),
  description text not null check (char_length(description) between 10 and 5000),
  year integer not null check (year between 2000 and 2100),
  semester integer not null check (semester in (1, 2)),
  status public.project_status not null default 'draft',
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null check (char_length(role) between 2 and 80),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.project_advisors (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete restrict,
  name text not null check (char_length(name) between 3 and 180),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.board_status not null default 'draft',
  results_status public.results_status not null default 'draft',
  tie_policy public.tie_policy not null default 'competition',
  score_precision integer not null default 2 check (score_precision between 0 and 4),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.board_projects (
  board_id uuid not null references public.boards(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  eligible boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (board_id, project_id)
);

create table public.board_evaluators (
  board_id uuid not null references public.boards(id) on delete cascade,
  evaluator_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (board_id, evaluator_id)
);

create table public.criteria (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 180),
  description text not null default '',
  weight numeric(10, 4) not null check (weight > 0 and weight <= 1000),
  minimum_score integer not null,
  maximum_score integer not null,
  active boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (maximum_score > minimum_score)
);

create table public.rubrics (
  id uuid primary key default gen_random_uuid(),
  criterion_id uuid not null references public.criteria(id) on delete cascade,
  score integer not null,
  descriptor text not null check (char_length(descriptor) between 3 and 2000),
  created_at timestamptz not null default now(),
  unique (criterion_id, score)
);

create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete restrict,
  board_id uuid not null references public.boards(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  evaluator_id uuid not null references auth.users(id) on delete restrict,
  status public.evaluation_status not null default 'submitted',
  notes text check (notes is null or char_length(notes) <= 5000),
  submitted_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index evaluations_one_active_submission
  on public.evaluations(board_id, project_id, evaluator_id)
  where status in ('submitted', 'validated');

create table public.evaluation_scores (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  criterion_id uuid not null references public.criteria(id) on delete restrict,
  score integer not null,
  comment text check (comment is null or char_length(comment) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (evaluation_id, criterion_id)
);

create table public.presentation_settings (
  board_id uuid primary key references public.boards(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  music_enabled boolean not null default false,
  music_title text check (music_title is null or char_length(music_title) <= 180),
  music_url text check (music_url is null or char_length(music_url) <= 2000),
  volume numeric(4, 3) not null default 0.8 check (volume between 0 and 1),
  reveal_delay_ms integer not null default 1000 check (reveal_delay_ms between 0 and 60000),
  confetti_enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not music_enabled or music_url is not null)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  institution_id uuid references public.institutions(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  changes jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index memberships_user_status_idx
  on public.institutional_memberships(user_id, status);
create index memberships_institution_status_idx
  on public.institutional_memberships(institution_id, status);
create index projects_institution_period_idx
  on public.projects(institution_id, year, semester);
create index projects_institution_status_idx
  on public.projects(institution_id, status);
create index projects_name_search_idx
  on public.projects using gin(to_tsvector('portuguese', name));
create index boards_institution_starts_idx
  on public.boards(institution_id, starts_at desc);
create index evaluations_board_project_idx
  on public.evaluations(board_id, project_id);
create index evaluations_evaluator_idx
  on public.evaluations(evaluator_id, board_id);
create index audit_logs_institution_created_idx
  on public.audit_logs(institution_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger institutions_set_updated_at before update on public.institutions
for each row execute function public.set_updated_at();
create trigger memberships_set_updated_at before update on public.institutional_memberships
for each row execute function public.set_updated_at();
create trigger projects_set_updated_at before update on public.projects
for each row execute function public.set_updated_at();
create trigger boards_set_updated_at before update on public.boards
for each row execute function public.set_updated_at();
create trigger criteria_set_updated_at before update on public.criteria
for each row execute function public.set_updated_at();
create trigger evaluations_set_updated_at before update on public.evaluations
for each row execute function public.set_updated_at();
create trigger evaluation_scores_set_updated_at before update on public.evaluation_scores
for each row execute function public.set_updated_at();
create trigger presentation_settings_set_updated_at before update on public.presentation_settings
for each row execute function public.set_updated_at();

create or replace function public.is_system_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, auth
as $$
  select coalesce(
    (select raw_app_meta_data ->> 'system_role' = 'superadmin'
       from auth.users where id = p_user_id),
    false
  );
$$;

create or replace function public.has_institution_access(p_user_id uuid, p_institution_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_system_admin(p_user_id)
    or exists (
      select 1
      from public.institutional_memberships
      where user_id = p_user_id
        and institution_id = p_institution_id
        and status = 'approved'
    );
$$;

create or replace function public.has_institution_role(
  p_user_id uuid,
  p_institution_id uuid,
  p_roles public.membership_role[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_system_admin(p_user_id)
    or exists (
      select 1
      from public.institutional_memberships
      where user_id = p_user_id
        and institution_id = p_institution_id
        and status = 'approved'
        and role = any(p_roles)
    );
$$;

create or replace function public.replace_project_team(
  p_institution_id uuid,
  p_project_id uuid,
  p_members jsonb,
  p_advisor_ids uuid[],
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_member jsonb;
  v_advisor uuid;
begin
  if not public.has_institution_role(
    p_actor_id, p_institution_id, array['institution_admin', 'coordinator']::public.membership_role[]
  ) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.projects
    where id = p_project_id and institution_id = p_institution_id and archived_at is null
  ) then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  for v_member in select value from jsonb_array_elements(coalesce(p_members, '[]'::jsonb))
  loop
    if not exists (
      select 1 from public.institutional_memberships
      where institution_id = p_institution_id
        and user_id = (v_member ->> 'userId')::uuid
        and role = 'student'
        and status = 'approved'
    ) then
      raise exception 'invalid student membership';
    end if;
  end loop;

  foreach v_advisor in array coalesce(p_advisor_ids, array[]::uuid[])
  loop
    if not exists (
      select 1 from public.institutional_memberships
      where institution_id = p_institution_id
        and user_id = v_advisor
        and role = 'advisor'
        and status = 'approved'
    ) then
      raise exception 'invalid advisor membership';
    end if;
  end loop;

  delete from public.team_members where project_id = p_project_id;
  delete from public.project_advisors where project_id = p_project_id;

  insert into public.team_members(project_id, user_id, role)
  select p_project_id, (value ->> 'userId')::uuid, value ->> 'role'
  from jsonb_array_elements(coalesce(p_members, '[]'::jsonb));

  insert into public.project_advisors(project_id, user_id)
  select p_project_id, value
  from unnest(coalesce(p_advisor_ids, array[]::uuid[])) value;

  return jsonb_build_object(
    'projectId', p_project_id,
    'memberCount', jsonb_array_length(coalesce(p_members, '[]'::jsonb)),
    'advisorCount', cardinality(coalesce(p_advisor_ids, array[]::uuid[]))
  );
end;
$$;

create or replace function public.replace_board_participants(
  p_institution_id uuid,
  p_board_id uuid,
  p_project_ids uuid[],
  p_evaluator_ids uuid[],
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.has_institution_role(
    p_actor_id, p_institution_id, array['institution_admin', 'coordinator']::public.membership_role[]
  ) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.boards
    where id = p_board_id and institution_id = p_institution_id and archived_at is null
  ) then
    raise exception 'board not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_project_ids, array[]::uuid[])) requested(id)
    left join public.projects p on p.id = requested.id
    where p.id is null or p.institution_id <> p_institution_id or p.archived_at is not null
  ) then
    raise exception 'project belongs to another institution';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_evaluator_ids, array[]::uuid[])) requested(id)
    left join public.institutional_memberships m
      on m.user_id = requested.id
     and m.institution_id = p_institution_id
     and m.role = 'evaluator'
     and m.status = 'approved'
    where m.id is null
  ) then
    raise exception 'invalid evaluator membership';
  end if;

  delete from public.board_projects where board_id = p_board_id;
  delete from public.board_evaluators where board_id = p_board_id;

  insert into public.board_projects(board_id, project_id)
  select p_board_id, value from unnest(coalesce(p_project_ids, array[]::uuid[])) value;

  insert into public.board_evaluators(board_id, evaluator_id)
  select p_board_id, value from unnest(coalesce(p_evaluator_ids, array[]::uuid[])) value;

  return jsonb_build_object(
    'boardId', p_board_id,
    'projectCount', cardinality(coalesce(p_project_ids, array[]::uuid[])),
    'evaluatorCount', cardinality(coalesce(p_evaluator_ids, array[]::uuid[]))
  );
end;
$$;

create or replace function public.replace_board_criteria(
  p_institution_id uuid,
  p_board_id uuid,
  p_criteria jsonb,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_criterion jsonb;
  v_rubric jsonb;
  v_criterion_id uuid;
begin
  if not public.has_institution_role(
    p_actor_id, p_institution_id, array['institution_admin', 'coordinator']::public.membership_role[]
  ) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.boards
    where id = p_board_id and institution_id = p_institution_id and archived_at is null
  ) then
    raise exception 'board not found' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.evaluations where board_id = p_board_id) then
    raise exception 'criteria cannot be replaced after evaluations exist';
  end if;

  delete from public.criteria where board_id = p_board_id;

  for v_criterion in select value from jsonb_array_elements(coalesce(p_criteria, '[]'::jsonb))
  loop
    v_criterion_id := coalesce(nullif(v_criterion ->> 'id', '')::uuid, gen_random_uuid());
    insert into public.criteria(
      id, board_id, title, description, weight, minimum_score, maximum_score
    ) values (
      v_criterion_id,
      p_board_id,
      v_criterion ->> 'title',
      coalesce(v_criterion ->> 'description', ''),
      (v_criterion ->> 'weight')::numeric,
      (v_criterion ->> 'minimumScore')::integer,
      (v_criterion ->> 'maximumScore')::integer
    );

    for v_rubric in
      select value from jsonb_array_elements(coalesce(v_criterion -> 'rubrics', '[]'::jsonb))
    loop
      if (v_rubric ->> 'score')::integer < (v_criterion ->> 'minimumScore')::integer
         or (v_rubric ->> 'score')::integer > (v_criterion ->> 'maximumScore')::integer then
        raise exception 'rubric score outside criterion scale';
      end if;
      insert into public.rubrics(criterion_id, score, descriptor)
      values (
        v_criterion_id,
        (v_rubric ->> 'score')::integer,
        v_rubric ->> 'descriptor'
      );
    end loop;
  end loop;

  return jsonb_build_object(
    'boardId', p_board_id,
    'criterionCount', jsonb_array_length(coalesce(p_criteria, '[]'::jsonb))
  );
end;
$$;

create or replace function public.submit_evaluation(
  p_institution_id uuid,
  p_board_id uuid,
  p_project_id uuid,
  p_evaluator_id uuid,
  p_scores jsonb,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_evaluation_id uuid;
  v_score jsonb;
  v_criterion public.criteria%rowtype;
begin
  if not public.has_institution_role(
    p_evaluator_id, p_institution_id, array['evaluator']::public.membership_role[]
  ) then
    raise exception 'evaluator access denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.boards
    where id = p_board_id
      and institution_id = p_institution_id
      and status = 'open'
      and now() between starts_at and ends_at
  ) then
    raise exception 'board is not open';
  end if;

  if not exists (
    select 1 from public.board_evaluators
    where board_id = p_board_id and evaluator_id = p_evaluator_id
  ) then
    raise exception 'evaluator is not assigned';
  end if;

  if not exists (
    select 1
    from public.board_projects bp
    join public.projects p on p.id = bp.project_id
    where bp.board_id = p_board_id
      and bp.project_id = p_project_id
      and bp.eligible
      and p.institution_id = p_institution_id
  ) then
    raise exception 'project is not eligible';
  end if;

  if jsonb_array_length(coalesce(p_scores, '[]'::jsonb)) <>
     (select count(*) from public.criteria where board_id = p_board_id and active) then
    raise exception 'all active criteria must be scored';
  end if;

  if (
    select count(distinct value ->> 'criterionId')
    from jsonb_array_elements(coalesce(p_scores, '[]'::jsonb))
  ) <> jsonb_array_length(coalesce(p_scores, '[]'::jsonb)) then
    raise exception 'duplicate criterion score';
  end if;

  insert into public.evaluations(
    institution_id, board_id, project_id, evaluator_id, notes
  ) values (
    p_institution_id, p_board_id, p_project_id, p_evaluator_id, p_notes
  ) returning id into v_evaluation_id;

  for v_score in select value from jsonb_array_elements(p_scores)
  loop
    select * into v_criterion
    from public.criteria
    where id = (v_score ->> 'criterionId')::uuid
      and board_id = p_board_id
      and active;

    if not found then
      raise exception 'criterion not found';
    end if;
    if (v_score ->> 'score')::integer not between v_criterion.minimum_score and v_criterion.maximum_score then
      raise exception 'score outside criterion scale';
    end if;

    insert into public.evaluation_scores(evaluation_id, criterion_id, score, comment)
    values (
      v_evaluation_id,
      v_criterion.id,
      (v_score ->> 'score')::integer,
      nullif(v_score ->> 'comment', '')
    );
  end loop;

  return v_evaluation_id;
end;
$$;

create or replace function public.revise_evaluation(
  p_institution_id uuid,
  p_evaluation_id uuid,
  p_evaluator_id uuid,
  p_scores jsonb,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_evaluation public.evaluations%rowtype;
  v_old_scores jsonb;
  v_score jsonb;
  v_criterion public.criteria%rowtype;
begin
  select * into v_evaluation
  from public.evaluations
  where id = p_evaluation_id
    and institution_id = p_institution_id
    and evaluator_id = p_evaluator_id
    and status = 'submitted'
  for update;

  if not found then
    raise exception 'editable evaluation not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.boards
    where id = v_evaluation.board_id
      and institution_id = p_institution_id
      and status = 'open'
      and now() between starts_at and ends_at
  ) then
    raise exception 'board is not open for revision';
  end if;

  if jsonb_array_length(coalesce(p_scores, '[]'::jsonb)) <>
     (select count(*) from public.criteria where board_id = v_evaluation.board_id and active) then
    raise exception 'all active criteria must be scored';
  end if;

  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
  into v_old_scores
  from public.evaluation_scores s
  where evaluation_id = p_evaluation_id;

  delete from public.evaluation_scores where evaluation_id = p_evaluation_id;

  for v_score in select value from jsonb_array_elements(p_scores)
  loop
    select * into v_criterion
    from public.criteria
    where id = (v_score ->> 'criterionId')::uuid
      and board_id = v_evaluation.board_id
      and active;

    if not found then
      raise exception 'criterion not found';
    end if;
    if (v_score ->> 'score')::integer not between v_criterion.minimum_score and v_criterion.maximum_score then
      raise exception 'score outside criterion scale';
    end if;

    insert into public.evaluation_scores(evaluation_id, criterion_id, score, comment)
    values (
      p_evaluation_id,
      v_criterion.id,
      (v_score ->> 'score')::integer,
      nullif(v_score ->> 'comment', '')
    );
  end loop;

  update public.evaluations
  set notes = p_notes, version = version + 1, submitted_at = now()
  where id = p_evaluation_id;

  insert into public.audit_logs(
    institution_id, actor_id, action, entity_type, entity_id, changes
  ) values (
    p_institution_id,
    p_evaluator_id,
    'revise',
    'evaluation',
    p_evaluation_id::text,
    jsonb_build_object('previousScores', v_old_scores, 'previousNotes', v_evaluation.notes)
  );

  return p_evaluation_id;
end;
$$;

create or replace function public.institution_dashboard(
  p_institution_id uuid,
  p_year integer default null,
  p_semester integer default null
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'projectsTotal', (
      select count(*) from public.projects
      where institution_id = p_institution_id
        and archived_at is null
        and (p_year is null or year = p_year)
        and (p_semester is null or semester = p_semester)
    ),
    'projectsByStatus', (
      select coalesce(jsonb_object_agg(status, total), '{}'::jsonb)
      from (
        select status, count(*) total
        from public.projects
        where institution_id = p_institution_id
          and archived_at is null
          and (p_year is null or year = p_year)
          and (p_semester is null or semester = p_semester)
        group by status
      ) grouped
    ),
    'boardsTotal', (
      select count(*) from public.boards
      where institution_id = p_institution_id and archived_at is null
    ),
    'evaluationsCompleted', (
      select count(*) from public.evaluations
      where institution_id = p_institution_id and status in ('submitted', 'validated')
    ),
    'pendingMemberships', (
      select count(*) from public.institutional_memberships
      where institution_id = p_institution_id and status = 'pending'
    )
  );
$$;

alter table public.institutions enable row level security;
alter table public.institutional_memberships enable row level security;
alter table public.projects enable row level security;
alter table public.team_members enable row level security;
alter table public.project_advisors enable row level security;
alter table public.boards enable row level security;
alter table public.board_projects enable row level security;
alter table public.board_evaluators enable row level security;
alter table public.criteria enable row level security;
alter table public.rubrics enable row level security;
alter table public.evaluations enable row level security;
alter table public.evaluation_scores enable row level security;
alter table public.presentation_settings enable row level security;
alter table public.audit_logs enable row level security;

create policy institutions_select on public.institutions for select
using (public.has_institution_access(auth.uid(), id));
create policy institutions_superadmin_all on public.institutions for all
using (public.is_system_admin(auth.uid()))
with check (public.is_system_admin(auth.uid()));

create policy memberships_select on public.institutional_memberships for select
using (
  user_id = auth.uid()
  or public.has_institution_role(
    auth.uid(), institution_id, array['institution_admin']::public.membership_role[]
  )
  or public.is_system_admin(auth.uid())
);
create policy memberships_request on public.institutional_memberships for insert
with check (
  user_id = auth.uid()
  and status = 'pending'
  and role in ('advisor', 'evaluator', 'student')
);
create policy memberships_admin_update on public.institutional_memberships for update
using (
  public.has_institution_role(
    auth.uid(), institution_id, array['institution_admin']::public.membership_role[]
  )
  or public.is_system_admin(auth.uid())
)
with check (
  public.has_institution_role(
    auth.uid(), institution_id, array['institution_admin']::public.membership_role[]
  )
  or public.is_system_admin(auth.uid())
);

create policy projects_select on public.projects for select
using (public.has_institution_access(auth.uid(), institution_id));
create policy projects_manage on public.projects for all
using (
  public.has_institution_role(
    auth.uid(), institution_id, array['institution_admin', 'coordinator']::public.membership_role[]
  )
)
with check (
  public.has_institution_role(
    auth.uid(), institution_id, array['institution_admin', 'coordinator']::public.membership_role[]
  )
);

create policy boards_select on public.boards for select
using (public.has_institution_access(auth.uid(), institution_id));
create policy boards_manage on public.boards for all
using (
  public.has_institution_role(
    auth.uid(), institution_id, array['institution_admin', 'coordinator']::public.membership_role[]
  )
)
with check (
  public.has_institution_role(
    auth.uid(), institution_id, array['institution_admin', 'coordinator']::public.membership_role[]
  )
);

create policy team_members_select on public.team_members for select
using (
  exists (
    select 1 from public.projects p
    where p.id = project_id and public.has_institution_access(auth.uid(), p.institution_id)
  )
);
create policy project_advisors_select on public.project_advisors for select
using (
  exists (
    select 1 from public.projects p
    where p.id = project_id and public.has_institution_access(auth.uid(), p.institution_id)
  )
);
create policy board_projects_select on public.board_projects for select
using (
  exists (
    select 1 from public.boards b
    where b.id = board_id and public.has_institution_access(auth.uid(), b.institution_id)
  )
);
create policy board_evaluators_select on public.board_evaluators for select
using (
  evaluator_id = auth.uid()
  or exists (
    select 1 from public.boards b
    where b.id = board_id
      and public.has_institution_role(
        auth.uid(), b.institution_id, array['institution_admin', 'coordinator']::public.membership_role[]
      )
  )
);
create policy criteria_select on public.criteria for select
using (
  exists (
    select 1 from public.boards b
    where b.id = board_id and public.has_institution_access(auth.uid(), b.institution_id)
  )
);
create policy rubrics_select on public.rubrics for select
using (
  exists (
    select 1
    from public.criteria c
    join public.boards b on b.id = c.board_id
    where c.id = criterion_id and public.has_institution_access(auth.uid(), b.institution_id)
  )
);

create policy evaluations_select on public.evaluations for select
using (
  evaluator_id = auth.uid()
  or public.has_institution_role(
    auth.uid(), institution_id, array['institution_admin', 'coordinator']::public.membership_role[]
  )
  or (
    exists (
      select 1 from public.boards b
      where b.id = board_id and b.results_status = 'published'
    )
    and public.has_institution_access(auth.uid(), institution_id)
  )
);
create policy evaluation_scores_select on public.evaluation_scores for select
using (
  exists (
    select 1 from public.evaluations e
    where e.id = evaluation_id
      and (
        e.evaluator_id = auth.uid()
        or public.has_institution_role(
          auth.uid(), e.institution_id, array['institution_admin', 'coordinator']::public.membership_role[]
        )
        or (
          exists (
            select 1 from public.boards b
            where b.id = e.board_id and b.results_status = 'published'
          )
          and public.has_institution_access(auth.uid(), e.institution_id)
        )
      )
  )
);

create policy presentation_select on public.presentation_settings for select
using (public.has_institution_access(auth.uid(), institution_id));
create policy presentation_manage on public.presentation_settings for all
using (
  public.has_institution_role(
    auth.uid(), institution_id, array['institution_admin', 'coordinator']::public.membership_role[]
  )
)
with check (
  public.has_institution_role(
    auth.uid(), institution_id, array['institution_admin', 'coordinator']::public.membership_role[]
  )
);
create policy audit_select on public.audit_logs for select
using (
  public.has_institution_role(
    auth.uid(), institution_id, array['institution_admin']::public.membership_role[]
  )
  or public.is_system_admin(auth.uid())
);

revoke all on function public.is_system_admin(uuid) from public;
revoke all on function public.has_institution_access(uuid, uuid) from public;
revoke all on function public.has_institution_role(uuid, uuid, public.membership_role[]) from public;
grant execute on function public.is_system_admin(uuid) to authenticated, service_role;
grant execute on function public.has_institution_access(uuid, uuid) to authenticated, service_role;
grant execute on function public.has_institution_role(uuid, uuid, public.membership_role[]) to authenticated, service_role;

revoke all on function public.replace_project_team(uuid, uuid, jsonb, uuid[], uuid) from public;
revoke all on function public.replace_board_participants(uuid, uuid, uuid[], uuid[], uuid) from public;
revoke all on function public.replace_board_criteria(uuid, uuid, jsonb, uuid) from public;
revoke all on function public.submit_evaluation(uuid, uuid, uuid, uuid, jsonb, text) from public;
revoke all on function public.revise_evaluation(uuid, uuid, uuid, jsonb, text) from public;
revoke all on function public.institution_dashboard(uuid, integer, integer) from public;
grant execute on function public.replace_project_team(uuid, uuid, jsonb, uuid[], uuid) to service_role;
grant execute on function public.replace_board_participants(uuid, uuid, uuid[], uuid[], uuid) to service_role;
grant execute on function public.replace_board_criteria(uuid, uuid, jsonb, uuid) to service_role;
grant execute on function public.submit_evaluation(uuid, uuid, uuid, uuid, jsonb, text) to service_role;
grant execute on function public.revise_evaluation(uuid, uuid, uuid, jsonb, text) to service_role;
grant execute on function public.institution_dashboard(uuid, integer, integer) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'winner-music',
  'winner-music',
  false,
  20971520,
  array['audio/mpeg', 'audio/ogg', 'audio/wav']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
