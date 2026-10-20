-- Keep pre-meal disposal distinct from items not eaten at meal completion.
alter table public.meal_preparation_items
  drop constraint if exists meal_preparation_items_disposition_check;
alter table public.meal_preparation_items
  add constraint meal_preparation_items_disposition_check
  check (disposition in ('ready','consumed','discarded','corrected','unused'));

-- Atomic preparation/stock movement and dish completion RPCs.
-- Legacy meal plan and direct consumption behavior remains unchanged.
alter table public.consumption_records
  add column preparation_item_id uuid;

alter table public.consumption_records
  add constraint consumption_records_preparation_item_household_fk
  foreign key (preparation_item_id, household_id)
  references public.meal_preparation_items (id, household_id);

create index consumption_records_preparation_item_idx
  on public.consumption_records (household_id, preparation_item_id)
  where preparation_item_id is not null;

create or replace function public.add_frozen_dish_items(
  p_preparation_id uuid,
  p_selections jsonb
)
returns setof public.meal_preparation_items
language plpgsql security definer set search_path = ''
as $$
declare
  v_household_id uuid := private.current_household_id();
  v_preparation public.meal_preparations%rowtype;
  v_batch public.cube_batches%rowtype;
  v_selection record;
  v_existing integer;
  v_new_count integer;
begin
  if p_selections is null
    or pg_catalog.jsonb_typeof(p_selections) <> 'array'
    or pg_catalog.jsonb_array_length(p_selections) not between 1 and 12 then
    raise exception '식기에 담을 큐브를 골라 주세요.' using errcode='22023';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_to_recordset(p_selections)
      as item(batch_id uuid, quantity integer)
    where item.batch_id is null
      or item.quantity is null
      or item.quantity not between 1 and 12
  ) or exists (
    select item.batch_id
    from pg_catalog.jsonb_to_recordset(p_selections)
      as item(batch_id uuid, quantity integer)
    group by item.batch_id
    having pg_catalog.count(*) > 1
  ) then
    raise exception '큐브와 개수를 확인해 주세요.' using errcode='22023';
  end if;

  select prep.* into v_preparation
  from public.meal_preparations as prep
  where prep.id = p_preparation_id and prep.household_id = v_household_id
  for update;
  if not found then
    raise sqlstate 'PT404' using message='식기에 담은 기록을 찾지 못했어요.';
  end if;
  if v_preparation.status <> 'prepared' then
    raise sqlstate 'PT409' using message='이미 완료했거나 취소한 끼니에는 추가할 수 없어요.';
  end if;

  select coalesce(pg_catalog.sum(item.prepared_quantity),0)::integer
    into v_existing
  from public.meal_preparation_items as item
  where item.preparation_id = p_preparation_id and item.disposition = 'ready';
  select pg_catalog.sum(item.quantity)::integer into v_new_count
  from pg_catalog.jsonb_to_recordset(p_selections)
    as item(batch_id uuid, quantity integer);
  if v_new_count < 1 or v_existing + v_new_count > 12 then
    raise exception '한 끼에 담는 큐브는 모두 합쳐 12개 이하여야 합니다.'
      using errcode='22023';
  end if;

  for v_selection in
    select item.batch_id, item.quantity
    from pg_catalog.jsonb_to_recordset(p_selections)
      as item(batch_id uuid, quantity integer)
    order by item.batch_id
  loop
    update public.cube_batches as batch
    set quantity = batch.quantity - v_selection.quantity
    where batch.id = v_selection.batch_id
      and batch.household_id = v_household_id
      and batch.deleted_at is null
      and batch.quantity >= v_selection.quantity
      and not private.has_active_cube_disposal(batch.id)
    returning * into v_batch;

    if not found then
      raise sqlstate 'PT409' using message='냉동실 재고가 부족하거나 사용할 수 없는 큐브입니다.';
    end if;

    return query insert into public.meal_preparation_items as prep_item(
      household_id, preparation_id, batch_id, source_kind, prepared_quantity,
      cube_name, category, unit_amount, unit
    ) values (
      v_household_id, p_preparation_id, v_batch.id, 'frozen',
      v_selection.quantity, v_batch.name, v_batch.category,
      v_batch.unit_amount, v_batch.unit
    ) returning prep_item.*;
  end loop;
end;
$$;

create or replace function public.create_dish_preparation(
  p_serving_on date,
  p_meal_slot text,
  p_selections jsonb
)
returns public.meal_preparations
language plpgsql security definer set search_path = ''
as $$
declare
  v_household_id uuid := private.current_household_id();
  v_prep public.meal_preparations%rowtype;
begin
  if p_serving_on is null or p_serving_on < (pg_catalog.now() at time zone 'Asia/Seoul')::date - 1
    or p_serving_on > (pg_catalog.now() at time zone 'Asia/Seoul')::date + 30 then
    raise exception '담을 날짜는 어제부터 30일 후까지 선택해 주세요.'
      using errcode='22023';
  end if;
  if p_meal_slot not in ('breakfast','lunch','dinner','snack') then
    raise exception '끼니를 확인해 주세요.' using errcode='22023';
  end if;

  begin
    insert into public.meal_preparations(household_id, serving_on, meal_slot)
    values (v_household_id,p_serving_on,p_meal_slot)
    returning * into v_prep;
  exception when unique_violation then
    raise sqlstate 'PT409' using message='해당 날짜와 끼니는 이미 식기에 담았어요.';
  end;

  perform 1
    from public.add_frozen_dish_items(v_prep.id,p_selections);
  return v_prep;
end;
$$;

create or replace function public.add_fresh_dish_item(
  p_preparation_id uuid,
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
returns public.meal_preparation_items
language plpgsql security definer set search_path = ''
as $$
declare
  v_household_id uuid := private.current_household_id();
  v_prep public.meal_preparations%rowtype;
  v_result jsonb;
  v_batch public.cube_batches%rowtype;
  v_item public.meal_preparation_items%rowtype;
  v_qty integer;
  v_existing integer;
begin
  if p_total_made is null or p_to_freeze is null
     or p_total_made not between 1 and 999
     or p_to_freeze < 0 or p_to_freeze >= p_total_made then
    raise exception '만든 개수와 냉동 보관 개수를 확인해 주세요.' using errcode='22023';
  end if;
  v_qty := p_total_made - p_to_freeze;
  if v_qty > 12 then
    raise exception '한 끼에 바로 담을 수 있는 큐브는 최대 12개입니다.'
      using errcode='22023';
  end if;
  select prep.* into v_prep
  from public.meal_preparations as prep
  where prep.id = p_preparation_id and prep.household_id = v_household_id
  for update;
  if not found then
    raise sqlstate 'PT404' using message='식기에 담은 기록을 찾지 못했어요.';
  end if;
  if v_prep.status <> 'prepared' then
    raise sqlstate 'PT409' using message='이미 완료한 끼니에는 추가할 수 없어요.';
  end if;

  select coalesce(pg_catalog.sum(item.prepared_quantity),0)::integer
    into v_existing
  from public.meal_preparation_items as item
  where item.preparation_id = p_preparation_id and item.disposition='ready';
  if v_existing + v_qty > 12 then
    raise exception '한 끼에 담는 큐브는 총 12개를 넘을 수 없어요.'
      using errcode='22023';
  end if;

  v_result := public.create_cube_batch_with_ingredients(
    p_recipe_id,p_name,p_category,p_prepared_at,p_to_freeze,
    p_unit_amount,p_unit,p_memo,p_ingredients
  );
  select batch.* into v_batch from public.cube_batches as batch
  where batch.id = (v_result->'batch'->>'id')::uuid
    and batch.household_id = v_household_id;

  insert into public.meal_preparation_items as item (
    household_id,preparation_id,batch_id,source_kind,prepared_quantity,
    cube_name,category,unit_amount,unit
  ) values (
    v_household_id,p_preparation_id,v_batch.id,'direct_fresh',v_qty,
    v_batch.name,v_batch.category,v_batch.unit_amount,v_batch.unit
  ) returning * into v_item;
  return v_item;
end;
$$;

create or replace function public.remove_dish_item(
  p_item_id uuid, p_resolution text
)
returns public.meal_preparation_items
language plpgsql security definer set search_path = ''
as $$
declare
  v_household_id uuid := private.current_household_id();
  v_prep public.meal_preparations%rowtype;
  v_item public.meal_preparation_items%rowtype;
begin
  if p_resolution not in ('corrected','discarded') then
    raise exception '잘못 선택한 기록 정정인지 실제 폐기인지 확인해 주세요.'
      using errcode='22023';
  end if;
  select prep.* into v_prep
  from public.meal_preparations as prep
  join public.meal_preparation_items as item on item.preparation_id = prep.id
  where item.id=p_item_id and item.household_id=v_household_id
  for update of prep;
  if not found then raise sqlstate 'PT404' using message='준비 기록을 찾을 수 없어요.'; end if;
  if v_prep.status<>'prepared' then
    raise sqlstate 'PT409' using message='완료한 끼니는 먼저 기록을 정정해야 합니다.';
  end if;

  select item.* into v_item from public.meal_preparation_items as item
  where item.id=p_item_id and item.household_id=v_household_id
  for update;
  if v_item.disposition<>'ready' then
    raise sqlstate 'PT409' using message='이미 정정하거나 폐기한 준비 품목입니다.';
  end if;

  if p_resolution='corrected' and v_item.source_kind='frozen' then
    update public.cube_batches as batch
    set quantity=batch.quantity+v_item.prepared_quantity
    where batch.id=v_item.batch_id and batch.household_id=v_household_id
      and batch.deleted_at is null
      and batch.quantity+v_item.prepared_quantity <= 999
      and not private.has_active_cube_disposal(batch.id);
    if not found then
      raise sqlstate 'PT409' using message='재고를 되돌릴 수 없어 정정하지 못했어요.';
    end if;
  end if;

  update public.meal_preparation_items as item
  set disposition=p_resolution,
    corrected_quantity=case when p_resolution='corrected' then item.prepared_quantity else 0 end,
    discarded_quantity=case when p_resolution='discarded' then item.prepared_quantity else 0 end,
    updated_at=pg_catalog.now()
  where item.id=v_item.id returning * into v_item;
  update public.meal_preparations
  set updated_at=pg_catalog.now() where id=v_prep.id;

  return v_item;
end;
$$;

create or replace function public.complete_dish_preparation(
  p_preparation_id uuid,
  p_request_id uuid,
  p_consumed_at timestamptz,
  p_outcome text,
  p_actual_amount numeric,
  p_actual_unit text,
  p_reaction text,
  p_note text
)
returns public.meal_preparations
language plpgsql security definer set search_path = ''
as $$
declare
  v_household_id uuid := private.current_household_id();
  v_prep public.meal_preparations%rowtype;
  v_item public.meal_preparation_items%rowtype;
  v_rows integer:=0;
  v_idx integer;
begin
  if p_request_id is null or p_consumed_at is null then
    raise exception '완료 요청 ID와 실제 먹은 시간이 필요합니다.' using errcode='22023';
  end if;
  if p_outcome not in ('all','partial','none') then
    raise exception '전부 먹음, 일부 먹음, 먹지 않음 중 선택해 주세요.'
      using errcode='22023';
  end if;
  if p_consumed_at > pg_catalog.now() or
     (p_consumed_at at time zone 'Asia/Seoul')::date <> (
       select prep.serving_on from public.meal_preparations prep
       where prep.id=p_preparation_id and prep.household_id=v_household_id
     ) then
    raise exception '실제 먹은 시간은 해당 끼니 날짜의 과거 시간이어야 합니다.'
      using errcode='22023';
  end if;
  if (p_actual_amount is null and p_actual_unit is not null)
    or (p_actual_amount is not null and
        (p_actual_amount < 0 or p_actual_unit not in ('g','mL'))) then
    raise exception '실제로 먹은 양과 단위를 확인해 주세요.' using errcode='22023';
  end if;
  if p_outcome='partial' and p_actual_amount is not null and p_actual_amount <= 0 then
    raise exception '일부 먹은 양은 0보다 커야 합니다.' using errcode='22023';
  end if;
  if p_outcome='none' and p_actual_amount is not null and p_actual_amount <> 0 then
    raise exception '먹지 않았다면 실제 섭취량은 0이어야 합니다.' using errcode='22023';
  end if;
  if p_reaction is not null and p_reaction not in ('liked','okay','disliked','watch') then
    raise exception '아기 반응을 확인해 주세요.' using errcode='22023';
  end if;
  if p_note is not null and pg_catalog.char_length(p_note)>100 then
    raise exception '반응 메모는 100자 이하여야 합니다.' using errcode='22023';
  end if;

  select prep.* into v_prep from public.meal_preparations prep
  where prep.id=p_preparation_id and prep.household_id=v_household_id
  for update;
  if not found then raise sqlstate 'PT404' using message='준비한 끼니를 찾을 수 없어요.'; end if;

  if v_prep.status='completed' then
    if v_prep.completion_request_id=p_request_id then return v_prep; end if;
    raise sqlstate 'PT409' using message='이미 다른 기기에서 완료한 끼니입니다.';
  end if;
  if v_prep.status<>'prepared' then
    raise sqlstate 'PT409' using message='취소한 끼니는 완료할 수 없어요.';
  end if;

  select pg_catalog.count(*) into v_rows
  from public.meal_preparation_items item
  where item.preparation_id=p_preparation_id and item.disposition='ready';
  if v_rows=0 then raise sqlstate 'PT409' using message='식기에 담은 큐브가 없어요.'; end if;

  if exists (select 1 from public.meal_preparations prep
    where prep.completion_request_id=p_request_id and prep.id<>p_preparation_id) then
    raise sqlstate 'PT409' using message='이미 다른 끼니에 사용한 완료 요청입니다.';
  end if;

  -- Lock the prepared meal; the row lock serializes updates and completion.
  -- Prepared items were already deducted from freezer stock at preparation time.
  for v_item in
    select item.* from public.meal_preparation_items item
    where item.preparation_id=p_preparation_id and item.disposition='ready'
    order by item.id for update
  loop
    if p_outcome='all' then
      for v_idx in 1..v_item.prepared_quantity loop
        insert into public.consumption_records (
          id,household_id,batch_id,cube_name,unit_amount,unit,
          consumed_at,reaction,reaction_note,preparation_item_id
        ) values (
          gen_random_uuid(),v_household_id,v_item.batch_id,v_item.cube_name,
          v_item.unit_amount,v_item.unit,p_consumed_at,p_reaction,
          nullif(pg_catalog.btrim(p_note),''),v_item.id
        );
      end loop;
    end if;
    update public.meal_preparation_items as item
    set disposition=case when p_outcome='none' then 'unused' else 'consumed' end,
      consumed_quantity=case when p_outcome='all' then item.prepared_quantity else 0 end,
      discarded_quantity=case when p_outcome='none' then item.prepared_quantity else 0 end,
      updated_at=pg_catalog.now()
    where item.id=v_item.id;
  end loop;

  update public.meal_preparations as prep
  set status='completed',
    completed_at=pg_catalog.now(),
    consumed_at=p_consumed_at,
    outcome=p_outcome,
    actual_consumed_amount=p_actual_amount,
    actual_consumed_unit=p_actual_unit,
    reaction=p_reaction,
    reaction_note=nullif(pg_catalog.btrim(p_note),''),
    completion_request_id=p_request_id,
    updated_at=pg_catalog.now()
  where prep.id=p_preparation_id returning * into v_prep;
  return v_prep;
end;
$$;

create or replace function public.cancel_empty_dish_preparation(
  p_preparation_id uuid
)
returns public.meal_preparations
language plpgsql security definer set search_path = ''
as $$
declare
  v_household_id uuid := private.current_household_id();
  v_prep public.meal_preparations%rowtype;
begin
  select prep.* into v_prep
  from public.meal_preparations prep
  where prep.id=p_preparation_id and prep.household_id=v_household_id
  for update;
  if not found then raise sqlstate 'PT404' using message='준비한 끼니가 없어요.'; end if;
  if v_prep.status<>'prepared' then
    raise sqlstate 'PT409' using message='진행 중인 준비만 취소할 수 있어요.';
  end if;
  if exists (
    select 1 from public.meal_preparation_items item
    where item.preparation_id=p_preparation_id and item.disposition='ready'
  ) then
    raise sqlstate 'PT409' using message='담아둔 큐브를 먼저 정정 또는 폐기해 주세요.';
  end if;
  update public.meal_preparations prep
  set status='cancelled',updated_at=pg_catalog.now()
  where prep.id=p_preparation_id
  returning * into v_prep;
  return v_prep;
end;
$$;

create or replace function public.cancel_dish_completion(
  p_preparation_id uuid
)
returns public.meal_preparations
language plpgsql security definer set search_path = ''
as $$
declare
  v_household_id uuid := private.current_household_id();
  v_prep public.meal_preparations%rowtype;
begin
  select prep.* into v_prep from public.meal_preparations prep
  where prep.id=p_preparation_id and prep.household_id=v_household_id
  for update;
  if not found then raise sqlstate 'PT404' using message='준비한 끼니가 없어요.'; end if;
  if v_prep.status<>'completed' then
    raise sqlstate 'PT409' using message='완료된 끼니만 기록을 정정할 수 있어요.';
  end if;

  update public.consumption_records as record
  set cancelled_at=pg_catalog.now()
  where record.household_id=v_household_id
    and record.preparation_item_id in (
      select item.id from public.meal_preparation_items item
      where item.preparation_id=p_preparation_id
    )
    and record.cancelled_at is null;

  update public.meal_preparation_items as item
  set disposition='ready',consumed_quantity=0,discarded_quantity=0,
    updated_at=pg_catalog.now()
  where item.preparation_id=p_preparation_id
    and item.disposition in ('consumed','unused');

  update public.meal_preparations as prep
  set status='prepared',completed_at=null,consumed_at=null,
    outcome=null,actual_consumed_amount=null,actual_consumed_unit=null,
    reaction=null,reaction_note=null,completion_request_id=null,
    updated_at=pg_catalog.now()
  where prep.id=p_preparation_id returning * into v_prep;
  return v_prep;
end;
$$;

revoke all on function public.create_dish_preparation(date,text,jsonb) from public,anon;
revoke all on function public.add_frozen_dish_items(uuid,jsonb) from public,anon;
revoke all on function public.add_fresh_dish_item(uuid,uuid,text,text,timestamptz,numeric,text,text,text[],integer,integer) from public,anon;
revoke all on function public.remove_dish_item(uuid,text) from public,anon;
revoke all on function public.complete_dish_preparation(uuid,uuid,timestamptz,text,numeric,text,text,text) from public,anon;
revoke all on function public.cancel_dish_completion(uuid) from public,anon;
revoke all on function public.cancel_empty_dish_preparation(uuid) from public,anon;
grant execute on function public.create_dish_preparation(date,text,jsonb) to authenticated;
grant execute on function public.add_frozen_dish_items(uuid,jsonb) to authenticated;
grant execute on function public.add_fresh_dish_item(uuid,uuid,text,text,timestamptz,numeric,text,text,text[],integer,integer) to authenticated;
grant execute on function public.remove_dish_item(uuid,text) to authenticated;
grant execute on function public.complete_dish_preparation(uuid,uuid,timestamptz,text,numeric,text,text,text) to authenticated;
grant execute on function public.cancel_dish_completion(uuid) to authenticated;
grant execute on function public.cancel_empty_dish_preparation(uuid) to authenticated;

-- Prevent legacy record deletion/undo from re-stocking physically removed portions.
CREATE OR REPLACE FUNCTION public.delete_consumption_record(p_record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if v_record.preparation_item_id is not null then
    raise sqlstate 'PT409'
      using message='식기에 담아 먹은 기록은 식기에 담기 화면에서 끼니 단위로 정정해 주세요.';
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
$function$;

CREATE OR REPLACE FUNCTION public.undo_consumption(p_record_id uuid)
 RETURNS cube_batches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if v_record.preparation_item_id is not null then
    raise sqlstate 'PT409'
      using message='식기에 담아 먹은 기록은 식기에 담기 화면에서 끼니 단위로 정정해 주세요.';
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
$function$;
