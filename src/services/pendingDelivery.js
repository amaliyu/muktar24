import { supabase } from '../lib/supabase'
import { waybillsService } from './deliveries'

export const pendingDeliveryService = {
  async getAll() {
    const { data, error } = await supabase
      .from('pending_delivery_register')
      .select('*, customer:customer_id(*), order:order_id(id, status, invoices(invoice_number, total_amount, payments(amount_paid, status)))')
      .neq('status', 'completed')
      .order('added_at', { ascending: true })
    if (error) throw error
    return data || []
  },

  async getByOrder(orderId) {
    const { data, error } = await supabase
      .from('pending_delivery_register')
      .select('*')
      .eq('order_id', orderId)
    if (error) throw error
    return data || []
  },

  async create(entry) {
    const { data, error } = await supabase
      .from('pending_delivery_register')
      .insert(entry)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateDelivered(id, additionalQty) {
    const { data: current } = await supabase
      .from('pending_delivery_register')
      .select('delivered_qty, total_qty')
      .eq('id', id)
      .single()

    const newDelivered = (Number(current?.delivered_qty) || 0) + additionalQty
    const newRemaining = Math.max(0, (Number(current?.total_qty) || 0) - newDelivered)
    const newStatus = newRemaining === 0 ? 'completed' : 'partially_delivered'

    const { data, error } = await supabase
      .from('pending_delivery_register')
      .update({ delivered_qty: newDelivered, remaining_qty: newRemaining, status: newStatus })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async setDelivered(id, deliveredQty) {
    const { data: current } = await supabase
      .from('pending_delivery_register')
      .select('total_qty')
      .eq('id', id)
      .single()
    const delivered = Math.max(0, Number(deliveredQty) || 0)
    const remaining = Math.max(0, (Number(current?.total_qty) || 0) - delivered)
    const status = remaining === 0 ? 'completed' : delivered > 0 ? 'partially_delivered' : 'awaiting_schedule'
    const { data, error } = await supabase
      .from('pending_delivery_register')
      .update({ delivered_qty: delivered, remaining_qty: remaining, status })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async resyncFromWaybills(entry) {
    // Recompute delivered_qty from actual waybills linked to this order
    const waybills = await waybillsService.getByOrder(entry.order_id)
    const delivered = waybills
      .filter(w => w.block_type === entry.block_type)
      .reduce((s, w) => s + (Number(w.quantity_received) || 0), 0)
    if (delivered === 0) return null // nothing linked, skip
    return pendingDeliveryService.setDelivered(entry.id, delivered)
  },

  async addFromOrder(order) {
    const existing = await pendingDeliveryService.getByOrder(order.id)
    const existingTypes = new Set(existing.map(e => e.block_type))
    for (const item of (order.order_items || [])) {
      if (!existingTypes.has(item.block_type)) {
        await pendingDeliveryService.create({
          order_id: order.id,
          customer_id: order.customer_id,
          block_type: item.block_type,
          total_qty: item.quantity,
          delivered_qty: 0,
          remaining_qty: item.quantity,
          status: 'awaiting_schedule',
        })
      }
    }
  },
}
