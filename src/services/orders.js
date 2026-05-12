import { supabase } from '../lib/supabase'

export const ordersService = {
  async getAll() {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        customer:customer_id(id, name, location, phone),
        marketer:marketer_id(id, full_name),
        order_items(*),
        invoices(id, invoice_number, total_amount, issued_date, due_date, payments(id, amount_paid, status))
      `)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async getById(id) {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        customer:customer_id(id, name, location, phone),
        marketer:marketer_id(id, full_name),
        order_items(*),
        invoices(*, payments(*)),
        deliveries(*, waybills(*))
      `)
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  async create({ order, items }) {
    const { data: newOrder, error: orderErr } = await supabase
      .from('orders')
      .insert(order)
      .select()
      .single()
    if (orderErr) throw orderErr

    const itemsWithOrderId = items.map(i => ({ ...i, order_id: newOrder.id }))
    const { error: itemsErr } = await supabase
      .from('order_items')
      .insert(itemsWithOrderId)
    if (itemsErr) throw itemsErr

    return newOrder
  },

  async updateStatus(id, status) {
    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },
}

export const customersService = {
  async getAll() {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('name')
    if (error) throw error
    return data
  },

  async create(customer) {
    const { data, error } = await supabase
      .from('customers')
      .insert(customer)
      .select()
      .single()
    if (error) throw error
    return data
  },
}
