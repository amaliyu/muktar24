import { supabase } from '../lib/supabase'
import { finishedGoodsService } from './finishedGoods'
import { isFactorySite } from './sites'

export const batchesService = {
  async getAll() {
    const { data, error } = await supabase
      .from('batches')
      .select('*, links:batch_production_links(production_log_id)')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async getActive() {
    const { data, error } = await supabase
      .from('batches')
      .select('*')
      .eq('status', 'active')
      .order('date_cured', { ascending: false })
    if (error) throw error
    return data || []
  },

  async getNextNumber() {
    const { data } = await supabase
      .from('batches')
      .select('batch_number')
      .order('created_at', { ascending: false })
      .limit(1)
    if (!data || data.length === 0) return 'APC-BATCH-001'
    const match = data[0].batch_number?.match(/(\d+)$/)
    const next = match ? parseInt(match[1], 10) + 1 : 1
    return `APC-BATCH-${String(next).padStart(3, '0')}`
  },

  async create(batch, productionLogIds = []) {
    const { data, error } = await supabase
      .from('batches')
      .insert(batch)
      .select()
      .single()
    if (error) throw error

    if (productionLogIds.length > 0) {
      await supabase.from('batch_production_links').insert(
        productionLogIds.map(pid => ({ batch_id: data.id, production_log_id: pid }))
      )
    }
    return data
  },

  // Dutse yard stock (finished_goods_stock) belongs to the factory only. A batch
  // at a client site never touches it (Phase 7A). delta > 0 increases, < 0
  // decreases. Returns true when the yard was adjusted, false when skipped.
  async adjustYardStock(siteId, sites, blockType, delta) {
    if (!delta || !isFactorySite(siteId, sites)) return false
    if (delta > 0) await finishedGoodsService.increase(blockType, delta)
    else await finishedGoodsService.decrease(blockType, Math.abs(delta))
    return true
  },

  // Create path used by the Batches page: insert (retrying once with a fresh
  // number on a batch_number collision), then add to Dutse yard stock only for
  // a factory batch. A yard-stock failure doesn't undo the batch; it is
  // returned as yardError so the page can show it.
  async createBatch({ batch, productionLogIds = [], sites = [] }) {
    let batchNumber = batch.batch_number || await batchesService.getNextNumber()
    let created
    try {
      created = await batchesService.create({ ...batch, batch_number: batchNumber }, productionLogIds)
    } catch (e) {
      if (e.code !== '23505') throw e
      batchNumber = await batchesService.getNextNumber()
      created = await batchesService.create({ ...batch, batch_number: batchNumber }, productionLogIds)
    }
    let yardUpdated = false
    let yardError = null
    try {
      yardUpdated = await batchesService.adjustYardStock(batch.site_id, sites, batch.block_type, Number(batch.qty_accepted))
    } catch (e) {
      console.error('Finished goods (yard) update failed for batch', batchNumber, e)
      yardError = e
    }
    return { batch: created, batchNumber, yardUpdated, yardError }
  },

  async restoreStock(id, qty) {
    const { data } = await supabase.from('batches').select('qty_remaining').eq('id', id).single()
    const newQty = (Number(data?.qty_remaining) || 0) + qty
    await supabase.from('batches').update({ qty_remaining: newQty, status: 'active' }).eq('id', id)
  },

  async reduceStock(id, qty) {
    const { data, error } = await supabase
      .from('batches')
      .select('qty_remaining, block_type')
      .eq('id', id)
      .single()
    if (error) throw error

    const newQty = Math.max(0, (Number(data.qty_remaining) || 0) - qty)
    await supabase.from('batches')
      .update({ qty_remaining: newQty, status: newQty === 0 ? 'exhausted' : 'active' })
      .eq('id', id)
    return { ...data, qty_remaining: newQty }
  },

  async update(id, updates) {
    const { error } = await supabase.from('batches').update(updates).eq('id', id)
    if (error) throw error
  },

  // Advisory curing sign-off (UI-level gate only — does not touch status,
  // stock, or quantity). Records who verified curing and when.
  async markCured(id, userId) {
    const { error } = await supabase.from('batches')
      .update({ cured_verified: true, cured_verified_by: userId || null, cured_verified_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  async delete(id) {
    await supabase.from('batch_production_links').delete().eq('batch_id', id)
    const { error } = await supabase.from('batches').delete().eq('id', id)
    if (error) throw error
  },
}
