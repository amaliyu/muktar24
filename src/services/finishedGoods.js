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

}
