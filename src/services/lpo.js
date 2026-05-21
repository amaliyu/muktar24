import { supabase } from '../lib/supabase'

export const lpoService = {
  async getPending() {
    const { data, error } = await supabase
      .from('lpo_orders')
      .select('*, order:order_id(*, customer:customer_id(*), order_items(*))')
      .is('md_decision', null)
      .order('submitted_at', { ascending: true })
    if (error) throw error
    return data || []
  },

  async getAll() {
    const { data, error } = await supabase
      .from('lpo_orders')
      .select('*, order:order_id(*, customer:customer_id(*), order_items(*))')
      .order('submitted_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async create(lpo) {
    const { data, error } = await supabase
      .from('lpo_orders')
      .insert(lpo)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async decide(id, decision, note, approvedBy = 'MD') {
    const { data, error } = await supabase
      .from('lpo_orders')
      .update({ md_decision: decision, md_note: note || null, decided_at: new Date().toISOString(), md_approved_by: decision === 'approved' ? approvedBy : null })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async uploadDocument(file) {
    const ext  = file.name.split('.').pop()
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { data, error } = await supabase.storage.from('lpo-documents').upload(path, file, { upsert: false })
    if (error) throw error
    const { data: { publicUrl } } = supabase.storage.from('lpo-documents').getPublicUrl(data.path)
    return publicUrl
  },
}
