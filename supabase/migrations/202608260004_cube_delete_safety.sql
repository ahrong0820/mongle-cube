-- 등록 삭제는 잘못 만든 데이터 정리에만 사용하도록 제한합니다.
-- 실제 먹은 기록, 활성 식단, 활성 폐기 기록이 있는 배치는 이력을 보존합니다.

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

  update public.cube_batches as batch
  set deleted_at = pg_catalog.now()
  where batch.id = v_batch.id
    and batch.household_id = v_household_id
  returning * into v_batch;

  return v_batch.id;
end;
$$;

revoke all on function public.delete_cube_batch(uuid, timestamptz) from public, anon;
grant execute on function public.delete_cube_batch(uuid, timestamptz) to authenticated;
