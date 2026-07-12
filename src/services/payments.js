import { supabase } from '../lib/supabase'

export const paymentsService = {
  async getByInvoice(invoiceId) {
    const { data, error } = await supabase
      .from('payments')
      .select('*, confirmed_by_staff:staff(full_name)')
      .eq('invoice_id', invoiceId)
      .order('payment_date', { ascending: false })
    if (error) throw error
    return data || []
  },

  async recordPayment(payment) {
    const { data, error } = await supabase
      .from('payments')
      .insert(payment)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async confirm(id, confirmedBy) {
    const { data, error } = await supabase
      .from('payments')
      .update({ status: 'confirmed', confirmed_by: confirmedBy })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deletePayment(id) {
    const { error } = await supabase.from('payments').delete().eq('id', id)
    if (error) throw error
  },

  async updatePayment(id, data) {
    const { error } = await supabase.from('payments').update(data).eq('id', id)
    if (error) throw error
  },
}

export const invoicesService = {
  async getNextNumber() {
    const year = new Date().getFullYear();
    const prefix = `APC-INV-${year}-`;
    const { data, error } = await supabase
      .from('invoices')
      .select('invoice_number')
      .like('invoice_number', `${prefix}%`);
    if (error) throw error;
    const maxN = (data || []).reduce((m, row) => {
      const n = parseInt(row.invoice_number?.match(/(\d+)$/)?.[1] ?? '0', 10);
      return Math.max(m, n);
    }, 0);
    // 4-digit suffix — above both existing series (max is 2361), consistent going forward
    return `${prefix}${String(maxN + 1).padStart(4, '0')}`;
  },

  async create(invoice) {
    const { data, error } = await supabase
      .from('invoices')
      .insert(invoice)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(id, data) {
    const { error } = await supabase.from('invoices').update(data).eq('id', id)
    if (error) throw error
  },

  async getByOrder(orderId) {
    const { data, error } = await supabase
      .from('invoices')
      .select('*, payments(*)')
      .eq('order_id', orderId)
    if (error) throw error
    return data || []
  },

  async delete(id) {
    const { error } = await supabase.from('invoices').delete().eq('id', id)
    if (error) throw error
  },
}
