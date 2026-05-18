-- Supabase schema for inventory forms and items

create table if not exists inventory_forms (
  id uuid primary key default gen_random_uuid(),
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
