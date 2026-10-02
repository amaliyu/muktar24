import { supabase } from '../lib/supabase'
import { getSignedDocUrl, docStoragePath } from './storage'

export const suppliersService = {
  async getAll() {
    const { data, error } = await supabase.from('suppliers').select('*').order('company_name')
    if (error) throw error
    return data || []
  },

  async getActive() {
    const { data, error } = await supabase.from('suppliers').select('*').neq('status', 'inactive').order('company_name')
    if (error) throw error
    return data || []
  },

  async getById(id) {
    const { data, error } = await supabase.from('suppliers').select('*').eq('id', id).single()
    if (error) throw error
    return data
  },

  async create(supplier) {
    const { data, error } = await supabase.from('suppliers').insert(supplier).select().single()
    if (error) throw error
    return data
  },

  async update(id, updates) {
    const { data, error } = await supabase.from('suppliers').update(updates).eq('id', id).select().single()
    if (error) throw error
    return data
  },

  async getNextNumber() {
    const { data } = await supabase.from('suppliers').select('supplier_number').order('created_at', { ascending: false }).limit(1)
    if (!data || data.length === 0) return 'APC-SUP-001'
    const match = data[0].supplier_number?.match(/(\d+)$/)
    const next = match ? parseInt(match[1], 10) + 1 : 1
    return `APC-SUP-${String(next).padStart(3, '0')}`
  },
}

export const supplierTransactionsService = {
  async getBySupplier(supplierId) {
    const { data, error } = await supabase
      .from('supplier_transactions')
      .select('*')
      .eq('supplier_id', supplierId)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async create(transaction) {
    const { data, error } = await supabase
      .from('supplier_transactions').insert(transaction).select().single()
    if (error) throw error
    return data
  },

  async delete(id) {
    const { error } = await supabase.from('supplier_transactions').delete().eq('id', id)
    if (error) throw error
  },

  async getBalance(supplierId) {
    const { data } = await supabase
      .from('supplier_transactions').select('transaction_type, amount').eq('supplier_id', supplierId)
    if (!data) return 0
    return data.reduce((sum, t) => {
      if (t.transaction_type === 'purchase') return sum + Number(t.amount)
      if (t.transaction_type === 'payment' || t.transaction_type === 'return') return sum - Number(t.amount)
      return sum
    }, 0)
  },

  async getAllBalances() {
    const { data } = await supabase.from('supplier_transactions').select('supplier_id, transaction_type, amount')
    if (!data) return {}
    const map = {}
    data.forEach(t => {
      if (!map[t.supplier_id]) map[t.supplier_id] = 0
      if (t.transaction_type === 'purchase') map[t.supplier_id] += Number(t.amount)
      if (t.transaction_type === 'payment' || t.transaction_type === 'return') map[t.supplier_id] -= Number(t.amount)
    })
    return map
  },
}

export const supplierDocumentsService = {
  async getBySupplier(supplierId) {
    const { data, error } = await supabase
      .from('supplier_documents')
      .select('*')
      .eq('supplier_id', supplierId)
      .order('uploaded_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async upload(supplierId, file, label) {
    const ext = file.name.split('.').pop()
    const path = `${supplierId}/${Date.now()}.${ext}`
    const { data: sd, error: se } = await supabase.storage.from('supplier-documents').upload(path, file)
    if (se) throw se
    const { data, error } = await supabase.from('supplier_documents').insert({
      supplier_id: supplierId, document_label: label,
      file_url: sd.path, file_name: file.name, file_size: file.size,
    }).select().single()
    if (error) throw error
    return data
  },

  getSignedUrl(value) {
    return getSignedDocUrl('supplier-documents', value)
  },

  async delete(id, fileUrl) {
    const path = docStoragePath('supplier-documents', fileUrl)
    if (path) await supabase.storage.from('supplier-documents').remove([path])
    const { error } = await supabase.from('supplier_documents').delete().eq('id', id)
    if (error) throw error
  },
}
