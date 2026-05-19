import { supabase } from '../lib/supabase'

export const paymentsService = {
  async getByInvoice(invoiceId) {
    const { data, error } = await supabase
      .from('payments')
      .select('*, confirmed_by_staff:staff(full_name)')
      .eq('invoice_id', invoiceId)
      .order('payment_date', { ascending: false })
    if (error) throw error
    return data
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
}

export const invoicesService = {
  async create(invoice) {
    const { data, error } = await supabase
      .from('invoices')
      .insert(invoice)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getByOrder(orderId) {
    const { data, error } = await supabase
      .from('invoices')
      .select('*, payments(*)')
      .eq('order_id', orderId)
    if (error) throw error
    return data
  },
}
