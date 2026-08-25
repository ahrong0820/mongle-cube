-- 과거 먹은 기록을 안전하게 수정·삭제하고, 한 끼에 여러 큐브를 원자적으로 담습니다.

create or replace function public.create_meal_plan_selection(
  p_planned_for date,
  p_meal_slot text,
  p_selections jsonb
)
returns setof public.meal_plan_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.cube_batches%rowtype;
  v_household_id uuid;
  v_selection record;
  v_total_quantity integer;
begin
  if p_planned_for is null then
    raise exception '식단 날짜가 필요합니다.' using errcode = '22023';
  end if;

  if p_meal_slot is null
     or p_meal_slot not in ('breakfast', 'lunch', 'dinner', 'snack') then
    raise exception '식사 시간이 올바르지 않습니다.' using errcode = '22023';
  end if;

  if p_selections is null
     or pg_catalog.jsonb_typeof(p_selections) <> 'array'
     or pg_catalog.jsonb_array_length(p_selections) not between 1 and 12 then
    raise exception '식단에 담을 큐브를 1종류 이상 골라야 합니다.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_selections) as selection(value)
    where pg_catalog.jsonb_typeof(selection.value) <> 'object'
  ) then
    raise exception '선택한 큐브 정보를 확인해 주세요.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_selections)
      as selection(batch_id uuid, quantity integer)
    where selection.batch_id is null
       or selection.quantity is null
       or selection.quantity not between 1 and 12
  ) then
    raise exception '큐브 종류별 개수는 1~12개여야 합니다.' using errcode = '22023';
  end if;

  if exists (
    select selection.batch_id
    from pg_catalog.jsonb_to_recordset(p_selections)
      as selection(batch_id uuid, quantity integer)
    group by selection.batch_id
    having count(*) > 1
  ) then
    raise exception '같은 큐브는 한 번만 선택할 수 있습니다.' using errcode = '22023';
  end if;

  select coalesce(pg_catalog.sum(selection.quantity), 0)::integer
  into v_total_quantity
  from pg_catalog.jsonb_to_recordset(p_selections)
    as selection(batch_id uuid, quantity integer);

  if v_total_quantity not between 1 and 12 then
    raise exception '한 끼에는 모두 합쳐 1~12개를 담을 수 있습니다.' using errcode = '22023';
  end if;

  for v_selection in
    select selection.batch_id, selection.quantity
    from pg_catalog.jsonb_to_recordset(p_selections)
      as selection(batch_id uuid, quantity integer)
  loop
    select batch.*
    into v_batch
    from public.cube_batches as batch
    where batch.id = v_selection.batch_id
      and batch.deleted_at is null
      and private.is_household_member(batch.household_id)
    for share;

    if not found then
      raise sqlstate 'PT404' using message = '식단에 담을 큐브를 찾지 못했습니다.';
    end if;

    if v_household_id is null then
      v_household_id := v_batch.household_id;
    elsif v_household_id <> v_batch.household_id then
      raise sqlstate 'PT403' using message = '같은 우리집의 큐브만 한 식단에 담을 수 있습니다.';
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
    from pg_catalog.generate_series(1, v_selection.quantity)
    returning plan_item.*;
  end loop;
end;
$$;

create or replace function public.update_consumption_record(
  p_record_id uuid,
  p_consumed_at timestamptz,
  p_reaction text,
  p_note text
)
returns public.consumption_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text;
  v_record public.consumption_records%rowtype;
begin
  if p_consumed_at is null then
    raise exception '먹은 날짜와 시간이 필요합니다.' using errcode = '22023';
  end if;

  if p_consumed_at > pg_catalog.now() then
    raise exception '먹은 날짜와 시간은 현재보다 미래일 수 없습니다.' using errcode = '22023';
  end if;

  if p_reaction is not null
     and p_reaction not in ('liked', 'okay', 'disliked', 'watch') then
    raise exception '아기 반응 값이 올바르지 않습니다.' using errcode = '22023';
  end if;

  v_note := nullif(pg_catalog.btrim(p_note), '');
  if v_note is not null and pg_catalog.char_length(v_note) > 100 then
    raise exception '반응 메모는 100자 이하여야 합니다.' using errcode = '22023';
  end if;

  update public.consumption_records as record
  set consumed_at = p_consumed_at,
      reaction = p_reaction,
      reaction_note = v_note
  where record.id = p_record_id
    and record.cancelled_at is null
    and private.is_household_member(record.household_id)
  returning * into v_record;

  if not found then
    raise sqlstate 'PT404' using message = '수정할 먹은 기록을 찾지 못했습니다.';
  end if;

  return v_record;
end;
$$;

create or replace function public.delete_consumption_record(p_record_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.cube_batches%rowtype;
  v_record public.consumption_records%rowtype;
  v_stock_restored boolean := false;
begin
  select record.*
  into v_record
  from public.consumption_records as record
  where record.id = p_record_id
    and private.is_household_member(record.household_id)
  for update;

  if not found then
    raise sqlstate 'PT404' using message = '삭제할 먹은 기록을 찾지 못했습니다.';
  end if;

  select batch.*
  into v_batch
  from public.cube_batches as batch
  where batch.id = v_record.batch_id
    and batch.household_id = v_record.household_id
    and private.is_household_member(batch.household_id)
  for update;

  if v_record.cancelled_at is not null then
    return pg_catalog.jsonb_build_object(
      'batch', null,
      'stock_restored', false
    );
  end if;

  if found and v_batch.deleted_at is null then
    if v_batch.quantity >= 999 then
      raise sqlstate 'PT409' using message = '수량이 가득 찬 큐브의 기록은 삭제할 수 없습니다.';
    end if;

    update public.cube_batches as batch
    set quantity = batch.quantity + 1
    where batch.id = v_batch.id
    returning * into v_batch;
    v_stock_restored := true;
  end if;

  update public.consumption_records as record
  set cancelled_at = pg_catalog.now()
  where record.id = p_record_id;

  update public.meal_plan_items as plan_item
  set consumption_record_id = null,
      updated_at = pg_catalog.now()
  where plan_item.consumption_record_id = p_record_id
    and plan_item.household_id = v_record.household_id;

  return pg_catalog.jsonb_build_object(
    'batch', case when v_stock_restored then pg_catalog.to_jsonb(v_batch) else null end,
    'stock_restored', v_stock_restored
  );
end;
$$;

revoke all on function public.create_meal_plan_selection(date, text, jsonb) from public, anon;
revoke all on function public.update_consumption_record(uuid, timestamptz, text, text) from public, anon;
revoke all on function public.delete_consumption_record(uuid) from public, anon;

grant execute on function public.create_meal_plan_selection(date, text, jsonb) to authenticated;
grant execute on function public.update_consumption_record(uuid, timestamptz, text, text) to authenticated;
grant execute on function public.delete_consumption_record(uuid) to authenticated;
