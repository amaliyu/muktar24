import { supabase } from '../lib/supabase'

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

  async delete(id) {
    await supabase.from('batch_production_links').delete().eq('batch_id', id)
    const { error } = await supabase.from('batches').delete().eq('id', id)
    if (error) throw error
  },
}
