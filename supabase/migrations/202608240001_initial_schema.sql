-- 몽글큐브: 최대 5개 기기가 함께 사용하는 단일 가구용 최소 스키마
-- Supabase SQL Editor에서 이 파일 전체를 한 번 실행합니다.

create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;

revoke all on schema private from public;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  display_name text not null default '우리집 냉동실' check (char_length(display_name) between 1 and 40),
  member_limit smallint not null default 5 check (member_limit between 1 and 5),
  baby_birth_date date,
  weaning_started_on date,
  constraint households_weaning_after_birth_check check (
    baby_birth_date is null
    or weaning_started_on is null
    or weaning_started_on >= baby_birth_date
  ),
  created_at timestamptz not null default now()
);

create table public.household_invites (
  household_id uuid primary key references public.households(id) on delete cascade,
  token_hash bytea not null unique,
  active boolean not null default true,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)
);

create table public.cube_batches (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  category text not null default 'topping'
    check (category in ('base', 'topping', 'snack', 'other')),
  prepared_at timestamptz not null,
  expires_at timestamptz not null,
  quantity smallint not null check (quantity between 0 and 999),
  unit_amount numeric(7, 2) check (unit_amount is null or unit_amount > 0),
  unit text check (
    (unit_amount is null and unit is null)
    or (unit_amount is not null and unit in ('g', 'mL'))
  ),
  memo text check (memo is null or char_length(memo) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  batch_id uuid not null,
  cube_name text not null check (char_length(cube_name) between 1 and 40),
  unit_amount numeric(7, 2) check (unit_amount is null or unit_amount > 0),
  unit text check (
    (unit_amount is null and unit is null)
    or (unit_amount is not null and unit in ('g', 'mL'))
  ),
  planned_for date not null,
  meal_slot text not null check (meal_slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  consumption_record_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.consumption_records (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  batch_id uuid not null,
  cube_name text not null check (char_length(cube_name) between 1 and 40),
  unit_amount numeric(7, 2) check (unit_amount is null or unit_amount > 0),
  unit text check (
    (unit_amount is null and unit is null)
    or (unit_amount is not null and unit in ('g', 'mL'))
  ),
  consumed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  plan_item_id uuid,
  reaction text check (reaction is null or reaction in ('liked', 'okay', 'disliked', 'watch')),
  reaction_note text check (reaction_note is null or char_length(reaction_note) <= 100)
);

alter table public.cube_batches
  add constraint cube_batches_id_household_key unique (id, household_id);

alter table public.meal_plan_items
  add constraint meal_plan_items_id_household_key unique (id, household_id),
  add constraint meal_plan_items_batch_household_fk
    foreign key (batch_id, household_id)
    references public.cube_batches(id, household_id);

alter table public.consumption_records
  add constraint consumption_records_id_household_key unique (id, household_id),
  add constraint consumption_records_batch_household_fk
    foreign key (batch_id, household_id)
    references public.cube_batches(id, household_id),
  add constraint consumption_records_plan_item_household_fk
    foreign key (plan_item_id, household_id)
    references public.meal_plan_items(id, household_id);

alter table public.meal_plan_items
  add constraint meal_plan_items_consumption_record_fk
  foreign key (consumption_record_id, household_id)
  references public.consumption_records(id, household_id);

create index cube_batches_active_expiry_idx
  on public.cube_batches (household_id, expires_at)
  where deleted_at is null;

create index consumption_records_active_recent_idx
  on public.consumption_records (household_id, consumed_at desc)
  where cancelled_at is null;

create unique index consumption_records_active_plan_item_idx
  on public.consumption_records (plan_item_id)
  where plan_item_id is not null and cancelled_at is null;

create index meal_plan_items_active_date_idx
  on public.meal_plan_items (household_id, planned_for, meal_slot, created_at)
  where deleted_at is null;

create or replace function private.set_cube_batch_values()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.expires_at := new.prepared_at + interval '14 days';
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_cube_batch_values
before insert or update on public.cube_batches
for each row execute function private.set_cube_batch_values();

create or replace function private.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members as member
    where member.household_id = p_household_id
      and member.user_id = (select auth.uid())
  );
$$;

alter table public.households enable row level security;
alter table public.household_invites enable row level security;
alter table public.household_members enable row level security;
alter table public.cube_batches enable row level security;
alter table public.meal_plan_items enable row level security;
alter table public.consumption_records enable row level security;

create policy "members can read their own membership"
on public.household_members
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "members can read their household profile"
on public.households
for select
to authenticated
using (private.is_household_member(id));

create policy "members can update their household profile"
on public.households
for update
to authenticated
using (private.is_household_member(id))
with check (private.is_household_member(id));

create policy "members can read active and deleted cube events"
on public.cube_batches
for select
to authenticated
using (private.is_household_member(household_id));

create policy "members can create cubes"
on public.cube_batches
for insert
to authenticated
with check (private.is_household_member(household_id));

create policy "members can update cubes"
on public.cube_batches
for update
to authenticated
using (private.is_household_member(household_id))
with check (private.is_household_member(household_id));

create policy "members can read their consumption records"
on public.consumption_records
for select
to authenticated
using (private.is_household_member(household_id));

create policy "members can read their meal plan"
on public.meal_plan_items
for select
to authenticated
using (private.is_household_member(household_id));

create or replace function public.claim_household_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_existing_household_id uuid;
  v_member_count integer;
  v_member_limit smallint;
  v_invite_active boolean;
  v_invite_expires_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception '로그인 세션이 필요합니다.' using errcode = '42501';
  end if;

  if p_token is null or p_token !~ '^[0-9a-fA-F]{64}$' then
    raise exception '초대 링크가 올바르지 않습니다.' using errcode = '22023';
  end if;

  select
    invite.household_id,
    household.member_limit,
    invite.active,
    invite.expires_at
  into
    v_household_id,
    v_member_limit,
    v_invite_active,
    v_invite_expires_at
  from public.household_invites as invite
  join public.households as household on household.id = invite.household_id
  where invite.token_hash = extensions.digest(lower(p_token), 'sha256')
  for update of invite;

  if v_household_id is null then
    raise exception '초대 링크가 올바르지 않습니다.' using errcode = '22023';
  end if;

  select member.household_id
  into v_existing_household_id
  from public.household_members as member
  where member.user_id = (select auth.uid());

  if v_existing_household_id is not null then
    if v_existing_household_id <> v_household_id then
      raise exception '이미 다른 가구에 연결된 브라우저입니다.' using errcode = '23505';
    end if;
    return v_household_id;
  end if;

  if v_invite_expires_at <= now() then
    raise exception '초대 링크가 만료되었습니다.' using errcode = '22023';
  end if;

  select count(*)
  into v_member_count
  from public.household_members as member
  where member.household_id = v_household_id;

  if not v_invite_active then
    if v_member_count >= v_member_limit then
      raise exception '연결 가능한 기기 수가 모두 찼습니다.' using errcode = '23514';
    end if;
    raise exception '기기 연결이 마감된 초대 링크입니다.' using errcode = '22023';
  end if;

  if v_member_count >= v_member_limit then
    raise exception '연결 가능한 기기 수가 모두 찼습니다.' using errcode = '23514';
  end if;

  insert into public.household_members (household_id, user_id)
  values (v_household_id, (select auth.uid()));

  if v_member_count + 1 >= v_member_limit then
    update public.household_invites
    set active = false
    where household_id = v_household_id;
  end if;

  return v_household_id;
end;
$$;

create or replace function public.increment_cube_quantity(p_batch_id uuid)
returns public.cube_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.cube_batches%rowtype;
begin
  update public.cube_batches as batch
  set quantity = batch.quantity + 1
  where batch.id = p_batch_id
    and batch.deleted_at is null
    and batch.quantity < 999
    and private.is_household_member(batch.household_id)
  returning * into v_batch;

  if not found then
    raise sqlstate 'PT409' using message = '수량을 더할 큐브가 없거나 가득 찼습니다.';
  end if;

  return v_batch;
end;
$$;

create or replace function public.consume_cube(
  p_batch_id uuid,
  p_record_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.cube_batches%rowtype;
  v_record public.consumption_records%rowtype;
begin
  if p_record_id is null then
    raise exception '요청 식별자가 필요합니다.' using errcode = '22023';
  end if;

  -- 같은 요청을 다시 보내도 재고가 두 번 줄지 않게 요청 ID 단위로 잠급니다.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_record_id::text, 0)
  );

  select record.*
  into v_record
  from public.consumption_records as record
  where record.id = p_record_id
    and private.is_household_member(record.household_id);

  if found then
    if v_record.batch_id <> p_batch_id then
      raise sqlstate 'PT409' using message = '이미 다른 큐브에 사용한 요청입니다.';
    end if;

    select batch.*
    into v_batch
    from public.cube_batches as batch
    where batch.id = v_record.batch_id
      and private.is_household_member(batch.household_id);

    if not found then
      raise sqlstate 'PT404' using message = '먹은 기록의 큐브를 찾지 못했습니다.';
    end if;

    return pg_catalog.jsonb_build_object(
      'batch', pg_catalog.to_jsonb(v_batch),
      'record', pg_catalog.to_jsonb(v_record)
    );
  end if;

  update public.cube_batches as batch
  set quantity = batch.quantity - 1
  where batch.id = p_batch_id
    and batch.deleted_at is null
    and batch.quantity > 0
    and private.is_household_member(batch.household_id)
  returning * into v_batch;

  if not found then
    raise sqlstate 'PT409' using message = '남은 큐브가 없습니다.';
  end if;

  insert into public.consumption_records (
    id,
    household_id,
    batch_id,
    cube_name,
    unit_amount,
    unit
  )
  values (
    p_record_id,
    v_batch.household_id,
    v_batch.id,
    v_batch.name,
    v_batch.unit_amount,
    v_batch.unit
  )
  returning * into v_record;

  return pg_catalog.jsonb_build_object(
    'batch', pg_catalog.to_jsonb(v_batch),
    'record', pg_catalog.to_jsonb(v_record)
  );
end;
$$;

create or replace function public.create_meal_plan_items(
  p_batch_id uuid,
  p_planned_for date,
  p_meal_slot text,
  p_quantity integer
)
returns setof public.meal_plan_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.cube_batches%rowtype;
begin
  if p_planned_for is null then
    raise exception '식단 날짜가 필요합니다.' using errcode = '22023';
  end if;

  if p_meal_slot is null
     or p_meal_slot not in ('breakfast', 'lunch', 'dinner', 'snack') then
    raise exception '식사 시간이 올바르지 않습니다.' using errcode = '22023';
  end if;

  if p_quantity is null or p_quantity not between 1 and 12 then
    raise exception '식단에는 한 번에 1~12개를 담을 수 있습니다.' using errcode = '22023';
  end if;

  select batch.*
  into v_batch
  from public.cube_batches as batch
  where batch.id = p_batch_id
    and batch.deleted_at is null
    and private.is_household_member(batch.household_id)
  for share;

  if not found then
    raise sqlstate 'PT404' using message = '식단에 담을 큐브를 찾지 못했습니다.';
  end if;

  return query
  insert into public.meal_plan_items as plan_item (
    household_id,
    batch_id,
    cube_name,
    unit_amount,
    unit,
    planned_for,
    meal_slot
  )
  select
    v_batch.household_id,
    v_batch.id,
    v_batch.name,
    v_batch.unit_amount,
    v_batch.unit,
    p_planned_for,
    p_meal_slot
  from pg_catalog.generate_series(1, p_quantity)
  returning plan_item.*;
end;
$$;

create or replace function public.complete_meal_plan_item(
  p_plan_item_id uuid,
  p_record_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.cube_batches%rowtype;
  v_record public.consumption_records%rowtype;
  v_plan_item public.meal_plan_items%rowtype;
begin
  if p_record_id is null then
    raise exception '요청 식별자가 필요합니다.' using errcode = '22023';
  end if;

  -- 일반 먹음 기록과 계획 먹음 기록이 같은 요청 ID를 동시에 쓰지 못하게 합니다.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_record_id::text, 0)
  );

  select plan_item.*
  into v_plan_item
  from public.meal_plan_items as plan_item
  where plan_item.id = p_plan_item_id
    and plan_item.deleted_at is null
    and private.is_household_member(plan_item.household_id)
  for update;

  if not found then
    raise sqlstate 'PT404' using message = '먹을 식단 항목을 찾지 못했습니다.';
  end if;

  -- 여러 기기가 같은 항목을 누르거나 응답을 받지 못해 재시도해도 한 번만 차감합니다.
  if v_plan_item.consumption_record_id is not null then
    select record.*
    into v_record
    from public.consumption_records as record
    where record.id = v_plan_item.consumption_record_id
      and record.plan_item_id = v_plan_item.id
      and record.household_id = v_plan_item.household_id
      and record.cancelled_at is null;

    if not found then
      raise sqlstate 'PT409' using message = '식단 항목과 먹은 기록의 연결을 확인할 수 없습니다.';
    end if;

    select batch.*
    into v_batch
    from public.cube_batches as batch
    where batch.id = v_record.batch_id
      and batch.household_id = v_record.household_id
      and private.is_household_member(batch.household_id);

    if not found then
      raise sqlstate 'PT404' using message = '식단의 큐브를 찾지 못했습니다.';
    end if;

    return pg_catalog.jsonb_build_object(
      'batch', pg_catalog.to_jsonb(v_batch),
      'record', pg_catalog.to_jsonb(v_record),
      'plan_item', pg_catalog.to_jsonb(v_plan_item)
    );
  end if;

  -- UUID는 모든 먹은 기록에서 전역 멱등 키이므로 다른 작업에서 재사용할 수 없습니다.
  if exists (
    select 1
    from public.consumption_records as record
    where record.id = p_record_id
  ) then
    raise sqlstate 'PT409' using message = '이미 다른 먹은 기록에 사용한 요청입니다.';
  end if;

  update public.cube_batches as batch
  set quantity = batch.quantity - 1
  where batch.id = v_plan_item.batch_id
    and batch.household_id = v_plan_item.household_id
    and batch.deleted_at is null
    and batch.quantity > 0
    and private.is_household_member(batch.household_id)
  returning * into v_batch;

  if not found then
    raise sqlstate 'PT409' using message = '식단의 큐브가 삭제됐거나 남아 있지 않습니다.';
  end if;

  insert into public.consumption_records (
    id,
    household_id,
    batch_id,
    cube_name,
    unit_amount,
    unit,
    plan_item_id
  )
  values (
    p_record_id,
    v_plan_item.household_id,
    v_plan_item.batch_id,
    v_plan_item.cube_name,
    v_plan_item.unit_amount,
    v_plan_item.unit,
    v_plan_item.id
  )
  returning * into v_record;

  update public.meal_plan_items as plan_item
  set consumption_record_id = v_record.id,
      updated_at = now()
  where plan_item.id = v_plan_item.id
  returning * into v_plan_item;

  return pg_catalog.jsonb_build_object(
    'batch', pg_catalog.to_jsonb(v_batch),
    'record', pg_catalog.to_jsonb(v_record),
    'plan_item', pg_catalog.to_jsonb(v_plan_item)
  );
end;
$$;

create or replace function public.delete_meal_plan_item(p_plan_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_item_id uuid;
begin
  update public.meal_plan_items as plan_item
  set deleted_at = now(),
      updated_at = now()
  where plan_item.id = p_plan_item_id
    and plan_item.deleted_at is null
    and plan_item.consumption_record_id is null
    and private.is_household_member(plan_item.household_id)
  returning plan_item.id into v_plan_item_id;

  if not found then
    if exists (
      select 1
      from public.meal_plan_items as existing
      where existing.id = p_plan_item_id
        and existing.deleted_at is null
        and existing.consumption_record_id is not null
        and private.is_household_member(existing.household_id)
    ) then
      raise sqlstate 'PT409' using message = '먹은 기록을 먼저 되돌린 뒤 식단에서 뺄 수 있습니다.';
    end if;

    raise sqlstate 'PT404' using message = '삭제할 식단 항목을 찾지 못했습니다.';
  end if;

  return v_plan_item_id;
end;
$$;

create or replace function public.update_consumption_reaction(
  p_record_id uuid,
  p_reaction text,
  p_note text
)
returns public.consumption_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.consumption_records%rowtype;
  v_note text;
begin
  if p_reaction is not null
     and p_reaction not in ('liked', 'okay', 'disliked', 'watch') then
    raise exception '아기 반응 값이 올바르지 않습니다.' using errcode = '22023';
  end if;

  v_note := nullif(pg_catalog.btrim(p_note), '');
  if v_note is not null and char_length(v_note) > 100 then
    raise exception '반응 메모는 100자 이하여야 합니다.' using errcode = '22023';
  end if;

  update public.consumption_records as record
  set reaction = p_reaction,
      reaction_note = v_note
  where record.id = p_record_id
    and record.cancelled_at is null
    and private.is_household_member(record.household_id)
  returning * into v_record;

  if not found then
    raise sqlstate 'PT404' using message = '반응을 남길 먹은 기록을 찾지 못했습니다.';
  end if;

  return v_record;
end;
$$;

create or replace function public.undo_consumption(p_record_id uuid)
returns public.cube_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.cube_batches%rowtype;
  v_record public.consumption_records%rowtype;
  v_latest_record_id uuid;
begin
  select record.*
  into v_record
  from public.consumption_records as record
  where record.id = p_record_id
    and private.is_household_member(record.household_id)
  for update;

  if not found then
    raise sqlstate 'PT404' using message = '되돌릴 먹은 기록을 찾지 못했습니다.';
  end if;

  select batch.*
  into v_batch
  from public.cube_batches as batch
  where batch.id = v_record.batch_id
    and private.is_household_member(batch.household_id)
  for update;

  if not found then
    raise sqlstate 'PT404' using message = '먹은 기록의 큐브를 찾지 못했습니다.';
  end if;

  -- 이미 처리한 되돌리기 재시도는 수량을 다시 올리지 않고 성공으로 돌려줍니다.
  if v_record.cancelled_at is not null then
    return v_batch;
  end if;

  select record.id
  into v_latest_record_id
  from public.consumption_records as record
  where record.household_id = v_record.household_id
    and record.cancelled_at is null
  order by record.consumed_at desc, record.created_at desc, record.id desc
  limit 1;

  if v_latest_record_id <> p_record_id then
    raise sqlstate 'PT409' using message = '가장 최근에 먹은 기록부터 되돌릴 수 있습니다.';
  end if;

  if v_batch.deleted_at is not null or v_batch.quantity >= 999 then
    raise sqlstate 'PT409' using message = '삭제됐거나 수량이 가득 찬 큐브는 되돌릴 수 없습니다.';
  end if;

  update public.cube_batches as batch
  set quantity = batch.quantity + 1
  where batch.id = v_batch.id
  returning * into v_batch;

  update public.consumption_records as record
  set cancelled_at = now()
  where record.id = p_record_id;

  update public.meal_plan_items as plan_item
  set consumption_record_id = null,
      updated_at = now()
  where plan_item.consumption_record_id = p_record_id
    and plan_item.household_id = v_record.household_id;

  return v_batch;
end;
$$;

create or replace function public.update_cube_batch(
  p_batch_id uuid,
  p_expected_updated_at timestamptz,
  p_name text,
  p_category text,
  p_prepared_at timestamptz,
  p_quantity integer,
  p_unit_amount numeric,
  p_unit text,
  p_memo text
)
returns public.cube_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.cube_batches%rowtype;
begin
  update public.cube_batches as batch
  set name = p_name,
      category = p_category,
      prepared_at = p_prepared_at,
      quantity = p_quantity,
      unit_amount = p_unit_amount,
      unit = p_unit,
      memo = p_memo
  where batch.id = p_batch_id
    and batch.deleted_at is null
    and batch.updated_at = p_expected_updated_at
    and private.is_household_member(batch.household_id)
  returning * into v_batch;

  if not found then
    if exists (
      select 1
      from public.cube_batches as existing
      where existing.id = p_batch_id
        and existing.deleted_at is null
        and private.is_household_member(existing.household_id)
    ) then
      raise sqlstate 'PT409' using message = '다른 화면에서 먼저 수정했습니다.';
    end if;
    raise sqlstate 'PT404' using message = '수정할 큐브를 찾지 못했습니다.';
  end if;

  return v_batch;
end;
$$;

create or replace function public.delete_cube_batch(
  p_batch_id uuid,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch_id uuid;
begin
  update public.cube_batches as batch
  set deleted_at = now()
  where batch.id = p_batch_id
    and batch.deleted_at is null
    and batch.updated_at = p_expected_updated_at
    and private.is_household_member(batch.household_id)
  returning batch.id into v_batch_id;

  if not found then
    if exists (
      select 1
      from public.cube_batches as existing
      where existing.id = p_batch_id
        and existing.deleted_at is null
        and private.is_household_member(existing.household_id)
    ) then
      raise sqlstate 'PT409' using message = '다른 화면에서 먼저 수정했습니다.';
    end if;
    raise sqlstate 'PT404' using message = '삭제할 큐브를 찾지 못했습니다.';
  end if;

  return v_batch_id;
end;
$$;

-- SQL Editor 전용: 프로젝트 최초 1회 실행해 최대 5개 기기용 초대 링크를 만듭니다.
create or replace function private.bootstrap_household(
  p_display_name text default '우리집 냉동실',
  p_member_limit integer default 5
)
returns table (household_id uuid, invite_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_token text;
begin
  if exists (select 1 from public.households) then
    raise exception '가구가 이미 만들어져 있습니다.' using errcode = '23505';
  end if;

  if p_display_name is null or char_length(trim(p_display_name)) not between 1 and 40 then
    raise exception '가구 이름은 1~40자여야 합니다.' using errcode = '22023';
  end if;

  if p_member_limit is null or p_member_limit not between 1 and 5 then
    raise exception '연결 기기 수는 1~5대여야 합니다.' using errcode = '22023';
  end if;

  insert into public.households (display_name, member_limit)
  values (trim(p_display_name), p_member_limit)
  returning id into v_household_id;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.household_invites (household_id, token_hash, expires_at)
  values (
    v_household_id,
    extensions.digest(v_token, 'sha256'),
    now() + interval '24 hours'
  );

  return query select v_household_id, v_token;
end;
$$;

-- SQL Editor 전용: 휴대폰 교체 등으로 빈 연결 자리를 다시 만들 때 사용합니다.
create or replace function private.rotate_household_invite(
  p_household_id uuid,
  p_remove_user_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_member_count integer;
  v_member_limit smallint;
begin
  select household.member_limit
  into v_member_limit
  from public.households as household
  join public.household_invites as invite
    on invite.household_id = household.id
  where household.id = p_household_id
  for update of invite;

  if not found then
    raise exception '가구를 찾지 못했습니다.' using errcode = 'P0002';
  end if;

  if p_remove_user_id is not null then
    delete from public.household_members
    where household_id = p_household_id
      and user_id = p_remove_user_id;

    if not found then
      raise exception '제거할 연결을 찾지 못했습니다.' using errcode = 'P0002';
    end if;
  end if;

  select count(*) into v_member_count
  from public.household_members
  where household_id = p_household_id;

  if v_member_count >= v_member_limit then
    raise exception '먼저 교체할 user_id를 지정해야 합니다.' using errcode = '23514';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  update public.household_invites
  set token_hash = extensions.digest(v_token, 'sha256'),
      active = true,
      expires_at = now() + interval '24 hours',
      created_at = now()
  where household_id = p_household_id;

  if not found then
    raise exception '가구 초대 정보를 찾지 못했습니다.' using errcode = 'P0002';
  end if;

  return v_token;
end;
$$;

-- SQL Editor 전용: 필요한 기기를 모두 연결한 뒤 남은 초대 자리를 잠급니다.
create or replace function private.close_household_invite(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.household_invites
  set active = false
  where household_id = p_household_id;

  if not found then
    raise exception '가구 초대 정보를 찾지 못했습니다.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on table public.households from anon, authenticated;
revoke all on table public.household_invites from anon, authenticated;
revoke all on table public.household_members from anon, authenticated;
revoke all on table public.cube_batches from anon, authenticated;
revoke all on table public.meal_plan_items from anon, authenticated;
revoke all on table public.consumption_records from anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.is_household_member(uuid) to authenticated;
grant select on table public.households to authenticated;
grant update (baby_birth_date, weaning_started_on) on table public.households to authenticated;
grant select on table public.household_members to authenticated;
grant select, insert on table public.cube_batches to authenticated;
grant select on table public.meal_plan_items to authenticated;
grant select on table public.consumption_records to authenticated;

revoke all on function public.claim_household_invite(text) from public, anon;
revoke all on function public.increment_cube_quantity(uuid) from public, anon;
revoke all on function public.consume_cube(uuid, uuid) from public, anon;
revoke all on function public.create_meal_plan_items(uuid, date, text, integer) from public, anon;
revoke all on function public.complete_meal_plan_item(uuid, uuid) from public, anon;
revoke all on function public.delete_meal_plan_item(uuid) from public, anon;
revoke all on function public.update_consumption_reaction(uuid, text, text) from public, anon;
revoke all on function public.undo_consumption(uuid) from public, anon;
revoke all on function public.update_cube_batch(uuid, timestamptz, text, text, timestamptz, integer, numeric, text, text) from public, anon;
revoke all on function public.delete_cube_batch(uuid, timestamptz) from public, anon;
grant execute on function public.claim_household_invite(text) to authenticated;
grant execute on function public.increment_cube_quantity(uuid) to authenticated;
grant execute on function public.consume_cube(uuid, uuid) to authenticated;
grant execute on function public.create_meal_plan_items(uuid, date, text, integer) to authenticated;
grant execute on function public.complete_meal_plan_item(uuid, uuid) to authenticated;
grant execute on function public.delete_meal_plan_item(uuid) to authenticated;
grant execute on function public.update_consumption_reaction(uuid, text, text) to authenticated;
grant execute on function public.undo_consumption(uuid) to authenticated;
grant execute on function public.update_cube_batch(uuid, timestamptz, text, text, timestamptz, integer, numeric, text, text) to authenticated;
grant execute on function public.delete_cube_batch(uuid, timestamptz) to authenticated;

revoke all on function private.bootstrap_household(text, integer) from public, anon, authenticated;
revoke all on function private.rotate_household_invite(uuid, uuid) from public, anon, authenticated;
revoke all on function private.close_household_invite(uuid) from public, anon, authenticated;

alter table public.cube_batches replica identity full;
alter table public.meal_plan_items replica identity full;
alter table public.consumption_records replica identity full;
alter table public.households replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.households;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.cube_batches;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.consumption_records;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.meal_plan_items;
exception
  when duplicate_object then null;
end;
$$;
