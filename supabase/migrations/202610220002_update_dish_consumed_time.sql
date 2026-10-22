-- Change the consumed time of an entire prepared dish atomically.
-- Preserves the meal's date, per-cube snapshots and physical freezer stock.
create or replace function public.update_dish_consumed_time(
  p_preparation_id uuid,
  p_expected_consumed_at timestamptz,
  p_time time without time zone
)
returns public.meal_preparations
language plpgsql security definer set search_path = ''
as $function$
declare
  v_household_id uuid := private.current_household_id();
  v_prep public.meal_preparations%rowtype;
  v_next_consumed_at timestamptz;
begin
  if p_preparation_id is null or p_expected_consumed_at is null or p_time is null then
    raise exception '수정할 끼니와 기존 시간, 새 시간을 확인해 주세요.'
      using errcode = '22023';
  end if;

  select prep.* into v_prep
  from public.meal_preparations as prep
  where prep.id = p_preparation_id
    and prep.household_id = v_household_id
  for update;

  if not found then
    raise sqlstate 'PT404' using message = '먹은 끼니 기록을 찾을 수 없어요.';
  end if;
  if v_prep.status <> 'completed' or v_prep.consumed_at is null then
    raise sqlstate 'PT409' using message = '완료된 끼니의 시간만 수정할 수 있어요.';
  end if;
  if v_prep.consumed_at <> p_expected_consumed_at then
    raise sqlstate 'PT409' using message = '다른 기기에서 먹은 시간을 변경했어요. 다시 불러와 주세요.';
  end if;

  v_next_consumed_at := (
    (v_prep.consumed_at at time zone 'Asia/Seoul')::date + p_time
  ) at time zone 'Asia/Seoul';
  if v_next_consumed_at > pg_catalog.now() then
    raise exception '먹은 날짜와 시간은 현재보다 미래일 수 없어요.'
      using errcode = '22023';
  end if;

  -- The prepared meal is locked before its records, matching cancellation
  -- and completion lock order. Do not change inventory or consumption counts.
  update public.consumption_records as record
  set consumed_at = v_next_consumed_at
  where record.household_id = v_household_id
    and record.cancelled_at is null
    and record.preparation_item_id in (
      select item.id
      from public.meal_preparation_items as item
      where item.household_id = v_household_id
        and item.preparation_id = v_prep.id
    );

  update public.meal_preparations as prep
  set consumed_at = v_next_consumed_at,
      updated_at = pg_catalog.now()
  where prep.id = v_prep.id
    and prep.household_id = v_household_id
  returning * into v_prep;
  return v_prep;
end;
$function$;

revoke all on function public.update_dish_consumed_time(uuid,timestamptz,time)
  from public,anon;
grant execute on function public.update_dish_consumed_time(uuid,timestamptz,time)
  to authenticated;
