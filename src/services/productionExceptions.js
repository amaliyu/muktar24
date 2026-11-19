import { supabase } from '../lib/supabase'

async function read(query) {
  const { data, error } = await query
  if (error) throw error
  return data
}

export const productionExceptionsService = {
  list({ siteId, statuses, date, oldest, limit } = {}) {
    let query = supabase.from('production_exceptions').select('*')
    if (siteId) query = query.eq('site_id', siteId)
    if (statuses) query = query.in('status', statuses)
    if (date) query = query.eq('date', date)
    query = query.order('date', { ascending: Boolean(oldest) }).order('created_at', { ascending: Boolean(oldest) })
    if (limit) query = query.limit(limit)
    return read(query)
  },
  async count(status, siteId) {
    let query = supabase.from('production_exceptions').select('id', { count: 'exact', head: true }).eq('status', status)
    if (siteId) query = query.eq('site_id', siteId)
    const { count, error } = await query
    if (error) throw error
    return count
  },
  get: id => read(supabase.from('production_exceptions').select('*').eq('id', id).maybeSingle()),
  comments: id => read(supabase.from('production_exception_comments').select('*').eq('exception_id', id).order('created_at')),
  budget: id => read(supabase.rpc('client_requisition_budget', { p_requisition_id: id })),
  getSettings: id => read(supabase.from('production_sites').select('variance_tolerance_pct').eq('id', id).maybeSingle()),
  respond: (id, action, message) => read(supabase.rpc('respond_production_exception', {
    p_id: id, p_action: action, p_text: message,
  })),
  saveSettings: async (id, fields) => {
    const data = await read(supabase.from('production_sites').update(fields).eq('id', id).select('id').maybeSingle())
    if (!data) throw new Error('Site settings were not saved.')
  },
}
