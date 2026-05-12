-- Disable Row Level Security on all tables
alter table staff           disable row level security;
alter table attendance      disable row level security;
alter table production_log  disable row level security;
alter table damage_log      disable row level security;
alter table customers       disable row level security;
alter table orders          disable row level security;
alter table order_items     disable row level security;
alter table invoices        disable row level security;
alter table payments        disable row level security;
alter table deliveries      disable row level security;
alter table waybills        disable row level security;

-- Ensure anon role has full access
grant usage on schema public to anon, authenticated;
grant all on all tables    in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

-- Reload schema cache
notify pgrst, 'reload schema';
