import { supabase } from '../lib/supabase'
import { inventoryService } from './inventory'

export const productionService = {
  async getAll({ from, to } = {}) {
    let query = supabase
      .from('production_log')
      .select('*, recorded_by_staff:staff(full_name)')
      .order('date', { ascending: false })

    if (from) query = query.gte('date', from)
    if (to)   query = query.lte('date', to)

    const { data, error } = await query
    if (error) throw error
    return data
  },

  async create(entry) {
    const { data, error } = await supabase
      .from('production_log')
      .insert(entry)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getDamages({ from, to } = {}) {
    let query = supabase
      .from('damage_log')
      .select('*')
      .order('date', { ascending: false })

    if (from) query = query.gte('date', from)
    if (to)   query = query.lte('date', to)

    const { data, error } = await query
    if (error) throw error
    return data
  },

  async logDamage(entry) {
    const { data, error } = await supabase
      .from('damage_log')
      .insert(entry)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteEntry(id) {
    // Reverse the raw-material stock this entry auto-deducted BEFORE deleting
    // anything: reverseProductionMovements looks up stock_movements by exact
    // reference, so those rows must still exist when it runs. It adds each 'out'
    // quantity back to inventory_items and deletes the movement rows itself.
    //
    // KNOWN LIMITATION: the reference is `PROD-<first 8 chars of id>` (matching
    // the save path at App.jsx autoDeductProduction). Because the id is
    // truncated to 8 chars, two different entries could theoretically share a
    // PROD- prefix; a collision would reverse the wrong entry's movements. Not
    // fixed here (that needs a coordinated change to the save path too) —
    // flagged for the record.
    const reference = `PROD-${id.slice(0, 8)}`
    try {
      await inventoryService.reverseProductionMovements(reference)
    } catch (e) {
      // Non-blocking: a missing or failed reversal (pre-auto-deduction rows, or
      // material-less quantity-only entries) must not prevent the delete — but
      // log it rather than swallowing silently so it's diagnosable.
      console.error(`Inventory reversal failed for ${reference} during production delete; proceeding with delete.`, e)
    }
    await supabase.from('damage_log').delete().eq('production_log_id', id)
    await supabase.from('batch_production_links').delete().eq('production_log_id', id)
    const { error } = await supabase.from('production_log').delete().eq('id', id)
    if (error) throw error
  },

  async deleteTransitDamage(waybillNumber) {
    await supabase.from('damage_log')
      .delete()
      .eq('stage', 'delivery')
      .ilike('notes', `%${waybillNumber}%`)
  },

  async update(id, data, userId) {
    // Stamp the audit trail on every update: who edited and when.
    const { error } = await supabase.from('production_log').update({
      ...data,
      updated_at: new Date().toISOString(),
      updated_by: userId || null,
    }).eq('id', id)
    if (error) throw error
  },

  async clearDamages(productionLogId) {
    const { error } = await supabase.from('damage_log').delete().eq('production_log_id', productionLogId)
    if (error) throw error
  },
}
