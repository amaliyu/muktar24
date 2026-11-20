-- A voided delivery's reversal is dated on the delivery's own date (so stock "as at a day" is right), unless that
-- date is already locked by an approved stock count, in which case it is dated today.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.void_material_receipt(uuid,text)'::regprocedure);
  if position('declare r material_receipts%rowtype; v_mov uuid; v_name text;' in d) = 0
     or position('v_name, current_date,' in d) = 0
     or position('select full_name into v_name from user_profiles where id = auth.uid();' in d) = 0 then
    raise exception 'void_material_receipt: expected text not found';
  end if;
  d := replace(d, 'declare r material_receipts%rowtype; v_mov uuid; v_name text;',
                  'declare r material_receipts%rowtype; v_mov uuid; v_name text; v_lock date; v_void_date date;');
  d := replace(d, 'select full_name into v_name from user_profiles where id = auth.uid();',
                  'select full_name into v_name from user_profiles where id = auth.uid();
  select max(count_date) into v_lock from stock_counts where site_id = r.site_id and status = ''approved'';
  v_void_date := case when v_lock is not null and r.received_on <= v_lock then lagos_today() else r.received_on end;');
  d := replace(d, 'v_name, current_date,', 'v_name, v_void_date,');
  execute d;
end $$;

-- This morning's two Kado dust corrections: date their reversals on the original delivery dates.
update public.stock_movements m
   set date = r.received_on
  from public.material_receipts r
 where r.void_movement_id = m.id
   and r.item_id = 'eaf83416-fbbc-40d1-b400-05ac3f4f3a2a'
   and r.voided and m.date <> r.received_on;
