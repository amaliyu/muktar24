-- ============================================================
-- Abuja Precast Concrete Limited — Fixed Schema
-- Run this in Supabase SQL Editor (New query tab)
-- ============================================================

create table staff (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null,
  phone           text,
  staff_type      text not null check (staff_type in ('permanent','daily')),
  role            text not null,
  daily_rate      numeric(10,2),
  monthly_salary  numeric(10,2),
  date_hired      date,
  is_active       boolean default true,
  created_at      timestamptz default now()
);

create table attendance (
  id           uuid primary key default gen_random_uuid(),
  staff_id     uuid references staff(id) on delete cascade,
  date         date not null,
  present      boolean default false,
  hours_worked numeric(4,1) default 0,
  created_at   timestamptz default now(),
  unique(staff_id, date)
);

create table production_log (
  id                uuid primary key default gen_random_uuid(),
  date              date not null,
  block_type        text not null check (block_type in ('9-inch','6-inch','Interlock')),
  quantity_produced integer not null,
  granite_dust_kg   numeric(10,2),
  cement_bags       numeric(10,2),
  diesel_litres     numeric(10,2),
  recorded_by       uuid references staff(id),
  created_at        timestamptz default now()
);

create table customers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text,
  location   text,
  added_by   uuid references staff(id),
  created_at timestamptz default now()
);

create table orders (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id),
  marketer_id uuid references staff(id),
  status      text not null default 'pending' check (status in ('pending','invoiced','in_progress','completed','cancelled')),
  created_at  timestamptz default now()
);

create table order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references orders(id) on delete cascade,
  block_type  text not null check (block_type in ('9-inch','6-inch','Interlock')),
  quantity    integer not null,
  unit_price  numeric(10,2) not null,
  subtotal    numeric(12,2) generated always as (quantity * unit_price) stored,
  created_at  timestamptz default now()
);

create table invoices (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid references orders(id),
  invoice_number text unique not null,
  total_amount   numeric(12,2),
  issued_date    date,
  due_date       date,
  pdf_url        text,
  created_at     timestamptz default now()
);

create table payments (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid references invoices(id),
  amount_paid  numeric(12,2) not null,
  payment_date date not null,
  proof_url    text,
  confirmed_by uuid references staff(id),
  status       text not null default 'pending' check (status in ('pending','confirmed')),
  created_at   timestamptz default now()
);

create table deliveries (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid references orders(id),
  driver_id           uuid references staff(id),
  delivery_date       date,
  destination         text,
  distance_km         numeric(8,2),
  diesel_given_litres numeric(8,2),
  loading_cost        numeric(10,2),
  offloading_cost     numeric(10,2),
  quantity_delivered  integer,
  block_type          text check (block_type in ('9-inch','6-inch','Interlock')),
  status              text default 'pending' check (status in ('pending','in_transit','delivered')),
  created_at          timestamptz default now()
);

create table damage_log (
  id                uuid primary key default gen_random_uuid(),
  date              date not null,
  block_type        text not null check (block_type in ('9-inch','6-inch','Interlock')),
  stage             text not null check (stage in ('production','stacking','loading','delivery')),
  quantity_damaged  integer not null,
  production_log_id uuid references production_log(id),
  delivery_id       uuid references deliveries(id),
  notes             text,
  recorded_by       uuid references staff(id),
  created_at        timestamptz default now()
);

create table waybills (
  id                uuid primary key default gen_random_uuid(),
  waybill_number    text unique not null,
  delivery_id       uuid references deliveries(id),
  truck_number      text,
  driver_id         uuid references staff(id),
  block_type        text check (block_type in ('9-inch','6-inch','Interlock')),
  quantity_loaded   integer,
  quantity_received integer,
  quantity_damaged  integer default 0,
  receiver_name     text,
  waybill_date      date not null,
  recorded_by       uuid references staff(id),
  notes             text,
  created_at        timestamptz default now()
);

-- Indexes
create index on attendance(staff_id);
create index on attendance(date);
create index on production_log(date);
create index on damage_log(date);
create index on orders(customer_id);
create index on orders(status);
create index on order_items(order_id);
create index on invoices(order_id);
create index on payments(invoice_id);
create index on deliveries(order_id);
create index on waybills(delivery_id);

-- Enable Row Level Security
alter table staff           enable row level security;
alter table attendance      enable row level security;
alter table production_log  enable row level security;
alter table damage_log      enable row level security;
alter table customers       enable row level security;
alter table orders          enable row level security;
alter table order_items     enable row level security;
alter table invoices        enable row level security;
alter table payments        enable row level security;
alter table deliveries      enable row level security;
alter table waybills        enable row level security;

-- RLS Policies (allow full access for now)
create policy "allow_all" on staff           for all using (true) with check (true);
create policy "allow_all" on attendance      for all using (true) with check (true);
create policy "allow_all" on production_log  for all using (true) with check (true);
create policy "allow_all" on damage_log      for all using (true) with check (true);
create policy "allow_all" on customers       for all using (true) with check (true);
create policy "allow_all" on orders          for all using (true) with check (true);
create policy "allow_all" on order_items     for all using (true) with check (true);
create policy "allow_all" on invoices        for all using (true) with check (true);
create policy "allow_all" on payments        for all using (true) with check (true);
create policy "allow_all" on deliveries      for all using (true) with check (true);
create policy "allow_all" on waybills        for all using (true) with check (true);

-- Grant access to anon and authenticated roles
grant usage on schema public to anon, authenticated;
grant all on all tables    in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
