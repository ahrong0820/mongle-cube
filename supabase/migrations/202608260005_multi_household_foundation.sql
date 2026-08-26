-- 몽글큐브 다중 가구 확장 Phase A
-- 기존 가구와 데이터를 보존하면서 여러 household, 아이 이름, 가족당 최대 10대 연결을 지원합니다.

alter table public.households
  drop constraint households_singleton_key;

alter table public.households
  drop constraint households_member_limit_check;

alter table public.households
  alter column member_limit set default 10;

update public.households
set member_limit = 10;

alter table public.households
  add constraint households_member_limit_check
  check (member_limit between 1 and 10);

alter table public.households
  add column baby_name text;

alter table public.households
  add constraint households_baby_name_check
  check (
    baby_name is null
    or (
      baby_name = btrim(baby_name)
      and char_length(baby_name) between 1 and 20
    )
  );

create or replace function private.create_household_invite(
  p_baby_name text,
  p_display_name text,
  p_member_limit smallint default 10
)
returns table (
  household_id uuid,
  baby_name text,
  display_name text,
  invite_token text,
  expires_at timestamptz,
  member_limit smallint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household public.households%rowtype;
  v_token text;
  v_expires_at timestamptz;
begin
  if p_baby_name is null
     or char_length(btrim(p_baby_name)) not between 1 and 20 then
    raise exception '아이 이름은 1~20자여야 합니다.' using errcode = '22023';
  end if;

  if p_display_name is null
     or char_length(btrim(p_display_name)) not between 1 and 40 then
    raise exception '가구 이름은 1~40자여야 합니다.' using errcode = '22023';
  end if;

  if p_member_limit is null or p_member_limit not between 1 and 10 then
    raise exception '연결 기기 수는 1~10대여야 합니다.' using errcode = '22023';
  end if;

  insert into public.households (
    singleton,
    baby_name,
    display_name,
    member_limit
  )
  values (
    true,
    btrim(p_baby_name),
    btrim(p_display_name),
    p_member_limit
  )
  returning * into v_household;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at := now() + interval '24 hours';

  insert into public.household_invites (
    household_id,
    token_hash,
    active,
    expires_at
  )
  values (
    v_household.id,
    extensions.digest(v_token, 'sha256'),
    true,
    v_expires_at
  );

  return query
  select
    v_household.id,
    v_household.baby_name,
    v_household.display_name,
    v_token,
    v_expires_at,
    v_household.member_limit;
end;
$$;

revoke all on function private.create_household_invite(text, text, smallint)
from public, anon, authenticated;

-- 기존 bootstrap은 초기 단일 가구 설치 호환용으로만 남깁니다.
-- 신규 가구는 반드시 baby_name을 받는 create_household_invite를 사용합니다.
comment on function private.bootstrap_household(text, integer)
is 'Deprecated: initial single-household bootstrap only. Use private.create_household_invite for new households.';

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
  join public.households as household
    on household.id = invite.household_id
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
      raise exception '이미 다른 가족 냉동실에 연결된 브라우저예요.' using errcode = '23505';
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
      raise exception '연결 가능한 기기 10대가 모두 찼습니다.' using errcode = '23514';
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
