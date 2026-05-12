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
}
