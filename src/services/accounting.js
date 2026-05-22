import { supabase } from '../lib/supabase'

export const expenseCategoriesService = {
  async getAll() {
    const { data, error } = await supabase
      .from('expense_categories')
      .select('*')
      .order('parent_category', { ascending: true })
      .order('name', { ascending: true })
    if (error) throw error
    return data || []
  },

  async getActive() {
    const { data, error } = await supabase
      .from('expense_categories')
      .select('*')
      .eq('is_active', true)
      .order('parent_category', { ascending: true })
      .order('name', { ascending: true })
    if (error) throw error
    return data || []
  },

  async create(name, parentCategory) {
    const { data, error } = await supabase
      .from('expense_categories')
      .insert({ name: name.trim(), parent_category: parentCategory?.trim() || null, is_active: true })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async setActive(id, isActive) {
    const { error } = await supabase
      .from('expense_categories')
      .update({ is_active: isActive })
      .eq('id', id)
    if (error) throw error
  },

  async delete(id) {
    const { error } = await supabase
      .from('expense_categories')
      .delete()
      .eq('id', id)
    if (error) throw error
  },
}

export const expensesService = {
  async getAll(from, to) {
    let q = supabase
      .from('expenses')
      .select('*, category:category_id(name, parent_category)')
      .order('expense_date', { ascending: false })
    if (from) q = q.gte('expense_date', from)
    if (to) q = q.lte('expense_date', to)
    const { data, error } = await q
    if (error) throw error
    return data || []
  },

  async getPending() {
    const { data, error } = await supabase
      .from('expenses')
      .select('*, category:category_id(name, parent_category)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async create(expense) {
    const { data, error } = await supabase
      .from('expenses')
      .insert(expense)
      .select('*, category:category_id(name, parent_category)')
      .single()
    if (error) throw error
    return data
  },

  async updateStatus(id, status, approvedBy) {
    const { error } = await supabase
      .from('expenses')
      .update({ status, approved_by: approvedBy })
      .eq('id', id)
    if (error) throw error
  },

  async update(id, updates) {
    const { error } = await supabase.from('expenses').update(updates).eq('id', id)
    if (error) throw error
  },

  async delete(id) {
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) throw error
  },

  async getVehicleMaintenanceCategoryId() {
    const { data } = await supabase
      .from('expense_categories')
      .select('id')
      .ilike('name', 'vehicle maintenance')
      .limit(1)
    return data?.[0]?.id || null
  },
}

export const incomeRecordsService = {
  async getAll(from, to) {
    let q = supabase
      .from('income_records')
      .select('*')
      .order('record_date', { ascending: false })
    if (from) q = q.gte('record_date', from)
    if (to) q = q.lte('record_date', to)
    const { data, error } = await q
    if (error) throw error
    return data || []
  },

  async create(record) {
    const { data, error } = await supabase
      .from('income_records')
      .insert(record)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async delete(id) {
    const { error } = await supabase.from('income_records').delete().eq('id', id)
    if (error) throw error
  },
}

export const accountingService = {
  async getConfirmedPayments(from, to) {
    let q = supabase
      .from('payments')
      .select('id, amount_paid, payment_date, invoice:invoice_id(invoice_number, total_amount, order:order_id(customer:customer_id(name, location, phone)))')
      .eq('status', 'confirmed')
      .order('payment_date', { ascending: false })
    if (from) q = q.gte('payment_date', from)
    if (to) q = q.lte('payment_date', to)
    const { data, error } = await q
    if (error) throw error
    return data || []
  },

  async getReceivables() {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id, created_at, status,
        customer:customer_id(name),
        invoices(id, invoice_number, total_amount, issued_date,
          payments(amount_paid, status)
        )
      `)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async getOpenInvoices() {
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, total_amount, issued_date, order:order_id(id, customer:customer_id(id, name, company_name)), payments(id, amount_paid, payment_date, status)')
      .order('issued_date', { ascending: false })
    if (error) throw error
    return data || []
  },

  async getProductionTotals(from, to) {
    let q = supabase
      .from('production_log')
      .select('block_type, quantity_produced, date')
    if (from) q = q.gte('date', from)
    if (to) q = q.lte('date', to)
    const { data, error } = await q
    if (error) throw error
    return data || []
  },
}
