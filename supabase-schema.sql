-- Supabase schema for inventory forms and items
-- Run the entire file in Supabase SQL Editor to set up or reset the schema.

-- ── Auto form-number support ──────────────────────────────────────────────────
-- Run this block once to add form_number to an existing table:
--   ALTER TABLE inventory_forms ADD COLUMN IF NOT EXISTS form_number TEXT;

create table if not exists inventory_forms (
  id uuid primary key default gen_random_uuid(),
  form_number text,
  organization text not null,
  created_by uuid,
  created_by_email text,
  message_to_admin text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create table if not exists plus_items (
  id uuid primary key default gen_random_uuid(),
  form_id uuid references inventory_forms(id) on delete cascade,
  item_type text not null,
  item_name text not null,
  quantity integer not null,
  notes text,
  image_path text,
  created_at timestamptz not null default now()
);

create table if not exists minus_items (
  id uuid primary key default gen_random_uuid(),
  form_id uuid references inventory_forms(id) on delete cascade,
  item_type text not null,
  item_name text not null,
  quantity integer not null,
  system_code text not null,
  notes text,
  created_at timestamptz not null default now()
);

-- =====================
-- Row Level Security
-- =====================

-- Step 1: Drop ALL existing policies on these tables (handles any prior partial runs)
do $$
declare
  pol record;
begin
  for pol in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('inventory_forms', 'plus_items', 'minus_items')
  loop
    execute format('drop policy if exists %I on %I', pol.policyname, pol.tablename);
  end loop;
end;
$$;

-- Step 2: Enable RLS
alter table inventory_forms enable row level security;
alter table plus_items enable row level security;
alter table minus_items enable row level security;

-- Step 3: inventory_forms policies
create policy "forms_insert"
  on inventory_forms for insert to authenticated
  with check (created_by = auth.uid());

create policy "forms_select"
  on inventory_forms for select to authenticated
  using (true);

create policy "forms_update"
  on inventory_forms for update to authenticated
  using (true) with check (true);

-- Step 4: plus_items policies
create policy "plus_insert"
  on plus_items for insert to authenticated
  with check (true);

create policy "plus_select"
  on plus_items for select to authenticated
  using (true);

create policy "plus_delete"
  on plus_items for delete to authenticated
  using (true);

-- ── Form-number auto-generation ───────────────────────────────────────────────

create sequence if not exists inventory_forms_number_seq;

create or replace function generate_form_number()
returns trigger language plpgsql as $$
begin
  if new.form_number is null then
    new.form_number :=
      'INV-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('inventory_forms_number_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_form_number on inventory_forms;
create trigger trg_set_form_number
  before insert on inventory_forms
  for each row execute function generate_form_number();

-- Step 5: minus_items policies
create policy "minus_insert"
  on minus_items for insert to authenticated
  with check (true);

create policy "minus_select"
  on minus_items for select to authenticated
  using (true);

create policy "minus_delete"
  on minus_items for delete to authenticated
  using (true);
