import { supabase } from '../lib/supabase'

export const productionService = {
  async getAll({ from, to } = {}) {
    let query = supabase
      .from('production_log')
      .select('*, recorded_by_staff:staff(full_name)')
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
    if (error) throw error
    return data
  },

  async getDamages({ from, to } = {}) {
    let query = supabase
      .from('damage_log')
      .select('*, recorded_by_staff:staff(full_name)')
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
    if (error) throw error
    return data
  },

  async deleteEntry(id) {
    await supabase.from('damage_log').delete().eq('production_log_id', id)
    const { error } = await supabase.from('production_log').delete().eq('id', id)
    if (error) throw error
  },

  async update(id, data) {
    const { error } = await supabase.from('production_log').update(data).eq('id', id)
    if (error) throw error
  },

  async clearDamages(productionLogId) {
    const { error } = await supabase.from('damage_log').delete().eq('production_log_id', productionLogId)
    if (error) throw error
  },
}
