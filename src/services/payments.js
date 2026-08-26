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

  // ── Line items (invoice_items) ──────────────────────────────────
  // The DB blocks writes to invoice_items unless the parent invoice is a
  // draft (invoice_items_guard). subtotal is GENERATED — never write it.
  async getItems(invoiceId) {
    const { data, error } = await supabase
      .from('invoice_items')
      .select('id, block_type, quantity, unit_price, subtotal, sort_order')
      .eq('invoice_id', invoiceId)
      .order('sort_order', { ascending: true })
    if (error) throw error
    return data || []
  },

  // Replace-all is safe because the DB blocks it for non-drafts anyway, but we
  // read the existing rows first and only rewrite when they've actually changed
  // to avoid pointless churn. `items` are the editor rows
  // ({ description|block_type, quantity, unit_price }).
  async saveItems(invoiceId, items) {
    const desired = (items || []).map((it, idx) => ({
      block_type: (it.block_type ?? it.description ?? '').trim(),
      quantity: Number(it.quantity) || 0,
      unit_price: Number(it.unit_price) || 0,
      sort_order: idx,
    }))
    const existing = await this.getItems(invoiceId)
    const norm = rows => rows.map(r => ({
      block_type: (r.block_type ?? '').trim(),
      quantity: Number(r.quantity) || 0,
      unit_price: Number(r.unit_price) || 0,
      sort_order: Number(r.sort_order) || 0,
    })).sort((a, b) => a.sort_order - b.sort_order)
    if (JSON.stringify(norm(existing)) === JSON.stringify(norm(desired))) return
    const { error: delErr } = await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId)
    if (delErr) throw delErr
    if (desired.length) {
      const { error: insErr } = await supabase
        .from('invoice_items')
        .insert(desired.map(d => ({ ...d, invoice_id: invoiceId })))
      if (insErr) throw insErr
    }
  },

  // ── Status transitions (always permitted by the DB) ─────────────
  // issued_at is auto-set by the content guard on draft→issued, so we only
  // write status here.
  async issue(id) {
    const { error } = await supabase.from('invoices').update({ status: 'issued' }).eq('id', id)
    if (error) throw error
  },

  // cancelled_at is NOT auto-set, so we record it along with who/why.
  async cancel(id, { cancelled_by_name, cancellation_reason }) {
    const { error } = await supabase.from('invoices').update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by_name: cancelled_by_name || null,
      cancellation_reason: cancellation_reason || null,
    }).eq('id', id)
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

export const orderPaymentsService = {
  async getByOrderInvoices(invoiceIds) {
    if (!invoiceIds?.length) return []
    const { data, error } = await supabase
      .from('payments')
      .select('id, invoice_id')
      .in('invoice_id', invoiceIds)
    if (error) throw error
    return data || []
  },
}
