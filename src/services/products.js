import { supabase } from '../lib/supabase'

let _cache = null
let _cacheTime = 0
const CACHE_TTL = 60000

export const productsService = {
  async getAll() {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('category')
      .order('name')
    if (error) throw error
    return data || []
  },

  async getActive() {
    if (_cache && Date.now() - _cacheTime < CACHE_TTL) return _cache
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('category')
      .order('name')
    if (error) throw error
    _cache = data || []
    _cacheTime = Date.now()
    return _cache
  },

  invalidateCache() {
    _cache = null
  },

  async create(product) {
    const { data, error } = await supabase
      .from('products')
      .insert(product)
      .select()
      .single()
    if (error) throw error
    this.invalidateCache()
    return data
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    this.invalidateCache()
    return data
  },

  async toggleActive(id, isActive) {
    return productsService.update(id, { is_active: isActive })
  },
}
