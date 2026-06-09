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
    return data || []
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
  async getAll({ from, to } = {}) {
    let query = supabase
      .from('waybills')
      .select(`
        *,
        driver:driver_id(id, full_name),
        order:order_id(customer:customer_id(location))
      `)
      .order('waybill_date', { ascending: false })
    if (from) query = query.gte('waybill_date', from)
    if (to)   query = query.lte('waybill_date', to)
    const { data, error } = await query
    if (error) throw error
    return data || []
  },

  async getAllForDriver(staffId) {
    const { data, error } = await supabase
      .from('waybills')
      .select(`
        *,
        driver:driver_id(id, full_name),
        order:order_id(customer:customer_id(location))
      `)
      .eq('driver_id', staffId)
      .order('waybill_date', { ascending: false })
    if (error) throw error
    return data || []
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

  async getByReceiverName(name) {
    const { data, error } = await supabase
      .from('waybills')
      .select('*, driver:driver_id(id, full_name)')
      .eq('receiver_name', name)
      .order('waybill_date', { ascending: false })
    if (error) throw error
    return data || []
  },

  async getByOrder(orderId) {
    const { data, error } = await supabase
      .from('waybills')
      .select('quantity_received, block_type')
      .eq('order_id', orderId)
    if (error) throw error
    return data || []
  },

  async getNextNumber() {
    const { data, error } = await supabase
      .from('waybills')
      .select('waybill_number')
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) throw error
    if (!data || data.length === 0) return 1
    const match = data[0].waybill_number?.match(/(\d+)$/)
    return match ? parseInt(match[1], 10) + 1 : 1
  },

  async delete(id) {
    const { error } = await supabase.from('waybills').delete().eq('id', id)
    if (error) throw error
  },

  async update(id, data) {
    const { error } = await supabase.from('waybills').update(data).eq('id', id)
    if (error) throw error
  },
}
