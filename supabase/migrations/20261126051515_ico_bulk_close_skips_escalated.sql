-- The ICO's "close all explained" must not close days he escalated to the MD.
create or replace function public.close_explained_exceptions(p_site_id uuid default null, p_note text default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_name text; v_role text; v_n int;
begin
  if not has_any_role(array['md','ico']) then raise exception 'Only the MD or ICO can close warnings.'; end if;
  select full_name, role into v_name, v_role from user_profiles where id = auth.uid();
  with c as (
    update production_exceptions e set status = 'closed', closed_by_name = v_name, closed_at = now(),
           close_note = coalesce(nullif(btrim(p_note), ''), 'Closed with the other explained warnings.'), updated_at = now()
     where e.status = 'explained' and (p_site_id is null or e.site_id = p_site_id) and can_see_site(e.site_id)
       and (v_role is distinct from 'ico' or e.escalated_at is null)
    returning e.id)
  insert into production_exception_comments (exception_id, kind, body, author_id, author_name, author_role)
  select id, 'closed', coalesce(nullif(btrim(p_note), ''), 'Closed with the other explained warnings.'), auth.uid(), v_name, v_role from c;
  get diagnostics v_n = row_count;
  if v_role = 'ico' and v_n > 0 then
    perform fn_notify_role('md', 'info', 'Closed by the ICO: ' || v_n || ' explained warning line(s)',
      v_name || coalesce(': ' || nullif(btrim(p_note), ''), ' closed them with the other explained warnings.'), 'production_exceptions', null);
  end if;
  return v_n;
end $function$;
