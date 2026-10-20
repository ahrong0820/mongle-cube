-- Additive foundation for physical dish preparation (no legacy data is mutated).
-- Write access is intentionally disabled until transactional RPCs are deployed.

create table public.meal_preparations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  serving_on date not null,
  meal_slot text not null check (meal_slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  status text not null default 'prepared'
    check (status in ('prepared', 'completed', 'cancelled')),
  prepared_at timestamptz not null default now(),
  consumed_at timestamptz,
  completed_at timestamptz,
  outcome text check (outcome in ('all', 'partial', 'none')),
  actual_consumed_amount numeric(8, 2)
    check (actual_consumed_amount is null or actual_consumed_amount >= 0),
  actual_consumed_unit text
    check (
      (actual_consumed_amount is null and actual_consumed_unit is null)
      or (actual_consumed_amount is not null and actual_consumed_unit in ('g', 'mL'))
    ),
  reaction text
    check (reaction is null or reaction in ('liked', 'okay', 'disliked', 'watch')),
  reaction_note text
    check (reaction_note is null or char_length(reaction_note) <= 100),
  completion_request_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meal_preparations_completion_check check (
    (
      status <> 'completed'
      and completed_at is null
      and outcome is null
      and consumed_at is null
      and completion_request_id is null
    ) or (
      status = 'completed'
      and completed_at is not null
      and outcome is not null
      and consumed_at is not null
      and completion_request_id is not null
    )
  ),
  constraint meal_preparations_household_pair unique (id, household_id)
);

create unique index meal_preparations_active_slot_unique
  on public.meal_preparations (household_id, serving_on, meal_slot)
  where status <> 'cancelled';

create index meal_preparations_household_day_idx
  on public.meal_preparations (household_id, serving_on desc, prepared_at desc);

create table public.meal_preparation_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  preparation_id uuid not null,
  batch_id uuid not null,
  source_kind text not null
    check (source_kind in ('frozen', 'direct_fresh')),
  prepared_quantity smallint not null
    check (prepared_quantity between 1 and 12),
  cube_name text not null check (char_length(cube_name) between 1 and 40),
  category text not null
    check (category in ('base', 'topping', 'snack', 'other')),
  unit_amount numeric(7, 2)
    check (unit_amount is null or unit_amount > 0),
  unit text check (
    (unit_amount is null and unit is null)
    or (unit_amount is not null and unit in ('g', 'mL'))
  ),
  disposition text not null default 'ready'
    check (disposition in ('ready', 'consumed', 'discarded', 'corrected')),
  consumed_quantity smallint not null default 0
    check (consumed_quantity >= 0),
  discarded_quantity smallint not null default 0
    check (discarded_quantity >= 0),
  corrected_quantity smallint not null default 0
    check (corrected_quantity >= 0),
  prepared_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meal_preparation_items_totals_check check (
    consumed_quantity + discarded_quantity + corrected_quantity <= prepared_quantity
  ),
  constraint meal_preparation_items_household_preparation_fk
    foreign key (preparation_id, household_id)
    references public.meal_preparations (id, household_id) on delete restrict,
  constraint meal_preparation_items_household_batch_fk
    foreign key (batch_id, household_id)
    references public.cube_batches (id, household_id) on delete restrict,
  constraint meal_preparation_items_household_pair unique (id, household_id)
);

create index meal_preparation_items_preparation_idx
  on public.meal_preparation_items (household_id, preparation_id, prepared_at);

create index meal_preparation_items_batch_idx
  on public.meal_preparation_items (household_id, batch_id)
  where disposition = 'ready';

alter table public.meal_preparations enable row level security;
alter table public.meal_preparation_items enable row level security;

create policy "members can read their own dish preparations"
  on public.meal_preparations for select to authenticated
  using (private.is_household_member(household_id));

create policy "members can read their own dish preparation items"
  on public.meal_preparation_items for select to authenticated
  using (private.is_household_member(household_id));

revoke all on table public.meal_preparations from public, anon, authenticated;
revoke all on table public.meal_preparation_items from public, anon, authenticated;
grant select on table public.meal_preparations to authenticated;
grant select on table public.meal_preparation_items to authenticated;

alter publication supabase_realtime add table public.meal_preparations;
alter publication supabase_realtime add table public.meal_preparation_items;
