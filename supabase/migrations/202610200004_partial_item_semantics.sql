-- Partially eaten mixed dishes must not be classified as fully consumed items.
alter table public.meal_preparation_items
  drop constraint meal_preparation_items_disposition_check;

alter table public.meal_preparation_items
  add constraint meal_preparation_items_disposition_check
  check (disposition in (
    'ready', 'consumed', 'offered_partial', 'discarded', 'corrected', 'unused'
  ));

CREATE OR REPLACE FUNCTION public.cancel_dish_completion(p_preparation_id uuid)
 RETURNS meal_preparations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    and item.disposition in ('consumed','offered_partial','unused');

  update public.meal_preparations as prep
  set status='prepared',completed_at=null,consumed_at=null,
    outcome=null,actual_consumed_amount=null,actual_consumed_unit=null,
    reaction=null,reaction_note=null,completion_request_id=null,
    updated_at=pg_catalog.now()
  where prep.id=p_preparation_id returning * into v_prep;
  return v_prep;
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_dish_preparation(p_preparation_id uuid, p_request_id uuid, p_consumed_at timestamp with time zone, p_outcome text, p_actual_amount numeric, p_actual_unit text, p_reaction text, p_note text)
 RETURNS meal_preparations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    set disposition=case when p_outcome='none' then 'unused' when p_outcome='partial' then 'offered_partial' else 'consumed' end,
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
$function$;

