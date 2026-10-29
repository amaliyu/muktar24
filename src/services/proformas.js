import { supabase } from '../lib/supabase'
import { hasRole } from '../lib/roles'
import { canCancelProformaOrder, requireUpdatedRow } from '../utils/proforma'

// Columns and policies verified against live catalog on 2026-10-25.
// No transaction RPC exists for this flow: report partial completion explicitly.
export async function closeProforma(invoiceId, orderId, profile, reason = '') {
  requireUpdatedRow(await supabase.from('invoices').update({
    status: 'cancelled', cancelled_at: new Date().toISOString(),
    cancelled_by_name: profile?.full_name || null,
    cancellation_reason: reason.trim() || null,
  }).eq('id', invoiceId).eq('order_id', orderId).eq('status', 'draft').select('id'),
  'Proforma was not closed. It may no longer be a draft, or your role cannot update it.')

  try {
    const { data: invoices, error } = await supabase.from('invoices')
      .select('id, status, payments(id)').eq('order_id', orderId)
    if (error) throw error
    if (!invoices?.some(i => i.id === invoiceId && i.status === 'cancelled')) {
      throw new Error('Could not verify the closed proforma on the order.')
    }
    const paymentCount = invoices.reduce((n, i) => n + (i.payments?.length || 0), 0)
    if (!canCancelProformaOrder(invoices, paymentCount, 0)) return { orderCancelled: false }

    // A BDM without another qualifying role cannot SELECT waybills. RLS-hidden
    // rows must never be interpreted as proof that no deliveries exist.
    if (!hasRole(profile, 'md', 'accountant', 'board_member', 'ico', 'logistics_manager',
      'store_officer', 'driver', 'production_manager', 'assistant_production_manager')) {
      throw new Error('Your role cannot verify waybills. Ask MD or Accountant to check and close the order.')
    }
    const { count, error: waybillError } = await supabase.from('waybills')
      .select('id', { count: 'exact', head: true }).eq('order_id', orderId)
    if (waybillError) throw waybillError
    if (count == null) throw new Error('Could not verify whether the order has waybills.')
    if (!canCancelProformaOrder(invoices, paymentCount, count)) return { orderCancelled: false }

    requireUpdatedRow(await supabase.from('orders').update({ status: 'cancelled' })
      .eq('id', orderId).select('id'),
    'Order was not cancelled. Your role may not be allowed to update it.')
    return { orderCancelled: true }
  } catch (error) {
    throw new Error('Proforma closed, but the order was left unchanged: ' + (error?.message || String(error)))
  }
}
