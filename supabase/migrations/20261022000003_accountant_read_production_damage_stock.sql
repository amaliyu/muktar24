-- ALREADY APPLIED to the live DB by the planning chat on 2026-10-22, verified. Kept here as the tracked record. DO NOT RE-RUN.
-- MD decision 2026-10-22: accountant gets READ-ONLY access to production, damage and stock movements
-- (weekly internal site report, margins, and the later WAC/cost-per-1,000 work). Write policies unchanged.
alter policy production_log_select on public.production_log
  using (has_any_role(array['md','board_member','ico','accountant','production_manager','assistant_production_manager','store_officer','logistics_manager']));
alter policy damage_log_select on public.damage_log
  using (has_any_role(array['md','board_member','ico','accountant','production_manager','assistant_production_manager','store_officer','logistics_manager']));
alter policy stock_movements_select on public.stock_movements
  using (has_any_role(array['md','board_member','ico','accountant','production_manager','assistant_production_manager','store_officer','logistics_manager']));
