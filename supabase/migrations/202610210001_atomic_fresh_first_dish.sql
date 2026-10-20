-- Atomic first dish preparation with freshly manufactured cubes.
-- No changes to historic batches, consumption records, or existing RPC signatures.
create or replace function public.create_fresh_dish_preparation(
  p_serving_on date,
  p_meal_slot text,
  p_recipe_id uuid,
  p_name text,
  p_category text,
  p_prepared_at timestamptz,
  p_unit_amount numeric,
  p_unit text,
  p_memo text,
  p_ingredients text[],
  p_total_made integer,
  p_to_freeze integer
)
returns public.meal_preparations
language plpgsql security definer set search_path = ''
as $function$
declare
  v_household_id uuid := private.current_household_id();
  v_prep public.meal_preparations%rowtype;
begin
  if v_household_id is null then
    raise exception '가구 연결이 필요합니다.' using errcode='28000';
  end if;
  if p_serving_on is null
    or p_serving_on < (pg_catalog.now() at time zone 'Asia/Seoul')::date - 1
    or p_serving_on > (pg_catalog.now() at time zone 'Asia/Seoul')::date + 30 then
    raise exception '담을 날짜는 어제부터 30일 후까지 선택해 주세요.'
      using errcode='22023';
  end if;
  if p_meal_slot is null or p_meal_slot not in ('breakfast','lunch','dinner','snack') then
    raise exception '끼니를 확인해 주세요.' using errcode='22023';
  end if;

  begin
    insert into public.meal_preparations (household_id, serving_on, meal_slot)
    values (v_household_id, p_serving_on, p_meal_slot)
    returning * into v_prep;
  exception when unique_violation then
    raise sqlstate 'PT409' using message='해당 날짜와 끼니는 이미 식기에 담았어요.';
  end;

  -- This runs in the same transaction. If manufacture or snapshot creation
  -- fails, the newly inserted preparation is rolled back too.
  perform public.add_fresh_dish_item(
    v_prep.id, p_recipe_id, p_name, p_category, p_prepared_at,
    p_unit_amount, p_unit, p_memo, p_ingredients, p_total_made, p_to_freeze
  );
  return v_prep;
end;
$function$;

revoke all on function public.create_fresh_dish_preparation(
  date,text,uuid,text,text,timestamptz,numeric,text,text,text[],integer,integer
) from public, anon;
grant execute on function public.create_fresh_dish_preparation(
  date,text,uuid,text,text,timestamptz,numeric,text,text,text[],integer,integer
) to authenticated;
