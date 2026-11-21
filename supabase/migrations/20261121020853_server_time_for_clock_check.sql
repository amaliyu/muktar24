-- The app's "date/time looks wrong" banner compared the device clock with a token expiry that was itself computed
-- from the device clock, so it only produced false alarms. The app now compares the device clock with the server's.
create or replace function public.server_time()
returns timestamptz language sql stable as $$ select now() $$;
revoke all on function public.server_time() from public, anon;
grant execute on function public.server_time() to authenticated;
