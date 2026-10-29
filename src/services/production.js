import { supabase } from '../lib/supabase'
import { deleteById, deleteWhere } from '../utils/checkedDelete'
import { checkedWrite } from '../utils/checkedWrite'

export const productionService = {
  async getAll({ from, to } = {}) {
    let query = supabase
      .from('production_log')
      .select('*, recorded_by_staff:staff(full_name), machine:asset_id(code, name)')
      .order('date', { ascending: false })

    if (from) query = query.gte('date', from)
    if (to)   query = query.lte('date', to)

    const { data, error } = await query
    if (error) throw error
    return data
  },

  async create(entry) {
    const { data, error } = await supabase
      .from('production_log')
      .insert(entry)
      .select()
      .single()
    checkedWrite({ data, error })
    return data
  },

  async getDamages({ from, to } = {}) {
    let query = supabase
      .from('damage_log')
      .select('*')
      .order('date', { ascending: false })

    if (from) query = query.gte('date', from)
    if (to)   query = query.lte('date', to)

    const { data, error } = await query
    if (error) throw error
    return data
  },

  async logDamage(entry) {
    const { data, error } = await supabase
      .from('damage_log')
      .insert(entry)
      .select()
      .single()
    checkedWrite({ data, error })
    return data
  },

  async deleteEntry(id) {
    // Damage has a restrictive FK; stop if its checked cleanup fails. The
    // database reverses production movements only when the parent is deleted.
    await deleteWhere(supabase, 'damage_log', 'production_log_id', id)
    await deleteWhere(supabase, 'batch_production_links', 'production_log_id', id)
    return deleteById(supabase, 'production_log', id)
  },

  async deleteTransitDamage(waybillNumber) {
    const { data, error } = await supabase.from('damage_log').select('id')
      .eq('stage', 'delivery').ilike('notes', `%${waybillNumber}%`)
    if (error) throw error
    for (const row of data || []) await deleteById(supabase, 'damage_log', row.id)
  },

  async update(id, data, userId) {
    // Stamp the audit trail on every update: who edited and when.
    const { data: saved, error } = await supabase.from('production_log').update({
      ...data,
      updated_at: new Date().toISOString(),
      updated_by: userId || null,
    }).eq('id', id).select('id')
    checkedWrite({ data: saved, error })
  },

  async clearDamages(productionLogId) {
    return deleteWhere(supabase, 'damage_log', 'production_log_id', productionLogId)
  },
}
