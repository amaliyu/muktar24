import { supabase } from '../lib/supabase'
import { siteContractsService } from './siteContracts'

// Phase 7B-2 — data for the weekly site report. Each leg throws its error
// (Rule 10.5): a failed fetch is shown to the user, never drawn as an empty
// week. Columns verified against the live schema on 2026-10-22 (Rule 11):
// production_log / damage_log / stock_movements use `date`, expenses use
// `expense_date`, block_handovers `handover_date`, material_receipts `received_on`.

const must = ({ data, error }) => {
  if (error) throw error
  return data
}

export async function fetchWeeklyReportData({ contract, week, internal = false }) {
  const siteId = contract.site_id
  const [cycles, forecasts, production, damages, handovers, receipts, items, movements, expenses] = await Promise.all([
    siteContractsService.listCycles([contract.id]),
    siteContractsService.listForecasts().then(rows => rows.filter(f => f.contract_id === contract.id)),
    supabase.from('production_log').select('id, site_id, asset_id, date, block_type, quantity_produced, cement_bags, granite_dust_kg, chippings_kg, diesel_litres')
      .eq('site_id', siteId).gte('date', week.from).lte('date', week.to).order('date').then(must),
    supabase.from('damage_log').select('id, site_id, date, stage, block_type, quantity_damaged')
      .eq('site_id', siteId).gte('date', week.from).lte('date', week.to).then(must),
    // Up to week end, not just the week: the advance balance needs fees to date.
    supabase.from('block_handovers').select('id, site_id, cycle_id, handover_date, block_type, qty_handed_over, qty_accepted, qty_rejected, rejection_reason, deemed, status')
      .eq('site_id', siteId).lte('handover_date', week.to).order('handover_date').then(must),
    supabase.from('material_receipts').select('id, site_id, item_id, received_on, qty_delivered, qty_accepted, qty_rejected, rejection_reason, voided')
      .eq('site_id', siteId).gte('received_on', week.from).lte('received_on', week.to).order('received_on').then(must),
    siteContractsService.listSiteItems(siteId),
    // From week start onward: the week's usage, plus later movements to wind
    // current stock back to the week-end balance.
    supabase.from('stock_movements').select('id, item_id, site_id, movement_type, quantity, reference, date')
      .eq('site_id', siteId).gte('date', week.from).then(must),
    internal
      ? supabase.from('expenses').select('id, site_id, expense_date, amount, ingestion_source, category:category_id(name)')
        .eq('site_id', siteId).gte('expense_date', week.from).lte('expense_date', week.to).then(must)
      : Promise.resolve([]),
  ])
  return { cycles, forecasts, production, damages, handovers, receipts, items, movements, expenses }
}
