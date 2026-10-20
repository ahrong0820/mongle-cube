-- Preserve meal-origin records and physical stock movements across all legacy edit paths.

CREATE OR REPLACE FUNCTION public.delete_cube_batch(p_batch_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_household_id uuid;
  v_batch public.cube_batches%rowtype;
begin
  v_household_id := private.current_household_id();

  select batch.*
  into v_batch
  from public.cube_batches as batch
  where batch.id = p_batch_id
    and batch.household_id = v_household_id
    and batch.deleted_at is null
  for update;

  if not found then
    raise sqlstate 'PT404' using message = '삭제할 큐브 등록을 찾지 못했습니다.';
  end if;

  if p_expected_updated_at is null or v_batch.updated_at <> p_expected_updated_at then
    raise sqlstate 'PT409' using message = '다른 화면에서 먼저 수정했습니다.';
  end if;

  if private.has_active_cube_disposal(v_batch.id) then
    raise sqlstate 'PT409' using message = '폐기 기록이 있는 큐브는 등록 삭제할 수 없습니다. 먼저 폐기 기록을 취소해 주세요.';
  end if;

  if exists (
    select 1
    from public.consumption_records as record
    where record.batch_id = v_batch.id
      and record.household_id = v_household_id
      and record.cancelled_at is null
  ) then
    raise sqlstate 'PT409' using message = '먹은 기록이 있는 큐브는 등록 삭제할 수 없습니다. 남은 큐브를 버리려면 폐기를 사용해 주세요.';
  end if;

  if exists (
    select 1
    from public.meal_plan_items as plan_item
    where plan_item.batch_id = v_batch.id
      and plan_item.household_id = v_household_id
      and plan_item.deleted_at is null
  ) then
    raise sqlstate 'PT409' using message = '식단에 연결된 큐브는 등록 삭제할 수 없습니다. 식단에서 먼저 빼 주세요.';
  end if;

  if exists (
    select 1 from public.meal_preparation_items item
    where item.batch_id = v_batch.id
      and item.household_id = v_household_id
  ) then
    raise sqlstate 'PT409'
      using message = '식기에 담았던 큐브의 제조 이력은 삭제할 수 없어요.';
  end if;

  update public.cube_batches as batch
  set deleted_at = pg_catalog.now()
  where batch.id = v_batch.id
    and batch.household_id = v_household_id
  returning * into v_batch;

  return v_batch.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_consumption_reaction(p_record_id uuid, p_reaction text, p_note text)
 RETURNS consumption_records
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if exists (
    select 1 from public.consumption_records record
    where record.id = p_record_id
      and record.cancelled_at is null
      and record.preparation_item_id is not null
      and private.is_household_member(record.household_id)
  ) then
    raise sqlstate 'PT409'
      using message = '식기에 담아 먹은 기록은 식기에 담기에서 끼니 단위로 정정해 주세요.';
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
$function$;

CREATE OR REPLACE FUNCTION public.update_consumption_record(p_record_id uuid, p_consumed_at timestamp with time zone, p_reaction text, p_note text)
 RETURNS consumption_records
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if exists (
    select 1 from public.consumption_records record
    where record.id = p_record_id
      and record.cancelled_at is null
      and record.preparation_item_id is not null
      and private.is_household_member(record.household_id)
  ) then
    raise sqlstate 'PT409'
      using message = '식기에 담아 먹은 기록은 식기에 담기에서 끼니 단위로 정정해 주세요.';
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
$function$;

CREATE OR REPLACE FUNCTION public.update_consumption_records_time(p_record_ids uuid[], p_time time without time zone)
 RETURNS SETOF consumption_records
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_record public.consumption_records%rowtype;
  v_record_count integer := 0;
  v_distinct_count integer := 0;
  v_local_date date;
  v_next_consumed_at timestamptz;
begin
  if p_record_ids is null
     or pg_catalog.cardinality(p_record_ids) not between 1 and 50 then
    raise exception '수정할 먹은 기록을 1~50개 선택해 주세요.' using errcode = '22023';
  end if;

  if p_time is null then
    raise exception '일괄 적용할 시간이 필요합니다.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(p_record_ids) as selected(record_id)
    where selected.record_id is null
  ) then
    raise exception '수정할 먹은 기록을 확인해 주세요.' using errcode = '22023';
  end if;

  select pg_catalog.count(distinct selected.record_id)
  into v_distinct_count
  from pg_catalog.unnest(p_record_ids) as selected(record_id);

  if v_distinct_count <> pg_catalog.cardinality(p_record_ids) then
    raise exception '같은 먹은 기록을 중복 선택할 수 없습니다.' using errcode = '22023';
  end if;

  for v_record in
    select record.*
    from public.consumption_records as record
    where record.id = any(p_record_ids)
      and record.cancelled_at is null
      and private.is_household_member(record.household_id)
    order by record.id
    for update
  loop
    v_record_count := v_record_count + 1;

    if v_record.preparation_item_id is not null then
      raise sqlstate 'PT409'
        using message = '식기에 담아 먹은 기록은 식기에 담기에서 끼니 단위로 정정해 주세요.';
    end if;

    if v_local_date is null then
      v_local_date := (v_record.consumed_at at time zone 'Asia/Seoul')::date;
    elsif (v_record.consumed_at at time zone 'Asia/Seoul')::date <> v_local_date then
      raise exception '같은 날짜의 먹은 기록만 한 번에 수정할 수 있습니다.'
        using errcode = '22023';
    end if;

    v_next_consumed_at := (v_local_date + p_time) at time zone 'Asia/Seoul';
    if v_next_consumed_at > pg_catalog.now() then
      raise exception '먹은 날짜와 시간은 현재보다 미래일 수 없습니다.'
        using errcode = '22023';
    end if;
  end loop;

  if v_record_count <> pg_catalog.cardinality(p_record_ids) then
    raise sqlstate 'PT404' using message = '수정할 먹은 기록을 모두 찾지 못했습니다.';
  end if;

  return query
  update public.consumption_records as record
  set consumed_at = (
    ((record.consumed_at at time zone 'Asia/Seoul')::date + p_time)
      at time zone 'Asia/Seoul'
  )
  where record.id = any(p_record_ids)
    and record.cancelled_at is null
    and private.is_household_member(record.household_id)
  returning record.*;
end;
$function$;

