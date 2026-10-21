import { supabase } from '../lib/supabase'

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
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateItem(id, updates) {
    const { data, error } = await supabase
      .from('inventory_items')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteItem(id) {
    const { error } = await supabase.from('inventory_items').delete().eq('id', id)
    if (error) throw error
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

  async stockIn({ itemId, quantity, unitCost, supplier, staffName, date, notes }) {
    const { data: item, error: fetchErr } = await supabase
      .from('inventory_items')
      .select('current_stock')
      .eq('id', itemId)
      .single()
    if (fetchErr) throw fetchErr

    const newStock = (Number(item.current_stock) || 0) + Number(quantity)
    await supabase.from('inventory_items')
      .update({ current_stock: newStock, unit_cost: Number(unitCost) || 0, supplier: supplier || null, updated_at: new Date().toISOString() })
      .eq('id', itemId)

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
      .select()
      .single()
    if (error) throw error
    return data
  },

  async stockOut({ itemId, quantity, issuedTo, staffName, reference, date, notes }) {
    const { data: item, error: fetchErr } = await supabase
      .from('inventory_items')
      .select('current_stock')
      .eq('id', itemId)
      .single()
    if (fetchErr) throw fetchErr

    const newStock = Math.max(0, (Number(item.current_stock) || 0) - Number(quantity))
    await supabase.from('inventory_items')
      .update({ current_stock: newStock, updated_at: new Date().toISOString() })
      .eq('id', itemId)

    const { data, error } = await supabase.from('stock_movements')
      .insert({
        item_id: itemId, movement_type: 'out',
        quantity: Number(quantity),
        issued_to: issuedTo || null,
        staff_name: staffName || null,
        reference: reference || null,
        date, notes: notes || null,
      })
      .select()
      .single()
    if (error) throw error
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
      const newStock = Math.max(0, (Number(item.current_stock) || 0) - qty)
      const { error: updErr } = await supabase.from('inventory_items')
        .update({ current_stock: newStock, updated_at: new Date().toISOString() })
        .eq('id', item.id)
      if (updErr) throw updErr
      const { error: movErr } = await supabase.from('stock_movements').insert({
        item_id: item.id, site_id: siteId, movement_type: 'out',
        quantity: qty, issued_to: 'Production',
        staff_name: 'Auto', reference, date,
        notes: 'Auto-deducted from production log',
      })
      if (movErr) throw movErr
      deducted.push({ material, itemId: item.id, qty })
    }
    return { deducted, missing }
  },

  async deleteMovement(id, movement) {
    const { data: item, error: fetchErr } = await supabase
      .from('inventory_items').select('current_stock').eq('id', movement.item_id).single()
    if (fetchErr) throw fetchErr
    const currentStock = Number(item?.current_stock) || 0
    const stockAfter = movement.movement_type === 'in'
      ? currentStock - Number(movement.quantity)
      : currentStock + Number(movement.quantity)
    if (stockAfter < 0) throw new Error(`Cannot delete — would result in negative stock of ${Math.abs(stockAfter)} units`)
    await supabase.from('inventory_items')
      .update({ current_stock: stockAfter, updated_at: new Date().toISOString() })
      .eq('id', movement.item_id)
    const { error } = await supabase.from('stock_movements').delete().eq('id', id)
    if (error) throw error
  },

  async editMovement(id, oldMovement, newData) {
    const { data: item, error: fetchErr } = await supabase
      .from('inventory_items').select('current_stock').eq('id', oldMovement.item_id).single()
    if (fetchErr) throw fetchErr
    const currentStock = Number(item?.current_stock) || 0
    const afterUndo = oldMovement.movement_type === 'in'
      ? currentStock - Number(oldMovement.quantity)
      : currentStock + Number(oldMovement.quantity)
    // A movement's type is immutable across an edit (this form can't turn a
    // stock-in into a stock-out), and newData doesn't carry movement_type — so
    // re-apply the new quantity using the authoritative type from oldMovement.
    // Using newData.movement_type here (always undefined) made this always
    // subtract, double-deducting on every stock-in edit.
    const newStock = oldMovement.movement_type === 'in'
      ? afterUndo + Number(newData.quantity)
      : afterUndo - Number(newData.quantity)
    if (newStock < 0) throw new Error(`Cannot edit — would result in negative stock of ${Math.abs(newStock)} units`)
    await supabase.from('inventory_items')
      .update({ current_stock: newStock, updated_at: new Date().toISOString() })
      .eq('id', oldMovement.item_id)
    const { data, error } = await supabase.from('stock_movements')
      .update(newData)
      .eq('id', id)
      .select('*, item:item_id(name, unit), site:site_id(name)')
      .single()
    if (error) throw error
    return data
  },

  async reverseProductionMovements(reference) {
    const { data: movements } = await supabase
      .from('stock_movements')
      .select('item_id, quantity, movement_type')
      .eq('reference', reference)
    if (!movements?.length) return

    for (const m of movements) {
      if (m.movement_type === 'out') {
        const { data: item } = await supabase
          .from('inventory_items').select('current_stock').eq('id', m.item_id).single()
        const restored = (Number(item?.current_stock) || 0) + Number(m.quantity)
        await supabase.from('inventory_items')
          .update({ current_stock: restored, updated_at: new Date().toISOString() })
          .eq('id', m.item_id)
      }
    }

    await supabase.from('stock_movements').delete().eq('reference', reference)
  },
}
