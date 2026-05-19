import { supabase } from '../lib/supabase'

export const finishedGoodsService = {
  async getAll() {
    const { data, error } = await supabase
      .from('finished_goods_stock')
      .select('*')
      .order('block_type')
    if (error) throw error
    return data || []
  },

  async increase(blockType, qty) {
    const { data: existing } = await supabase
      .from('finished_goods_stock')
      .select('id, quantity_in_yard')
      .eq('block_type', blockType)
      .maybeSingle()

    if (existing) {
      await supabase.from('finished_goods_stock')
        .update({ quantity_in_yard: (Number(existing.quantity_in_yard) || 0) + qty, last_updated: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await supabase.from('finished_goods_stock')
        .insert({ block_type: blockType, quantity_in_yard: qty, last_updated: new Date().toISOString() })
    }
  },

  async decrease(blockType, qty) {
    const { data: existing } = await supabase
      .from('finished_goods_stock')
      .select('id, quantity_in_yard')
      .eq('block_type', blockType)
      .maybeSingle()

    if (existing) {
      const newQty = Math.max(0, (Number(existing.quantity_in_yard) || 0) - qty)
      await supabase.from('finished_goods_stock')
        .update({ quantity_in_yard: newQty, last_updated: new Date().toISOString() })
        .eq('id', existing.id)
    }
  },
}
