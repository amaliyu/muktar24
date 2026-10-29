import { supabase } from '../lib/supabase'
import { deleteById } from '../utils/checkedDelete'
import { checkedWrite } from '../utils/checkedWrite'
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

  // Active batches, optionally limited to one site (the waybill screen passes
  // DUTSE_SITE_ID so only factory/yard batches can be loaded on a truck).
  async getActive({ siteId = null } = {}) {
    let q = supabase
      .from('batches')
      .select('*')
      .eq('status', 'active')
    if (siteId) q = q.eq('site_id', siteId)
    const { data, error } = await q.order('date_cured', { ascending: false })
    if (error) throw error
    return data || []
  },

  // Batches that may be loaded on a waybill: factory (Dutse yard) batches only.
  // A client-site batch never feeds Dutse finished_goods_stock, so loading it
  // would wrongly decrease Dutse yard stock (Phase 7A).
  factoryBatchesOnly(batches, sites = []) {
    return batches.filter(b => isFactorySite(b.site_id, sites))
  },

  async getNextNumber() {
    const { data, error } = await supabase
      .from('batches')
      .select('batch_number')
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) throw error
    if (!data || data.length === 0) return 'APC-BATCH-001'
    const match = data[0].batch_number?.match(/(\d+)$/)
    const next = match ? parseInt(match[1], 10) + 1 : 1
    return `APC-BATCH-${String(next).padStart(3, '0')}`
  },

  async create(batch, productionLogIds = []) {
    const result = await supabase.from('batches').insert(batch).select().single()
    const data = checkedWrite(result)
    if (productionLogIds.length) {
      try {
        const links = await supabase.from('batch_production_links').insert(
          productionLogIds.map(pid => ({ batch_id: data.id, production_log_id: pid }))
        ).select('id')
        checkedWrite(links, productionLogIds.length)
      } catch (error) {
        let message = error.message
        if (error.code === '23505') {
          try {
            const batches = await batchesService.getAll()
            const existing = batches.find(b => b.id !== data.id && b.links?.some(l => productionLogIds.includes(l.production_log_id)))
            if (existing) message = `That production entry is already in batch ${existing.batch_number}.`
          } catch (lookupError) {
            message += ` Could not identify the existing batch: ${lookupError.message}`
          }
        }
        const failure = new Error(`Batch ${data.batch_number} exists, but its production links were not saved. ${message}`)
        failure.batchCreated = data
        throw failure
      }
    }
    return data
  },

  async createBatch({ batch, productionLogIds = [] }) {
    let batchNumber = batch.batch_number || await batchesService.getNextNumber()
    let created
    try {
      created = await batchesService.create({ ...batch, batch_number: batchNumber }, productionLogIds)
    } catch (e) {
      // Link failures happen AFTER creation and must never create a second batch.
      if (e.batchCreated || e.code !== '23505') throw e
      batchNumber = await batchesService.getNextNumber()
      created = await batchesService.create({ ...batch, batch_number: batchNumber }, productionLogIds)
    }
    return { batch: created, batchNumber }
  },

  async update(id, updates) {
    return checkedWrite(await supabase.from('batches').update(updates).eq('id', id).select('id'))
  },

  async markCured(id, userId) {
    return batchesService.update(id, {
      cured_verified: true, cured_verified_by: userId || null, cured_verified_at: new Date().toISOString(),
    })
  },

  async delete(id) {
    // Links cascade only if the parent delete succeeds. A refused delete leaves
    // both the batch and its links intact.
    try {
      return await deleteById(supabase, 'batches', id)
    } catch (e) {
      if (e.code === '23503' && /damage_log/i.test(`${e.message} ${e.details || ''}`)) {
        throw new Error('Batch has damage records — delete or move those first.')
      }
      throw e
    }
  },
}
