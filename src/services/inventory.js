import { supabase } from '../lib/supabase'
import { deleteById, deleteWhere } from '../utils/checkedDelete'
import { checkedWrite } from '../utils/checkedWrite'

export const inventoryService = {
  async getAllItems() {
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*, site:site_id(name, code)')
      .order('name')
    if (error) throw error
    return data || []
  },

  // Low-stock items, each carrying its own site (item.site.name) so alerts are
  // per site — quantities from different sites are never summed together.
  async getLowStockItems({ siteId = null } = {}) {
    const data = await inventoryService.getAllItems()
    return data.filter(i => (!siteId || i.site_id === siteId) && Number(i.current_stock) <= Number(i.reorder_level))
  },

  async createItem(item) {
    const { data, error } = await supabase
      .from('inventory_items')
      .insert({ ...item, updated_at: new Date().toISOString() })
      .select('id')
      .single()
    checkedWrite({ data, error })
    return data
  },

  async updateItem(id, updates) {
    const { data, error } = await supabase
      .from('inventory_items')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id')
      .single()
    checkedWrite({ data, error })
    return data
  },

  async deleteItem(id) {
    return deleteById(supabase, 'inventory_items', id)
  },

  async getMovements({ itemId = null, siteId = null, from = null, to = null } = {}) {
    let q = supabase
      .from('stock_movements')
      .select('*, item:item_id(name, unit), site:site_id(name)')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
    if (itemId) q = q.eq('item_id', itemId)
    if (siteId) q = q.eq('site_id', siteId)
    if (from)   q = q.gte('date', from)
    if (to)     q = q.lte('date', to)
    const { data, error } = await q
    if (error) throw error
    return data || []
  },

  async hasMovements(itemId) {
    const { data, error } = await supabase.from('stock_movements').select('id').eq('item_id', itemId).limit(1)
    if (error) throw error
    return !!data?.length
  },

  async stockIn({ itemId, quantity, unitCost, supplier, staffName, date, notes }) {
    const metadata = await supabase.from('inventory_items')
      .update({ unit_cost: Number(unitCost) || 0, supplier: supplier || null, updated_at: new Date().toISOString() })
      .eq('id', itemId).select('id')
    checkedWrite(metadata)

    const { data, error } = await supabase.from('stock_movements')
      .insert({
        item_id: itemId, movement_type: 'in',
        quantity: Number(quantity),
        unit_cost: Number(unitCost) || null,
        total_cost: Number(quantity) * (Number(unitCost) || 0),
        supplier: supplier || null,
        staff_name: staffName || null,
        date, notes: notes || null,
      })
      .select('id')
      .single()
    checkedWrite({ data, error })
    return data
  },

  async stockOut({ itemId, quantity, issuedTo, staffName, reference, date, notes }) {
    const { data, error } = await supabase.from('stock_movements')
      .insert({
        item_id: itemId, movement_type: 'out',
        quantity: Number(quantity),
        issued_to: issuedTo || null,
        staff_name: staffName || null,
        reference: reference || null,
        date, notes: notes || null,
      })
      .select('id')
      .single()
    checkedWrite({ data, error })
    return data
  },

  // Deduct a production entry's raw materials from the stock items AT ITS SITE.
  // Items are resolved by exact site_id + material key (Rule 10.6) — never by
  // name keyword, and never from another site. A material that was used
  // (qty > 0) but has no item set up at the site is NOT deducted anywhere; it
  // is returned in `missing` so the caller can warn. Client-owned items are
  // deducted too (we track the client's stock); they're just not APCL value.
  async autoDeductProduction({ siteId, cementBags, graniteDustKg, chippingsKg, dieselLitres, date, reference }) {
    if (!siteId) throw new Error('autoDeductProduction: siteId is required')
    const items = await inventoryService.getAllItems()
    const atSite = (material) => items.find(i => i.site_id === siteId && i.material === material)

    const wanted = [
      { material: 'cement',    qty: Number(cementBags)    || 0 },
      { material: 'dust',      qty: Number(graniteDustKg) || 0 },
      { material: 'chippings', qty: Number(chippingsKg)   || 0 },
      { material: 'diesel',    qty: Number(dieselLitres)  || 0 },
    ].filter(d => d.qty > 0)

    const missing = []
    const deducted = []
    for (const { material, qty } of wanted) {
      const item = atSite(material)
      if (!item) { missing.push(material); continue }
      const { data, error: movErr } = await supabase.from('stock_movements').insert({
        item_id: item.id, site_id: siteId, movement_type: 'out',
        quantity: qty, issued_to: 'Production',
        staff_name: 'Auto', reference, date,
        notes: 'Auto-deducted from production log',
      }).select('id')
      checkedWrite({ data, error: movErr })
      deducted.push({ material, itemId: item.id, qty })
    }
    return { deducted, missing }
  },

  async deleteMovement(id) {
    return deleteById(supabase, 'stock_movements', id)
  },

  async editMovement(id, oldMovement, newData) {
    const result = await supabase.from('stock_movements').update(newData).eq('id', id).select('id')
    return checkedWrite(result)
  },

  async reverseProductionMovements(reference) {
    // The movement ledger reverses the balance in the deletion transaction.
    return deleteWhere(supabase, 'stock_movements', 'reference', reference)
  },
}
