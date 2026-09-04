-- 같은 날짜의 먹은 기록 시간을 원자적으로 일괄 수정합니다.

create or replace function public.update_consumption_records_time(
  p_record_ids uuid[],
  p_time time without time zone
)
returns setof public.consumption_records
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.update_consumption_records_time(uuid[], time without time zone)
  from public, anon;
grant execute on function public.update_consumption_records_time(uuid[], time without time zone)
  to authenticated;
