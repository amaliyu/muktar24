import { supabase } from '../lib/supabase'

export const ordersService = {
  async getAll() {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        customer:customer_id(*),
        marketer:marketer_id(id, full_name),
        order_items(*),
        invoices(id, invoice_number, total_amount, issued_date, due_date, payments(id, amount_paid, payment_date, status))
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
        customer:customer_id(id, name, company_name, location, phone),
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

  async delete(id) {
    const { data: invoices } = await supabase.from('invoices').select('id').eq('order_id', id)
    if (invoices?.length) {
      await supabase.from('payments').delete().in('invoice_id', invoices.map(i => i.id))
      await supabase.from('invoices').delete().eq('order_id', id)
    }
    const { error } = await supabase.from('orders').delete().eq('id', id)
    if (error) throw error
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

  async getAllWithStats() {
    const { data, error } = await supabase
      .from('customers')
      .select(`
        *,
        marketer:added_by(id, full_name),
        orders(
          id, status, created_at,
          order_items(quantity, unit_price, subtotal),
          invoices(id, payments(amount_paid, status))
        )
      `)
      .order('created_at', { ascending: false })
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

  async update(id, updates) {
    const { data, error } = await supabase
      .from('customers')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getStatement(customerId) {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id, created_at,
        order_items(block_type, quantity, unit_price, subtotal),
        invoices(
          id, invoice_number, total_amount, issued_date,
          payments(id, amount_paid, payment_date, status)
        )
      `)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return data || []
  },
}
