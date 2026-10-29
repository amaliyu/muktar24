import { requireUpdatedRow } from '../utils/proforma'
import { deleteById, deleteWhere } from '../utils/checkedDelete'
import { supabase } from '../lib/supabase'

export const ordersService = {
  async getCashReceived({ from, to } = {}) {
    let q = supabase.from('payments').select('amount_paid, payment_date')
      .eq('status', 'confirmed')
    if (from) q = q.gte('payment_date', from)
    if (to) q = q.lte('payment_date', to)
    const { data, error } = await q
    if (error) throw error
    return (data || []).reduce((n, p) => n + Number(p.amount_paid || 0), 0)
  },
  async getAll({ from, to } = {}) {
    let query = supabase
      .from('orders')
      .select(`
        *,
        customer:customer_id(*),
        marketer:marketer_id(id, full_name),
        site:site_id(id, site_name, site_address),
        order_items(*),
        invoices(id, invoice_number, total_amount, issued_date, issued_at, due_date, status, delivery_cost, discount, include_vat, created_by_name, cancellation_reason, cancelled_by_name, payments(id, amount_paid, payment_date, status))
      `)
      .order('created_at', { ascending: false })
    if (from) query = query.gte('created_at', from)
    if (to)   query = query.lte('created_at', to + 'T23:59:59')
    const { data, error } = await query
    if (error) throw error
    return data || []
  },

  async getAllForMarketer(staffId) {
    if (!staffId) throw new Error('Your login is not linked to a staff record — ask HR')
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        customer:customer_id(*),
        marketer:marketer_id(id, full_name),
        site:site_id(id, site_name, site_address),
        order_items(*),
        invoices(id, invoice_number, total_amount, issued_date, issued_at, due_date, status, delivery_cost, discount, include_vat, created_by_name, cancellation_reason, cancelled_by_name, payments(id, amount_paid, payment_date, status))
      `)
      .eq('marketer_id', staffId)
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
        waybills(*)
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
    // Replace lines first: an RPC refusal must not write the marketer either.
    const { data, error } = await supabase.rpc('replace_order_items', {
      p_order_id: id,
      p_items: items.map(({ block_type, quantity, unit_price, source_type, cost_basis }) => ({
        block_type, quantity, unit_price, source_type: source_type || 'manufactured', cost_basis: cost_basis ?? null,
      })),
    })
    if (error) throw error
    if (data !== items.length) throw new Error('Order lines were not fully replaced. Reload the order before continuing.')
    requireUpdatedRow(await supabase.from('orders').update({ marketer_id: marketerId || null })
      .eq('id', id).select('id'), 'Order lines were replaced, but the marketer was not updated. You may not have permission.')
  },

  async delete(id) {
    const { data: invoices, error: invoiceError } = await supabase.from('invoices').select('id').eq('order_id', id)
    if (invoiceError) throw invoiceError
    if (invoices?.length) {
      const invoiceIds = invoices.map(i => i.id)
      const { data: pmts, error: paymentError } = await supabase.from('payments').select('id').in('invoice_id', invoiceIds)
      if (paymentError) throw paymentError
      if (pmts?.length) {
        const err = new Error(`${pmts.length} payment(s) exist against this order's invoices and must be removed first.`)
        err.code = 'PAYMENTS_EXIST'
        throw err
      }
      await deleteWhere(supabase, 'invoices', 'order_id', id)
    }
    return deleteById(supabase, 'orders', id)
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

  async getAllForMarketer(staffId) {
    if (!staffId) throw new Error('Your login is not linked to a staff record — ask HR')
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('added_by', staffId)
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
          invoices(id, total_amount, status, payments(amount_paid, status))
        )
      `)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async getAllWithStatsForMarketer(staffId) {
    if (!staffId) throw new Error('Your login is not linked to a staff record — ask HR')
    const { data, error } = await supabase
      .from('customers')
      .select(`
        *,
        marketer:added_by(id, full_name),
        orders(
          id, status, created_at, site_id,
          order_items(quantity, unit_price, subtotal),
          invoices(id, total_amount, status, payments(amount_paid, status))
        )
      `)
      .eq('added_by', staffId)
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
          id, invoice_number, total_amount, issued_date, status,
          payments(id, amount_paid, payment_date, status)
        )
      `)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true });
    if (siteId) q = q.eq('site_id', siteId);
    const { data: orders, error } = await q;
    if (error) throw error;

    const { data: cust, error: customerError } = await supabase
      .from('customers').select('name').eq('id', customerId).single();
    if (customerError) throw customerError;

    let waybills = [];
    if (cust?.name) {
      const { data: wbs, error: waybillError } = await supabase
        .from('waybills')
        .select('*')
        .eq('receiver_name', cust.name)
        .order('waybill_date', { ascending: true });
      if (waybillError) throw waybillError;
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
