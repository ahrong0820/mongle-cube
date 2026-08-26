-- 재료/큐브 종류/제작 배치 연결을 원자적으로 처리하는 RPC와 호환성 trigger를 추가합니다.
-- 기존 RPC 시그니처는 유지하여 이전 프론트엔드도 계속 동작합니다.

create or replace function private.current_household_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
begin
  select member.household_id
  into v_household_id
  from public.household_members as member
  where member.user_id = (select auth.uid());

  if v_household_id is null then
    raise exception '우리집 연결이 필요합니다.' using errcode = '42501';
  end if;

  return v_household_id;
end;
$$;

create or replace function private.ensure_ingredient(
  p_household_id uuid,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_ingredient_id uuid;
begin
  v_name := pg_catalog.btrim(p_name);

  if v_name is null or char_length(v_name) not between 1 and 40 then
    raise exception '재료 이름은 1~40자로 입력해 주세요.' using errcode = '22023';
  end if;

  select ingredient.id
  into v_ingredient_id
  from public.ingredients as ingredient
  where ingredient.household_id = p_household_id
    and ingredient.archived_at is null
    and pg_catalog.lower(pg_catalog.btrim(ingredient.name)) = pg_catalog.lower(v_name)
  limit 1;

  if v_ingredient_id is null then
    begin
      insert into public.ingredients (household_id, name)
      values (p_household_id, v_name)
      returning id into v_ingredient_id;
    exception
      when unique_violation then
        select ingredient.id
        into v_ingredient_id
        from public.ingredients as ingredient
        where ingredient.household_id = p_household_id
          and ingredient.archived_at is null
          and pg_catalog.lower(pg_catalog.btrim(ingredient.name)) = pg_catalog.lower(v_name)
        limit 1;
    end;
  end if;

  if v_ingredient_id is null then
    raise exception '재료를 저장하지 못했습니다.' using errcode = 'P0001';
  end if;

  return v_ingredient_id;
end;
$$;

create or replace function private.set_recipe_ingredients(
  p_recipe_id uuid,
  p_household_id uuid,
  p_names text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_index integer;
  v_ingredient_id uuid;
  v_seen uuid[] := array[]::uuid[];
begin
  if p_names is null or pg_catalog.cardinality(p_names) not between 1 and 12 then
    raise exception '들어간 재료를 1~12개 입력해 주세요.' using errcode = '22023';
  end if;

  delete from public.cube_recipe_ingredients
  where recipe_id = p_recipe_id
    and household_id = p_household_id;

  for v_index in 1..pg_catalog.cardinality(p_names) loop
    v_ingredient_id := private.ensure_ingredient(p_household_id, p_names[v_index]);

    if v_ingredient_id = any(v_seen) then
      raise exception '같은 재료는 한 번만 넣어 주세요.' using errcode = '22023';
    end if;

    v_seen := pg_catalog.array_append(v_seen, v_ingredient_id);

    insert into public.cube_recipe_ingredients (
      household_id,
      recipe_id,
      ingredient_id,
      sort_order
    )
    values (
      p_household_id,
      p_recipe_id,
      v_ingredient_id,
      (v_index - 1)::smallint
    );
  end loop;
end;
$$;

create or replace function private.batch_ingredients_json(p_batch_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', ingredient.id,
        'name', ingredient.name
      )
      order by batch_ingredient.sort_order, ingredient.name
    ),
    '[]'::jsonb
  )
  from public.cube_batch_ingredients as batch_ingredient
  join public.ingredients as ingredient
    on ingredient.id = batch_ingredient.ingredient_id
   and ingredient.household_id = batch_ingredient.household_id
  where batch_ingredient.batch_id = p_batch_id;
$$;

-- 이전 프론트엔드가 새 재료 필드를 모르더라도 같은 이름의 recipe가 있으면 자동 연결합니다.
create or replace function private.set_cube_batch_values()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipe_id uuid;
begin
  if new.recipe_id is null and private.is_household_member(new.household_id) then
    select recipe.id
    into v_recipe_id
    from public.cube_recipes as recipe
    where recipe.household_id = new.household_id
      and recipe.archived_at is null
      and pg_catalog.lower(pg_catalog.btrim(recipe.name)) = pg_catalog.lower(pg_catalog.btrim(new.name))
    order by recipe.updated_at desc, recipe.id desc
    limit 1;

    if v_recipe_id is null then
      begin
        insert into public.cube_recipes (
          household_id,
          name,
          category,
          default_unit_amount,
          default_unit
        )
        values (
          new.household_id,
          pg_catalog.btrim(new.name),
          new.category,
          new.unit_amount,
          new.unit
        )
        returning id into v_recipe_id;
      exception
        when unique_violation then
          select recipe.id
          into v_recipe_id
          from public.cube_recipes as recipe
          where recipe.household_id = new.household_id
            and recipe.archived_at is null
            and pg_catalog.lower(pg_catalog.btrim(recipe.name)) = pg_catalog.lower(pg_catalog.btrim(new.name))
          limit 1;
      end;
    end if;

    new.recipe_id := v_recipe_id;
  end if;

  new.expires_at := new.prepared_at + interval '14 days';
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create or replace function private.snapshot_cube_batch_ingredients()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.cube_batch_ingredients
  where batch_id = new.id
    and household_id = new.household_id;

  if new.recipe_id is not null then
    insert into public.cube_batch_ingredients (
      household_id,
      batch_id,
      ingredient_id,
      sort_order
    )
    select
      new.household_id,
      new.id,
      recipe_ingredient.ingredient_id,
      recipe_ingredient.sort_order
    from public.cube_recipe_ingredients as recipe_ingredient
    where recipe_ingredient.recipe_id = new.recipe_id
      and recipe_ingredient.household_id = new.household_id;
  end if;

  return new;
end;
$$;

drop trigger if exists snapshot_cube_batch_ingredients on public.cube_batches;
create trigger snapshot_cube_batch_ingredients
after insert or update of recipe_id on public.cube_batches
for each row execute function private.snapshot_cube_batch_ingredients();

create or replace function private.snapshot_consumption_record_ingredients()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.consumption_record_ingredients (
    household_id,
    record_id,
    ingredient_id
  )
  select
    new.household_id,
    new.id,
    batch_ingredient.ingredient_id
  from public.cube_batch_ingredients as batch_ingredient
  where batch_ingredient.batch_id = new.batch_id
    and batch_ingredient.household_id = new.household_id
  on conflict (record_id, ingredient_id) do nothing;

  return new;
end;
$$;

drop trigger if exists snapshot_consumption_record_ingredients on public.consumption_records;
create trigger snapshot_consumption_record_ingredients
after insert on public.consumption_records
for each row execute function private.snapshot_consumption_record_ingredients();

create or replace function public.create_cube_batch_with_ingredients(
  p_recipe_id uuid,
  p_name text,
  p_category text,
  p_prepared_at timestamptz,
  p_quantity integer,
  p_unit_amount numeric,
  p_unit text,
  p_memo text,
  p_ingredients text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_name text;
  v_memo text;
  v_recipe public.cube_recipes%rowtype;
  v_batch public.cube_batches%rowtype;
begin
  v_household_id := private.current_household_id();
  v_name := pg_catalog.btrim(p_name);
  v_memo := nullif(pg_catalog.btrim(p_memo), '');

  if v_name is null or char_length(v_name) not between 1 and 40 then
    raise exception '큐브 이름은 1~40자로 입력해 주세요.' using errcode = '22023';
  end if;
  if p_category is null or p_category not in ('base', 'topping', 'snack', 'other') then
    raise exception '재료 역할을 확인해 주세요.' using errcode = '22023';
  end if;
  if p_prepared_at is null or p_prepared_at > pg_catalog.now() + interval '5 minutes' then
    raise exception '제작 날짜를 확인해 주세요.' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity not between 0 and 999 then
    raise exception '만든 개수는 0~999개여야 합니다.' using errcode = '22023';
  end if;
  if (p_unit_amount is null and p_unit is not null)
     or (p_unit_amount is not null and (p_unit_amount <= 0 or p_unit not in ('g', 'mL'))) then
    raise exception '1개 용량과 단위를 확인해 주세요.' using errcode = '22023';
  end if;
  if v_memo is not null and char_length(v_memo) > 100 then
    raise exception '메모는 100자 이하로 입력해 주세요.' using errcode = '22023';
  end if;

  if p_recipe_id is not null then
    select recipe.*
    into v_recipe
    from public.cube_recipes as recipe
    where recipe.id = p_recipe_id
      and recipe.household_id = v_household_id
      and recipe.archived_at is null
    for update;

    if not found then
      raise sqlstate 'PT404' using message = '불러올 이전 큐브를 찾지 못했습니다.';
    end if;
  else
    select recipe.*
    into v_recipe
    from public.cube_recipes as recipe
    where recipe.household_id = v_household_id
      and recipe.archived_at is null
      and pg_catalog.lower(pg_catalog.btrim(recipe.name)) = pg_catalog.lower(v_name)
    limit 1
    for update;

    if not found then
      insert into public.cube_recipes (
        household_id,
        name,
        category,
        default_unit_amount,
        default_unit
      )
      values (
        v_household_id,
        v_name,
        p_category,
        p_unit_amount,
        p_unit
      )
      returning * into v_recipe;
    end if;
  end if;

  begin
    update public.cube_recipes as recipe
    set name = v_name,
        category = p_category,
        default_unit_amount = p_unit_amount,
        default_unit = p_unit,
        updated_at = pg_catalog.now()
    where recipe.id = v_recipe.id
      and recipe.household_id = v_household_id
    returning * into v_recipe;
  exception
    when unique_violation then
      raise sqlstate 'PT409' using message = '같은 이름의 큐브 종류가 이미 있습니다.';
  end;

  perform private.set_recipe_ingredients(v_recipe.id, v_household_id, p_ingredients);

  insert into public.cube_batches (
    household_id,
    recipe_id,
    name,
    category,
    prepared_at,
    quantity,
    unit_amount,
    unit,
    memo
  )
  values (
    v_household_id,
    v_recipe.id,
    v_name,
    p_category,
    p_prepared_at,
    p_quantity,
    p_unit_amount,
    p_unit,
    v_memo
  )
  returning * into v_batch;

  return pg_catalog.jsonb_build_object(
    'batch', pg_catalog.to_jsonb(v_batch),
    'ingredients', private.batch_ingredients_json(v_batch.id)
  );
end;
$$;

create or replace function public.update_cube_batch_with_ingredients(
  p_batch_id uuid,
  p_expected_updated_at timestamptz,
  p_recipe_id uuid,
  p_name text,
  p_category text,
  p_prepared_at timestamptz,
  p_quantity integer,
  p_unit_amount numeric,
  p_unit text,
  p_memo text,
  p_ingredients text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_name text;
  v_memo text;
  v_recipe public.cube_recipes%rowtype;
  v_batch public.cube_batches%rowtype;
begin
  v_household_id := private.current_household_id();
  v_name := pg_catalog.btrim(p_name);
  v_memo := nullif(pg_catalog.btrim(p_memo), '');

  if v_name is null or char_length(v_name) not between 1 and 40 then
    raise exception '큐브 이름은 1~40자로 입력해 주세요.' using errcode = '22023';
  end if;
  if p_category is null or p_category not in ('base', 'topping', 'snack', 'other') then
    raise exception '재료 역할을 확인해 주세요.' using errcode = '22023';
  end if;
  if p_prepared_at is null or p_prepared_at > pg_catalog.now() + interval '5 minutes' then
    raise exception '제작 날짜를 확인해 주세요.' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity not between 0 and 999 then
    raise exception '현재 개수는 0~999개여야 합니다.' using errcode = '22023';
  end if;
  if (p_unit_amount is null and p_unit is not null)
     or (p_unit_amount is not null and (p_unit_amount <= 0 or p_unit not in ('g', 'mL'))) then
    raise exception '1개 용량과 단위를 확인해 주세요.' using errcode = '22023';
  end if;
  if v_memo is not null and char_length(v_memo) > 100 then
    raise exception '메모는 100자 이하로 입력해 주세요.' using errcode = '22023';
  end if;

  select batch.*
  into v_batch
  from public.cube_batches as batch
  where batch.id = p_batch_id
    and batch.household_id = v_household_id
    and batch.deleted_at is null
  for update;

  if not found then
    raise sqlstate 'PT404' using message = '수정할 큐브를 찾지 못했습니다.';
  end if;

  if p_expected_updated_at is null or v_batch.updated_at <> p_expected_updated_at then
    raise sqlstate 'PT409' using message = '다른 화면에서 먼저 수정했습니다.';
  end if;

  if p_recipe_id is not null then
    select recipe.*
    into v_recipe
    from public.cube_recipes as recipe
    where recipe.id = p_recipe_id
      and recipe.household_id = v_household_id
      and recipe.archived_at is null
    for update;

    if not found then
      raise sqlstate 'PT404' using message = '연결할 큐브 종류를 찾지 못했습니다.';
    end if;
  elsif v_batch.recipe_id is not null then
    select recipe.*
    into v_recipe
    from public.cube_recipes as recipe
    where recipe.id = v_batch.recipe_id
      and recipe.household_id = v_household_id
      and recipe.archived_at is null
    for update;
  else
    select recipe.*
    into v_recipe
    from public.cube_recipes as recipe
    where recipe.household_id = v_household_id
      and recipe.archived_at is null
      and pg_catalog.lower(pg_catalog.btrim(recipe.name)) = pg_catalog.lower(v_name)
    limit 1
    for update;
  end if;

  if v_recipe.id is null then
    insert into public.cube_recipes (
      household_id,
      name,
      category,
      default_unit_amount,
      default_unit
    )
    values (
      v_household_id,
      v_name,
      p_category,
      p_unit_amount,
      p_unit
    )
    returning * into v_recipe;
  end if;

  begin
    update public.cube_recipes as recipe
    set name = v_name,
        category = p_category,
        default_unit_amount = p_unit_amount,
        default_unit = p_unit,
        updated_at = pg_catalog.now()
    where recipe.id = v_recipe.id
      and recipe.household_id = v_household_id
    returning * into v_recipe;
  exception
    when unique_violation then
      raise sqlstate 'PT409' using message = '같은 이름의 큐브 종류가 이미 있습니다.';
  end;

  perform private.set_recipe_ingredients(v_recipe.id, v_household_id, p_ingredients);

  update public.cube_batches as batch
  set recipe_id = v_recipe.id,
      name = v_name,
      category = p_category,
      prepared_at = p_prepared_at,
      quantity = p_quantity,
      unit_amount = p_unit_amount,
      unit = p_unit,
      memo = v_memo
  where batch.id = v_batch.id
  returning * into v_batch;

  -- 이 배치에서 이미 먹은 기록이 있다면 현재 확인한 실제 재료를 과거 기록에도 채웁니다.
  insert into public.consumption_record_ingredients (
    household_id,
    record_id,
    ingredient_id
  )
  select
    record.household_id,
    record.id,
    batch_ingredient.ingredient_id
  from public.consumption_records as record
  join public.cube_batch_ingredients as batch_ingredient
    on batch_ingredient.batch_id = record.batch_id
   and batch_ingredient.household_id = record.household_id
  where record.batch_id = v_batch.id
    and record.household_id = v_household_id
  on conflict (record_id, ingredient_id) do nothing;

  return pg_catalog.jsonb_build_object(
    'batch', pg_catalog.to_jsonb(v_batch),
    'ingredients', private.batch_ingredients_json(v_batch.id)
  );
end;
$$;

create or replace function public.configure_legacy_recipe(
  p_recipe_id uuid,
  p_ingredients text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_recipe public.cube_recipes%rowtype;
  v_linked_batches integer := 0;
  v_backfilled_records integer := 0;
begin
  v_household_id := private.current_household_id();

  select recipe.*
  into v_recipe
  from public.cube_recipes as recipe
  where recipe.id = p_recipe_id
    and recipe.household_id = v_household_id
    and recipe.archived_at is null
  for update;

  if not found then
    raise sqlstate 'PT404' using message = '재료를 설정할 큐브 종류를 찾지 못했습니다.';
  end if;

  perform private.set_recipe_ingredients(v_recipe.id, v_household_id, p_ingredients);

  update public.cube_batches as batch
  set recipe_id = v_recipe.id
  where batch.household_id = v_household_id
    and batch.recipe_id is null
    and pg_catalog.lower(pg_catalog.btrim(batch.name)) = pg_catalog.lower(pg_catalog.btrim(v_recipe.name));
  get diagnostics v_linked_batches = row_count;

  -- 이미 recipe_id가 연결되어 있으나 스냅샷이 비어 있는 배치도 보완합니다.
  insert into public.cube_batch_ingredients (
    household_id,
    batch_id,
    ingredient_id,
    sort_order
  )
  select
    batch.household_id,
    batch.id,
    recipe_ingredient.ingredient_id,
    recipe_ingredient.sort_order
  from public.cube_batches as batch
  join public.cube_recipe_ingredients as recipe_ingredient
    on recipe_ingredient.recipe_id = v_recipe.id
   and recipe_ingredient.household_id = batch.household_id
  where batch.household_id = v_household_id
    and batch.recipe_id = v_recipe.id
  on conflict (batch_id, ingredient_id) do nothing;

  insert into public.consumption_record_ingredients (
    household_id,
    record_id,
    ingredient_id
  )
  select
    record.household_id,
    record.id,
    batch_ingredient.ingredient_id
  from public.consumption_records as record
  join public.cube_batches as batch
    on batch.id = record.batch_id
   and batch.household_id = record.household_id
  join public.cube_batch_ingredients as batch_ingredient
    on batch_ingredient.batch_id = batch.id
   and batch_ingredient.household_id = batch.household_id
  where batch.household_id = v_household_id
    and batch.recipe_id = v_recipe.id
  on conflict (record_id, ingredient_id) do nothing;
  get diagnostics v_backfilled_records = row_count;

  return pg_catalog.jsonb_build_object(
    'recipe_id', v_recipe.id,
    'linked_batches', v_linked_batches,
    'backfilled_record_ingredients', v_backfilled_records
  );
end;
$$;

revoke all on function private.current_household_id() from public, anon, authenticated;
revoke all on function private.ensure_ingredient(uuid, text) from public, anon, authenticated;
revoke all on function private.set_recipe_ingredients(uuid, uuid, text[]) from public, anon, authenticated;
revoke all on function private.batch_ingredients_json(uuid) from public, anon, authenticated;
revoke all on function private.snapshot_cube_batch_ingredients() from public, anon, authenticated;
revoke all on function private.snapshot_consumption_record_ingredients() from public, anon, authenticated;

revoke all on function public.create_cube_batch_with_ingredients(uuid, text, text, timestamptz, integer, numeric, text, text, text[]) from public, anon;
revoke all on function public.update_cube_batch_with_ingredients(uuid, timestamptz, uuid, text, text, timestamptz, integer, numeric, text, text, text[]) from public, anon;
revoke all on function public.configure_legacy_recipe(uuid, text[]) from public, anon;

grant execute on function public.create_cube_batch_with_ingredients(uuid, text, text, timestamptz, integer, numeric, text, text, text[]) to authenticated;
grant execute on function public.update_cube_batch_with_ingredients(uuid, timestamptz, uuid, text, text, timestamptz, integer, numeric, text, text, text[]) to authenticated;
grant execute on function public.configure_legacy_recipe(uuid, text[]) to authenticated;
