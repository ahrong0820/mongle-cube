-- 큐브 폐기와 폐기 기록 취소를 원자적으로 처리합니다.
-- 폐기는 먹은 기록과 분리된 재고 사건이며, 기존 소비 이력은 유지합니다.

create unique index cube_disposals_one_active_per_batch_idx
  on public.cube_disposals (batch_id)
  where cancelled_at is null;

create or replace function private.has_active_cube_disposal(p_batch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cube_disposals as disposal
    where disposal.batch_id = p_batch_id
      and disposal.cancelled_at is null
  );
$$;

create or replace function public.discard_cube_batch(
  p_batch_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_batch public.cube_batches%rowtype;
  v_disposal public.cube_disposals%rowtype;
  v_pending_plan_count integer := 0;
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
    raise sqlstate 'PT404' using message = '폐기할 큐브를 찾지 못했습니다.';
  end if;

  if p_expected_updated_at is null or v_batch.updated_at <> p_expected_updated_at then
    raise sqlstate 'PT409' using message = '다른 화면에서 먼저 수정했습니다.';
  end if;

  if private.has_active_cube_disposal(v_batch.id) then
    raise sqlstate 'PT409' using message = '이미 폐기 처리된 큐브입니다.';
  end if;

  if v_batch.quantity <= 0 then
    raise sqlstate 'PT409' using message = '남아 있는 큐브가 없어 폐기할 수 없습니다.';
  end if;

  select count(*)::integer
  into v_pending_plan_count
  from public.meal_plan_items as plan_item
  where plan_item.household_id = v_household_id
    and plan_item.batch_id = v_batch.id
    and plan_item.deleted_at is null
    and plan_item.consumption_record_id is null;

  insert into public.cube_disposals (
    household_id,
    batch_id,
    quantity
  )
  values (
    v_household_id,
    v_batch.id,
    v_batch.quantity
  )
  returning * into v_disposal;

  update public.cube_batches as batch
  set quantity = 0
  where batch.id = v_batch.id
    and batch.household_id = v_household_id
  returning * into v_batch;

  return pg_catalog.jsonb_build_object(
    'batch', pg_catalog.to_jsonb(v_batch),
    'disposal', pg_catalog.to_jsonb(v_disposal),
    'pending_plan_count', v_pending_plan_count
  );
end;
$$;

create or replace function public.cancel_cube_disposal(
  p_disposal_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_batch public.cube_batches%rowtype;
  v_disposal public.cube_disposals%rowtype;
begin
  v_household_id := private.current_household_id();

  select disposal.*
  into v_disposal
  from public.cube_disposals as disposal
  where disposal.id = p_disposal_id
    and disposal.household_id = v_household_id
    and disposal.cancelled_at is null
  for update;

  if not found then
    raise sqlstate 'PT404' using message = '취소할 폐기 기록을 찾지 못했습니다.';
  end if;

  select batch.*
  into v_batch
  from public.cube_batches as batch
  where batch.id = v_disposal.batch_id
    and batch.household_id = v_household_id
    and batch.deleted_at is null
  for update;

  if not found then
    raise sqlstate 'PT409' using message = '등록 삭제된 큐브의 폐기 기록은 취소할 수 없습니다.';
  end if;

  if p_expected_updated_at is null or v_batch.updated_at <> p_expected_updated_at then
    raise sqlstate 'PT409' using message = '다른 화면에서 먼저 수정했습니다.';
  end if;

  if v_batch.quantity <> 0 then
    raise sqlstate 'PT409' using message = '폐기 후 재고가 변경되어 자동 복원할 수 없습니다.';
  end if;

  if v_disposal.quantity > 999 then
    raise sqlstate 'PT409' using message = '복원할 수량을 확인해 주세요.';
  end if;

  update public.cube_batches as batch
  set quantity = v_disposal.quantity
  where batch.id = v_batch.id
  returning * into v_batch;

  update public.cube_disposals as disposal
  set cancelled_at = pg_catalog.now()
  where disposal.id = v_disposal.id
  returning * into v_disposal;

  return pg_catalog.jsonb_build_object(
    'batch', pg_catalog.to_jsonb(v_batch),
    'disposal', pg_catalog.to_jsonb(v_disposal)
  );
end;
$$;

-- 폐기된 배치는 구형 클라이언트가 +1로 되살릴 수 없게 막습니다.
create or replace function public.increment_cube_quantity(p_batch_id uuid)
returns public.cube_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.cube_batches%rowtype;
begin
  select batch.*
  into v_batch
  from public.cube_batches as batch
  where batch.id = p_batch_id
    and batch.deleted_at is null
    and private.is_household_member(batch.household_id)
  for update;

  if not found then
    raise sqlstate 'PT404' using message = '수량을 바꿀 큐브를 찾지 못했습니다.';
  end if;

  if private.has_active_cube_disposal(v_batch.id) then
    raise sqlstate 'PT409' using message = '폐기 기록을 취소한 뒤 수량을 바꿀 수 있습니다.';
  end if;

  if v_batch.quantity >= 999 then
    raise sqlstate 'PT409' using message = '수량은 999개까지 저장할 수 있습니다.';
  end if;

  update public.cube_batches as batch
  set quantity = batch.quantity + 1
  where batch.id = v_batch.id
  returning * into v_batch;

  return v_batch;
end;
$$;

-- 폐기된 배치의 과거 먹은 기록은 삭제할 수 있지만, 폐기된 재고를 되살리지는 않습니다.
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
  v_has_active_disposal boolean := false;
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
    v_has_active_disposal := private.has_active_cube_disposal(v_batch.id);

    if not v_has_active_disposal then
      if v_batch.quantity >= 999 then
        raise sqlstate 'PT409' using message = '수량이 가득 찬 큐브의 기록은 삭제할 수 없습니다.';
      end if;

      update public.cube_batches as batch
      set quantity = batch.quantity + 1
      where batch.id = v_batch.id
      returning * into v_batch;
      v_stock_restored := true;
    end if;
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

-- '되돌리기'는 재고 복원이 본질이므로 폐기된 배치에서는 명시적으로 차단합니다.
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

  if v_record.cancelled_at is not null then
    return v_batch;
  end if;

  if private.has_active_cube_disposal(v_batch.id) then
    raise sqlstate 'PT409' using message = '폐기된 큐브의 먹은 기록은 폐기 기록을 취소한 뒤 되돌릴 수 있습니다.';
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
  set cancelled_at = pg_catalog.now()
  where record.id = p_record_id;

  update public.meal_plan_items as plan_item
  set consumption_record_id = null,
      updated_at = pg_catalog.now()
  where plan_item.consumption_record_id = p_record_id
    and plan_item.household_id = v_record.household_id;

  return v_batch;
end;
$$;

revoke all on function private.has_active_cube_disposal(uuid) from public, anon, authenticated;
revoke all on function public.discard_cube_batch(uuid, timestamptz) from public, anon;
revoke all on function public.cancel_cube_disposal(uuid, timestamptz) from public, anon;

grant execute on function public.discard_cube_batch(uuid, timestamptz) to authenticated;
grant execute on function public.cancel_cube_disposal(uuid, timestamptz) to authenticated;