import { supabase } from '../lib/supabase'

export const deliveriesService = {
  async getAll() {
    const { data, error } = await supabase
      .from('deliveries')
      .select(`
        *,
        order:orders(id, customer:customers(name)),
        driver:staff(id, full_name),
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
        delivery:deliveries(id, destination, order:orders(customer:customers(name))),
        driver:staff(id, full_name),
        recorder:staff!waybills_recorded_by_fkey(full_name)
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
}
