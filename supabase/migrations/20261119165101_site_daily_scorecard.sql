-- Applied to production 2026-11-19 by the planning chat (recorded here afterwards). MD approved 2026-11-19 (scorecard step B).
-- Verified: Kado 18 Nov = 1,095 blocks, 42.1 per bag, 20.1 L per 1,000, materials ₦706 per block vs ₦791.29; Umar refused for Life Camp.

-- Step B (scorecard), part 2: one day's figures for a site against its budget, for the site manager's self-check
-- and the WhatsApp report. Quantities from production_log / damage_log, costs from the costed consumption movements
-- (APCL-owned materials only), labour from the site's daily roster.

alter table public.production_sites add column if not exists material_cost_budget_per_block numeric;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'production_sites_material_budget_positive') then
    alter table public.production_sites add constraint production_sites_material_budget_positive
      check (material_cost_budget_per_block is null or material_cost_budget_per_block > 0);
  end if;
end $$;
comment on column public.production_sites.material_cost_budget_per_block is 'Budgeted materials cost per block (₦), APCL-funded sites only. Kado: ₦791.29 from the Sequoia costing.';
update public.production_sites set material_cost_budget_per_block = 791.29 where code = 'KADO-SEQ' and material_cost_budget_per_block is null;

create or replace function public.site_daily_scorecard(p_site_id uuid, p_date date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  s production_sites%rowtype; v jsonb;
  b9 numeric; b6 numeric; bt numeric; cem numeric; dsl numeric; dust numeric; chip numeric;
  bud_bags numeric; bud_dsl numeric; dmg numeric;
  c_cem numeric; c_dust numeric; c_chip numeric; c_dsl numeric; c_mat numeric; uncosted int;
  lab_cost numeric; lab_workers int; rosters int;
begin
  if not can_see_site(p_site_id) then raise exception 'Not allowed for this site.' using errcode = '42501'; end if;
  select * into s from production_sites where id = p_site_id;
  if not found then raise exception 'Site not found.'; end if;

  select coalesce(sum(pl.quantity_produced) filter (where pl.block_type ilike '9%'), 0),
         coalesce(sum(pl.quantity_produced) filter (where pl.block_type ilike '6%'), 0),
         coalesce(sum(pl.quantity_produced), 0),
         coalesce(sum(pl.cement_bags), 0), coalesce(sum(pl.diesel_litres), 0),
         coalesce(sum(pl.granite_dust_kg), 0), coalesce(sum(pl.chippings_kg), 0),
         case when bool_and(sb.blocks_per_bag is not null) then sum(pl.quantity_produced / sb.blocks_per_bag) end,
         case when bool_and(sb.diesel_l_per_1000 is not null) then sum(pl.quantity_produced * sb.diesel_l_per_1000 / 1000.0) end
    into b9, b6, bt, cem, dsl, dust, chip, bud_bags, bud_dsl
    from production_log pl
    left join site_block_standards sb on sb.site_id = pl.site_id and sb.block_type = pl.block_type
   where pl.site_id = p_site_id and pl.date = p_date;

  select coalesce(sum(quantity_damaged), 0) into dmg
    from damage_log where site_id = p_site_id and date = p_date and stage in ('production','stacking');

  select sum(sm.total_cost) filter (where i.material = 'cement'),
         sum(sm.total_cost) filter (where i.material = 'dust'),
         sum(sm.total_cost) filter (where i.material = 'chippings'),
         sum(sm.total_cost) filter (where i.material = 'diesel'),
         sum(sm.total_cost),
         count(*) filter (where sm.total_cost is null and i.owner = 'apcl')
    into c_cem, c_dust, c_chip, c_dsl, c_mat, uncosted
    from stock_movements sm join inventory_items i on i.id = sm.item_id
   where sm.site_id = p_site_id and sm.date = p_date and sm.movement_type = 'out' and sm.issued_to = 'Production';

  select sum(total_daily_cost), sum(worker_count), count(*) into lab_cost, lab_workers, rosters
    from daily_roster where site_id = p_site_id and roster_date = p_date;

  v := jsonb_build_object(
    'site_id', s.id, 'site_name', s.name, 'site_code', s.code, 'contract_model', s.contract_model, 'date', p_date,
    'blocks_9in', b9, 'blocks_6in', b6, 'blocks_total', bt,
    'cement', jsonb_build_object('bags', cem, 'budget_bags', round(bud_bags, 1),
        'blocks_per_bag', case when cem > 0 then round(bt / cem, 1) end,
        'budget_blocks_per_bag', case when bud_bags > 0 then round(bt / bud_bags, 1) end,
        'variance_pct', case when bud_bags > 0 then round((cem - bud_bags) / bud_bags * 100, 1) end),
    'diesel', jsonb_build_object('litres', dsl, 'budget_litres', round(bud_dsl, 1),
        'per_1000', case when bt > 0 then round(dsl / bt * 1000, 1) end,
        'budget_per_1000', case when bt > 0 and bud_dsl is not null then round(bud_dsl / bt * 1000, 1) end,
        'variance_pct', case when bud_dsl > 0 then round((dsl - bud_dsl) / bud_dsl * 100, 1) end),
    'dust_kg', dust, 'chippings_kg', chip,
    'breakage', jsonb_build_object('blocks', dmg, 'pct', case when bt > 0 then round(dmg * 100.0 / bt, 2) end,
        'allowed_pct', s.breakage_budget_pct),
    'tolerance_pct', s.variance_tolerance_pct,
    'costs', jsonb_build_object(
        'cement', c_cem, 'dust', c_dust, 'chippings', c_chip, 'diesel', c_dsl, 'materials', c_mat,
        'materials_per_block', case when bt > 0 and c_mat is not null then round(c_mat / bt, 2) end,
        'materials_budget_per_block', s.material_cost_budget_per_block,
        'uncosted_lines', coalesce(uncosted, 0),
        'labour', lab_cost, 'workers', lab_workers, 'roster_recorded', coalesce(rosters, 0) > 0,
        'labour_per_block', case when bt > 0 and lab_cost is not null then round(lab_cost / bt, 2) end,
        'total', case when c_mat is not null or lab_cost is not null then coalesce(c_mat, 0) + coalesce(lab_cost, 0) end,
        'total_per_block', case when bt > 0 and (c_mat is not null or lab_cost is not null)
                                then round((coalesce(c_mat, 0) + coalesce(lab_cost, 0)) / bt, 2) end),
    'open_warnings', (select count(*) from production_exceptions e where e.site_id = p_site_id and e.date = p_date and e.status = 'open'),
    'warning_lines', (select coalesce(jsonb_agg(jsonb_build_object('parameter', e.parameter, 'status', e.status, 'variance_pct', e.variance_pct,
                                                                   'actual_rate', e.actual_rate, 'budget_rate', e.budget_rate)
                                                order by array_position(array['cement','diesel','breakage'], e.parameter)), '[]'::jsonb)
                        from production_exceptions e where e.site_id = p_site_id and e.date = p_date)
  );
  return v;
end $$;
revoke all on function public.site_daily_scorecard(uuid, date) from public, anon;
grant execute on function public.site_daily_scorecard(uuid, date) to authenticated;
