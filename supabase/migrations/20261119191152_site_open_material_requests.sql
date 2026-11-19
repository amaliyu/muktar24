-- Picker for "Paid by payment request" on Material Receiving. Site staff can only read payment requests they raised
-- themselves, so this returns the site's open material/fuel requests (whoever raised them) with just what the picker needs.
create or replace function public.site_open_material_requests(p_site_id uuid)
returns table (id uuid, reference text, amount numeric, purpose text, payee_name text, status text, category text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_any_role(array['md','ico','accountant','store_officer','production_manager','assistant_production_manager']) then
    raise exception 'You do not have permission to view this.';
  end if;
  if not can_see_site(p_site_id) then raise exception 'You do not have access to that site.'; end if;
  return query
    select p.id, p.reference, p.amount, p.purpose, coalesce(s.company_name, p.payee_name), p.status::text, c.name, p.created_at
      from payment_requests p
      join expense_categories c on c.id = p.expense_category_id and c.closure_mechanism = 'stock_movements'
      left join suppliers s on s.id = p.supplier_id
     where p.site_id = p_site_id and p.status in ('md_approved','funded','disbursed')
     order by p.created_at desc;
end $$;
revoke all on function public.site_open_material_requests(uuid) from public, anon;
grant execute on function public.site_open_material_requests(uuid) to authenticated;
