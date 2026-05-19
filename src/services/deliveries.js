import { supabase } from '../lib/supabase'

export const deliveriesService = {
  async getAll() {
    const { data, error } = await supabase
      .from('deliveries')
      .select(`
        *,
        order:order_id(id, customer:customer_id(name)),
        driver:driver_id(id, full_name),
        waybills(*)
      `)
      .order('delivery_date', { ascending: false })
    if (error) throw error
    return data
  },

  async create(delivery) {
    const { data, error } = await supabase
      .from('deliveries')
      .insert(delivery)
      .select()
      .single()
    if (error) throw error
    return data
  },
}

export const waybillsService = {
  async getAll() {
    const { data, error } = await supabase
      .from('waybills')
      .select(`
        *,
        driver:driver_id(id, full_name)
      `)
      .order('waybill_date', { ascending: false })
    if (error) throw error
    return data
  },

  async create(waybill) {
    const { data, error } = await supabase
      .from('waybills')
      .insert(waybill)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getCount() {
    const { count, error } = await supabase
      .from('waybills')
      .select('*', { count: 'exact', head: true })
    if (error) throw error
    return count || 0
  },

  async delete(id) {
    const { error } = await supabase.from('waybills').delete().eq('id', id)
    if (error) throw error
  },
}
