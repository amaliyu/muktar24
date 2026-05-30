import { supabase } from '../lib/supabase'

const BLOCK_TYPE_MAP = {
  '6 Inch': '6 Inch Block',
  '6-inch': '6 Inch Block',
  '6 inch': '6 Inch Block',
  '9 Inch': '9 Inch 3 Hole Block',
  '9-inch': '9 Inch 3 Hole Block',
  '9 inch': '9 Inch 3 Hole Block',
  'Interlock': 'Standard Interlock',
  'interlock': 'Standard Interlock',
  '4 Inch': '4 Inch Block',
  '4-inch': '4 Inch Block',
}

function sanitizeBlockType(blockType) {
  if (!blockType) return blockType
  return BLOCK_TYPE_MAP[blockType] || blockType
}

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
    const bt = sanitizeBlockType(blockType)
    const { data: existing } = await supabase
      .from('finished_goods_stock')
      .select('id, quantity_in_yard')
      .eq('block_type', bt)
      .maybeSingle()

    if (existing) {
      await supabase.from('finished_goods_stock')
        .update({ quantity_in_yard: (Number(existing.quantity_in_yard) || 0) + qty, last_updated: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await supabase.from('finished_goods_stock')
        .insert({ block_type: bt, quantity_in_yard: qty, last_updated: new Date().toISOString() })
    }
  },

  async decrease(blockType, qty) {
    const bt = sanitizeBlockType(blockType)
    const { data: existing } = await supabase
      .from('finished_goods_stock')
      .select('id, quantity_in_yard')
      .eq('block_type', bt)
      .maybeSingle()

    if (existing) {
      const newQty = Math.max(0, (Number(existing.quantity_in_yard) || 0) - qty)
      await supabase.from('finished_goods_stock')
        .update({ quantity_in_yard: newQty, last_updated: new Date().toISOString() })
        .eq('id', existing.id)
    }
  },
}
