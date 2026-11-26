import { supabase } from '../lib/supabase'

async function read(query) {
  const { data, error } = await query
  if (error) throw error
  return data
}

async function readPages(query) {
  const result = []
  const size = 500
  for (let offset = 0; ; offset += size) {
    const rows = await read(query().range(offset, offset + size - 1))
    result.push(...rows)
    if (rows.length < size) return result
  }
}

export const productionExceptionsService = {
  async list({ siteId, statuses, date, since } = {}) {
    return readPages(() => {
      let query = supabase.from('production_exceptions').select('*')
      if (siteId) query = query.eq('site_id', siteId)
      if (statuses) query = query.in('status', statuses)
      if (date) query = query.eq('date', date)
      if (since) query = query.gte('date', since)
      return query.order('date', { ascending: false }).order('id')
    })
  },
  get: id => read(supabase.from('production_exceptions').select('*').eq('id', id).maybeSingle()),
  comments: ids => readPages(() => supabase.from('production_exception_comments').select('*')
    .in('exception_id', ids).order('created_at').order('id')),
  budget: id => read(supabase.rpc('client_requisition_budget', { p_requisition_id: id })),
  getSettings: id => read(supabase.from('production_sites').select('variance_tolerance_pct, cement_under_tolerance_pct, warn_min_cement_bags, warn_min_diesel_l, warn_min_breakage_blocks, production_breakage_pct, stacking_breakage_pct, loading_breakage_pct, offloading_breakage_pct, material_cost_budget_per_block').eq('id', id).maybeSingle()),
  closeExplained: (siteId, note) => read(supabase.rpc('close_explained_exceptions', { p_site_id: siteId || null, p_note: note || null })),
  respond: (id, action, message) => read(supabase.rpc('respond_production_exception', {
    p_id: id, p_action: action, p_text: message,
  })),
  saveSettings: async (id, fields) => {
    const data = await read(supabase.from('production_sites').update(fields).eq('id', id).select('id').maybeSingle())
    if (!data) throw new Error('Site settings were not saved.')
  },
}
