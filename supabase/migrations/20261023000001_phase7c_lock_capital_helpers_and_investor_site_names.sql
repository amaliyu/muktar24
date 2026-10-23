-- ALREADY APPLIED to the live DB by the planning chat on 2026-10-23 (security fix found in PR #125 review), verified. Kept here as the tracked record. DO NOT RE-RUN.
-- SECURITY DEFINER helpers were executable by every logged-in role.
revoke execute on function public.fn_asset_family_site_weights(uuid, date) from authenticated;
revoke execute on function public.fn_site_terms(uuid, date) from authenticated;
-- fn_site_capital_on is called by the Capital page: keep it callable, but only money roles get rows.
create or replace function public.fn_site_capital_on(p_site uuid, p_day date)
returns table (investor_id uuid, capital numeric) language sql stable security definer set search_path = public as $$
  select x.investor_id, sum(x.amt)
  from (
    select c.investor_id,
      case when c.asset_id is null then case when c.site_id = p_site then c.amount else 0 end
           else c.amount * coalesce((select fw.weight from fn_asset_family_site_weights(c.asset_id, p_day) fw where fw.site_id = p_site), 0)
      end as amt
    from capital_contributions c
    where c.contributed_on <= p_day
      and (auth.uid() is null or has_any_role(array['md','accountant','ico','board_member']))
  ) x
  group by x.investor_id
  having sum(x.amt) <> 0;
$$;
-- Investor portal needs the names of its own sites.
create policy production_sites_investor_select on public.production_sites for select to authenticated
  using (id in (select fn_my_investor_sites()));
