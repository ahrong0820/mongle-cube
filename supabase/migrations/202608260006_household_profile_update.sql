-- 몽글큐브 다중 가구 확장 마무리
-- 현재 로그인된 가구의 아이 이름, 가구 표시명, 아기 날짜를 하나의 검증된 RPC로 수정합니다.

create or replace function public.update_household_profile(
  p_baby_name text,
  p_display_name text,
  p_birth_date date,
  p_weaning_started_on date
)
returns table (
  baby_name text,
  display_name text,
  baby_birth_date date,
  weaning_started_on date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
begin
  v_household_id := private.current_household_id();

  if p_baby_name is null
     or char_length(btrim(p_baby_name)) not between 1 and 20 then
    raise exception '아이 이름은 1~20자여야 합니다.' using errcode = '22023';
  end if;

  if p_display_name is null
     or char_length(btrim(p_display_name)) not between 1 and 40 then
    raise exception '가구 이름은 1~40자여야 합니다.' using errcode = '22023';
  end if;

  if p_birth_date is not null
     and p_birth_date > (now() at time zone 'Asia/Seoul')::date then
    raise exception '아기 생일은 오늘보다 미래일 수 없어요.' using errcode = '22023';
  end if;

  if p_birth_date is not null
     and p_weaning_started_on is not null
     and p_weaning_started_on < p_birth_date then
    raise exception '이유식 시작일은 아기 생일보다 빠를 수 없어요.' using errcode = '22023';
  end if;

  return query
  update public.households as household
  set baby_name = btrim(p_baby_name),
      display_name = btrim(p_display_name),
      baby_birth_date = p_birth_date,
      weaning_started_on = p_weaning_started_on
  where household.id = v_household_id
  returning
    household.baby_name,
    household.display_name,
    household.baby_birth_date,
    household.weaning_started_on;

  if not found then
    raise exception '가구 정보를 찾지 못했습니다.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_household_profile(text, text, date, date)
from public, anon;

grant execute on function public.update_household_profile(text, text, date, date)
to authenticated;

comment on function public.update_household_profile(text, text, date, date)
is 'Updates the current household baby/display names and baby timeline dates after membership-scoped validation.';
