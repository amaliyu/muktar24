-- ChatGPT audit 6 (role access). Planning chat, 2026-10-29.
-- A6-2/A6-3: a marketer could read every invoice, invoice line, payment and customer
-- through the API. Marketers now see only records of their own orders/customers
-- (orders.marketer_id and customers.added_by both reference staff.id — same rule as
-- orders_select). No marketer login is active today, so nobody loses access now.
-- A6-4: board members could list all staff-document records; ICO (internal control)
-- keeps access.

create or replace function public.fn_my_staff_id()
returns uuid language sql stable security definer set search_path = public as $$
  select staff_id from user_profiles where id = auth.uid() and is_active = true
$$;
revoke all on function public.fn_my_staff_id() from public, anon;
grant execute on function public.fn_my_staff_id() to authenticated;

drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices for select to authenticated using (
  has_any_role(array['md','accountant','ico','board_member','bdm'])
  or (get_user_role() = 'marketer' and exists (
        select 1 from orders o where o.id = invoices.order_id and o.marketer_id = fn_my_staff_id())));

drop policy if exists invoice_items_select on public.invoice_items;
create policy invoice_items_select on public.invoice_items for select using (
  has_any_role(array['md','accountant','ico','board_member','bdm'])
  or (get_user_role() = 'marketer' and exists (
        select 1 from invoices i join orders o on o.id = i.order_id
        where i.id = invoice_items.invoice_id and o.marketer_id = fn_my_staff_id())));

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated using (
  has_any_role(array['md','accountant','ico','board_member','bdm'])
  or (get_user_role() = 'marketer' and exists (
        select 1 from invoices i join orders o on o.id = i.order_id
        where i.id = payments.invoice_id and o.marketer_id = fn_my_staff_id())));

drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers for select to authenticated using (
  has_any_role(array['md','board_member','ico','bdm','logistics_manager','store_officer','production_manager','assistant_production_manager','accountant'])
  or (get_user_role() = 'marketer' and (
        customers.added_by = fn_my_staff_id()
        or exists (select 1 from orders o where o.customer_id = customers.id and o.marketer_id = fn_my_staff_id()))));

drop policy if exists customer_sites_select on public.customer_sites;
create policy customer_sites_select on public.customer_sites for select to authenticated using (
  has_any_role(array['md','board_member','ico','bdm','logistics_manager','store_officer','accountant'])
  or (get_user_role() = 'marketer' and exists (
        select 1 from customers c where c.id = customer_sites.customer_id and (
          c.added_by = fn_my_staff_id()
          or exists (select 1 from orders o where o.customer_id = c.id and o.marketer_id = fn_my_staff_id())))));

drop policy if exists staff_documents_select on public.staff_documents;
create policy staff_documents_select on public.staff_documents for select to authenticated using (
  has_any_role(array['md','hr_officer','ico'])
  or exists (select 1 from user_profiles up where up.id = auth.uid() and up.staff_id = staff_documents.staff_id));
