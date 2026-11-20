import { supabase } from '../lib/supabase'

async function result(query) {
  const { data, error } = await query
  if (error) throw error
  return data
}

const countFields = 'id, site_id, count_date, is_opening, status, notes, counted_by_name, created_at, reviewed_by_name, reviewed_at, review_note, lines:stock_count_lines(id, item_id, counted_qty, system_qty, variance_qty, variance_pct, unit_cost, variance_value, over_tolerance, note, item:item_id(name, unit, material, owner))'

export const stockCounts = {
  sheet: siteId => result(supabase.rpc('stock_count_sheet', { p_site_id: siteId })),
  submit: (siteId, date, lines, notes, opening, lateReason) => result(supabase.rpc('submit_stock_count', {
    p_site_id: siteId, p_count_date: date, p_lines: lines, p_notes: notes || null,
    p_is_opening: opening, ...(lateReason ? { p_late_reason: lateReason } : {}),
  })),
  review: (id, action, note) => result(supabase.rpc('review_stock_count', {
    p_count_id: id, p_action: action, p_note: note || null,
  })),
  list: (siteId, limit = 20) => result(supabase.from('stock_counts').select(countFields)
    .eq('site_id', siteId).order('count_date', { ascending: false }).order('created_at', { ascending: false }).limit(limit)),
  get: id => result(supabase.from('stock_counts').select(countFields).eq('id', id).maybeSingle()),
  sitesWithItems: () => result(supabase.from('production_sites').select('id, name, items:inventory_items!inner(id)').order('name')),
  activeSites: () => result(supabase.from('production_sites').select('id, name').not('day_status_from', 'is', null).order('name')),
  thisWeek: (from, to) => result(supabase.from('stock_counts').select('site_id')
    .neq('status', 'rejected').gte('count_date', from).lte('count_date', to)),
  async waitingCount() {
    const { count, error } = await supabase.from('stock_counts').select('id', { count: 'exact', head: true }).eq('status', 'submitted')
    if (error) throw error
    return count || 0
  },
}
