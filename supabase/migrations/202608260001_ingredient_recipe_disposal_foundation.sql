-- 몽글큐브 3단계 재고 모델의 기반을 추가합니다.
-- 이 migration은 기존 앱과 호환되도록 additive하게만 동작합니다.
-- 기존 cube_batches / consumption_records / meal_plan_items 구조와 RPC는 제거하거나 변경하지 않습니다.

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint ingredients_id_household_key unique (id, household_id)
);

create unique index ingredients_active_name_key
  on public.ingredients (household_id, lower(btrim(name)))
  where archived_at is null;

create table public.cube_recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  category text not null default 'topping'
    check (category in ('base', 'topping', 'snack', 'other')),
  default_unit_amount numeric(7, 2)
    check (default_unit_amount is null or default_unit_amount > 0),
  default_unit text check (
    (default_unit_amount is null and default_unit is null)
    or (default_unit_amount is not null and default_unit in ('g', 'mL'))
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint cube_recipes_id_household_key unique (id, household_id)
);

create unique index cube_recipes_active_name_key
  on public.cube_recipes (household_id, lower(btrim(name)))
  where archived_at is null;

create table public.cube_recipe_ingredients (
  household_id uuid not null references public.households(id) on delete cascade,
  recipe_id uuid not null,
  ingredient_id uuid not null,
  sort_order smallint not null default 0 check (sort_order between 0 and 99),
  created_at timestamptz not null default now(),
  primary key (recipe_id, ingredient_id),
  constraint cube_recipe_ingredients_recipe_fk
    foreign key (recipe_id, household_id)
    references public.cube_recipes(id, household_id)
    on delete cascade,
  constraint cube_recipe_ingredients_ingredient_fk
    foreign key (ingredient_id, household_id)
    references public.ingredients(id, household_id)
);

alter table public.cube_batches
  add column recipe_id uuid;

alter table public.cube_batches
  add constraint cube_batches_recipe_household_fk
  foreign key (recipe_id, household_id)
  references public.cube_recipes(id, household_id);

create index cube_batches_recipe_idx
  on public.cube_batches (household_id, recipe_id, prepared_at desc)
  where deleted_at is null;

create table public.cube_batch_ingredients (
  household_id uuid not null references public.households(id) on delete cascade,
  batch_id uuid not null,
  ingredient_id uuid not null,
  sort_order smallint not null default 0 check (sort_order between 0 and 99),
  created_at timestamptz not null default now(),
  primary key (batch_id, ingredient_id),
  constraint cube_batch_ingredients_batch_fk
    foreign key (batch_id, household_id)
    references public.cube_batches(id, household_id)
    on delete cascade,
  constraint cube_batch_ingredients_ingredient_fk
    foreign key (ingredient_id, household_id)
    references public.ingredients(id, household_id)
);

create table public.consumption_record_ingredients (
  household_id uuid not null references public.households(id) on delete cascade,
  record_id uuid not null,
  ingredient_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (record_id, ingredient_id),
  constraint consumption_record_ingredients_record_fk
    foreign key (record_id, household_id)
    references public.consumption_records(id, household_id)
    on delete cascade,
  constraint consumption_record_ingredients_ingredient_fk
    foreign key (ingredient_id, household_id)
    references public.ingredients(id, household_id)
);

create index consumption_record_ingredients_first_exposure_idx
  on public.consumption_record_ingredients (household_id, ingredient_id, record_id);

create table public.cube_disposals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  batch_id uuid not null,
  quantity smallint not null check (quantity between 1 and 999),
  disposed_at timestamptz not null default now(),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint cube_disposals_cancelled_after_disposed_check
    check (cancelled_at is null or cancelled_at >= disposed_at),
  constraint cube_disposals_batch_fk
    foreign key (batch_id, household_id)
    references public.cube_batches(id, household_id)
);

create index cube_disposals_active_batch_idx
  on public.cube_disposals (household_id, batch_id, disposed_at desc)
  where cancelled_at is null;

-- 같은 이름으로 반복 제작된 기존 배치는 하나의 큐브 종류(recipe)로 안전하게 묶습니다.
-- 실제 재료는 추측하지 않으며, 후속 단계에서 사용자가 확인한 뒤 연결합니다.
insert into public.cube_recipes (
  household_id,
  name,
  category,
  default_unit_amount,
  default_unit,
  created_at,
  updated_at
)
select distinct on (batch.household_id, lower(btrim(batch.name)))
  batch.household_id,
  btrim(batch.name),
  batch.category,
  batch.unit_amount,
  batch.unit,
  batch.created_at,
  batch.updated_at
from public.cube_batches as batch
order by
  batch.household_id,
  lower(btrim(batch.name)),
  batch.prepared_at desc,
  batch.created_at desc,
  batch.id desc;

update public.cube_batches as batch
set recipe_id = recipe.id
from public.cube_recipes as recipe
where batch.recipe_id is null
  and recipe.household_id = batch.household_id
  and recipe.archived_at is null
  and lower(btrim(recipe.name)) = lower(btrim(batch.name));

alter table public.ingredients enable row level security;
alter table public.cube_recipes enable row level security;
alter table public.cube_recipe_ingredients enable row level security;
alter table public.cube_batch_ingredients enable row level security;
alter table public.consumption_record_ingredients enable row level security;
alter table public.cube_disposals enable row level security;

create policy "members can read their ingredients"
on public.ingredients
for select
to authenticated
using (private.is_household_member(household_id));

create policy "members can read their cube recipes"
on public.cube_recipes
for select
to authenticated
using (private.is_household_member(household_id));

create policy "members can read recipe ingredients"
on public.cube_recipe_ingredients
for select
to authenticated
using (private.is_household_member(household_id));

create policy "members can read batch ingredients"
on public.cube_batch_ingredients
for select
to authenticated
using (private.is_household_member(household_id));

create policy "members can read consumed ingredients"
on public.consumption_record_ingredients
for select
to authenticated
using (private.is_household_member(household_id));

create policy "members can read cube disposals"
on public.cube_disposals
for select
to authenticated
using (private.is_household_member(household_id));

revoke all on table public.ingredients from anon, authenticated;
revoke all on table public.cube_recipes from anon, authenticated;
revoke all on table public.cube_recipe_ingredients from anon, authenticated;
revoke all on table public.cube_batch_ingredients from anon, authenticated;
revoke all on table public.consumption_record_ingredients from anon, authenticated;
revoke all on table public.cube_disposals from anon, authenticated;

grant select on table public.ingredients to authenticated;
grant select on table public.cube_recipes to authenticated;
grant select on table public.cube_recipe_ingredients to authenticated;
grant select on table public.cube_batch_ingredients to authenticated;
grant select on table public.consumption_record_ingredients to authenticated;
grant select on table public.cube_disposals to authenticated;

alter table public.ingredients replica identity full;
alter table public.cube_recipes replica identity full;
alter table public.cube_recipe_ingredients replica identity full;
alter table public.cube_batch_ingredients replica identity full;
alter table public.consumption_record_ingredients replica identity full;
alter table public.cube_disposals replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.ingredients;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.cube_recipes;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.cube_recipe_ingredients;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.cube_batch_ingredients;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.consumption_record_ingredients;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.cube_disposals;
exception
  when duplicate_object then null;
end;
$$;
