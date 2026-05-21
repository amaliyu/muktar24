import { supabase } from '../lib/supabase'

export const inventoryService = {
  async getAllItems() {
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .order('name')
    if (error) throw error
    return data || []
  },

  async getLowStockItems() {
    const data = await inventoryService.getAllItems()
    return data.filter(i => Number(i.current_stock) <= Number(i.reorder_level))
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

  async getMovements({ itemId = null, from = null, to = null } = {}) {
    let q = supabase
      .from('stock_movements')
      .select('*, item:item_id(name, unit)')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
    if (itemId) q = q.eq('item_id', itemId)
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

  async autoDeductProduction({ cementBags, graniteDustKg, dieselLitres, date, reference }) {
    const items = await inventoryService.getAllItems()
    const find = (keyword) => items.find(i => i.name.toLowerCase().includes(keyword.toLowerCase()))

    const deductions = [
      { item: find('cement'),  qty: Number(cementBags)    || 0 },
      { item: find('granite'), qty: Number(graniteDustKg) || 0 },
      { item: find('diesel'),  qty: Number(dieselLitres)  || 0 },
    ].filter(d => d.item && d.qty > 0)

    for (const { item, qty } of deductions) {
      const newStock = Math.max(0, (Number(item.current_stock) || 0) - qty)
      await supabase.from('inventory_items')
        .update({ current_stock: newStock, updated_at: new Date().toISOString() })
        .eq('id', item.id)
      await supabase.from('stock_movements').insert({
        item_id: item.id, movement_type: 'out',
        quantity: qty, issued_to: 'Production',
        staff_name: 'Auto', reference, date,
        notes: 'Auto-deducted from production log',
      })
    }
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
