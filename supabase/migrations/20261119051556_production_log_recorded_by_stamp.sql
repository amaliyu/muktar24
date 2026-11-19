-- Applied to production 2026-11-19 by the planning chat (recorded here afterwards). MD approved 2026-11-19.
-- Who entered a production record is taken from the login, not from the form.
-- Before this, none of the 96 production records had recorded_by filled (the screens never sent it).
-- production_log.recorded_by references staff(id); the stamp uses the logged-in user's staff link.
-- Once set, recorded_by cannot be changed by a later edit (edits are tracked in updated_by).
-- Verified with a rolled-back test as Umar: a form sending another person's id was stamped as Umar,
-- and an edit trying to blank it kept Umar; site stamped Kado.

create or replace function public.fn_production_recorded_by_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_staff uuid;
begin
  if tg_op = 'UPDATE' then
    if old.recorded_by is not null then
      new.recorded_by := old.recorded_by;
    end if;
    return new;
  end if;
  if auth.uid() is null then return new; end if;
  select staff_id into v_staff from user_profiles where id = auth.uid();
  if v_staff is not null then
    new.recorded_by := v_staff;
  end if;
  return new;
end $$;

revoke all on function public.fn_production_recorded_by_stamp() from public, anon;

drop trigger if exists trg_0_production_recorded_by_stamp on public.production_log;
create trigger trg_0_production_recorded_by_stamp
  before insert or update on public.production_log
  for each row execute function public.fn_production_recorded_by_stamp();

-- Data applied the same day (not part of the schema change, recorded for history):
--   Kado production entries dated 16, 17 and 18 Nov 2026 set to recorded_by = Umar Mohammed Idris
--   (entered 18 Nov 21:57-22:03; late_entries names him for 16 Nov; he confirmed on WhatsApp at 22:10).
--   Their stock movements were checked unchanged before and after.
