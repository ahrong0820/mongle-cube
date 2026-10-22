-- Correct a dish accidentally marked for yesterday when its physical meal is today.
-- Does not adjust freezer stock, preparation items, or existing consumption records.
create or replace function public.correct_dish_serving_date(
  p_preparation_id uuid, p_new_serving_on date
)
returns public.meal_preparations
language plpgsql security definer set search_path = ''
as $function$
declare
  v_household_id uuid := private.current_household_id();
  v_prep public.meal_preparations%rowtype;
  v_today date := (pg_catalog.now() at time zone 'Asia/Seoul')::date;
begin
  select prep.* into v_prep
  from public.meal_preparations as prep
  where prep.id = p_preparation_id and prep.household_id = v_household_id
  for update;
  if not found then
    raise sqlstate 'PT404' using message='준비한 식기를 찾을 수 없어요.';
  end if;
  if v_prep.status <> 'prepared' then
    raise sqlstate 'PT409' using message='이미 완료하거나 취소한 식기의 날짜는 바꿀 수 없어요.';
  end if;
  if p_new_serving_on is null
    or p_new_serving_on <> v_today
    or v_prep.serving_on <> v_today - 1
    or (v_prep.prepared_at at time zone 'Asia/Seoul')::date <> v_today - 1 then
    raise exception '어제 준비하고 어제 식사로 지정한 식기만 오늘 날짜로 정정할 수 있어요.'
      using errcode='22023';
  end if;
  begin
    update public.meal_preparations as prep
    set serving_on = p_new_serving_on, updated_at = pg_catalog.now()
    where prep.id = v_prep.id
    returning * into v_prep;
  exception when unique_violation then
    raise sqlstate 'PT409' using message='오늘 같은 끼니에 이미 다른 식기가 있어요. 먼저 확인해 주세요.';
  end;
  return v_prep;
end;
$function$;

revoke all on function public.correct_dish_serving_date(uuid,date) from public, anon;
grant execute on function public.correct_dish_serving_date(uuid,date) to authenticated;
