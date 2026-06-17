import { supabase } from '../lib/supabase'

export const ordersService = {
  async getAll({ from, to } = {}) {
    let query = supabase
      .from('orders')
      .select(`
        *,
        customer:customer_id(*),
        marketer:marketer_id(id, full_name),
        site:site_id(id, site_name, site_address),
        order_items(*),
        invoices(id, invoice_number, total_amount, issued_date, due_date, payments(id, amount_paid, payment_date, status))
      `)
      .order('created_at', { ascending: false })
    if (from) query = query.gte('created_at', from)
    if (to)   query = query.lte('created_at', to + 'T23:59:59')
    const { data, error } = await query
    if (error) throw error
    return data || []
  },

  async getAllForMarketer(userId) {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        customer:customer_id(*),
        marketer:marketer_id(id, full_name),
        site:site_id(id, site_name, site_address),
        order_items(*),
        invoices(id, invoice_number, total_amount, issued_date, due_date, payments(id, amount_paid, payment_date, status))
      `)
      .eq('marketer_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
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

  async getForDelivery({ from, to } = {}) {
    let query = supabase
      .from('orders')
      .select(`
        *,
        customer:customer_id(*),
        marketer:marketer_id(id, full_name),
        site:site_id(id, site_name, site_address),
        order_items_delivery(id, order_id, block_type, quantity, created_at),
        invoices(id, invoice_number, issued_date, due_date)
      `)
      .order('created_at', { ascending: false })
    if (from) query = query.gte('created_at', from)
    if (to)   query = query.lte('created_at', to + 'T23:59:59')
    const { data, error } = await query
    if (error) throw error
    return data || []
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

  async updateOrder(id, { marketerId, items }) {
    const { error: e1 } = await supabase.from('orders').update({ marketer_id: marketerId || null }).eq('id', id)
    if (e1) throw e1
    const { error: e2 } = await supabase.from('order_items').delete().eq('order_id', id)
    if (e2) throw e2
    const { error } = await supabase.from('order_items').insert(items.map(i => ({ ...i, order_id: id })))
    if (error) throw error
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
    return data || []
  },

  async getAllForMarketer(userId) {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('added_by', userId)
      .order('name')
    if (error) throw error
    return data || []
  },

  async getAllWithStats() {
    const { data, error } = await supabase
      .from('customers')
      .select(`
        *,
        marketer:added_by(id, full_name),
        orders(
          id, status, created_at, site_id,
          order_items(quantity, unit_price, subtotal),
          invoices(id, total_amount, payments(amount_paid, status))
        )
      `)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async getAllWithStatsForMarketer(userId) {
    const { data, error } = await supabase
      .from('customers')
      .select(`
        *,
        marketer:added_by(id, full_name),
        orders(
          id, status, created_at, site_id,
          order_items(quantity, unit_price, subtotal),
          invoices(id, total_amount, payments(amount_paid, status))
        )
      `)
      .eq('added_by', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async delete(id) {
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (error) throw error
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

  async getStatement(customerId, siteId = null) {
    let q = supabase
      .from('orders')
      .select(`
        id, created_at, site_id,
        order_items(block_type, quantity, unit_price, subtotal),
        invoices(
          id, invoice_number, total_amount, issued_date,
          payments(id, amount_paid, payment_date, status)
        )
      `)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true });
    if (siteId) q = q.eq('site_id', siteId);
    const { data: orders, error } = await q;
    if (error) throw error;

    const { data: cust } = await supabase
      .from('customers').select('name').eq('id', customerId).single();

    let waybills = [];
    if (cust?.name) {
      const { data: wbs } = await supabase
        .from('waybills')
        .select('*')
        .eq('receiver_name', cust.name)
        .order('waybill_date', { ascending: true });
      waybills = wbs || [];
    }

    return { orders: orders || [], waybills };
  },
}

export const customerSitesService = {
  async getByCustomer(customerId) {
    const { data, error } = await supabase
      .from('customer_sites')
      .select('*')
      .eq('customer_id', customerId)
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },
  async create(site) {
    const { data, error } = await supabase
      .from('customer_sites')
      .insert(site)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async update(id, updates) {
    const { error } = await supabase
      .from('customer_sites')
      .update(updates)
      .eq('id', id);
    if (error) throw error;
  },
};
