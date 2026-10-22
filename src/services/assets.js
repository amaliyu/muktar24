import { supabase } from '../lib/supabase'

// Phase 7B-2 — capital asset register. Reads go through v_site_asset_register
// (security_invoker, so assets RLS applies). Moves go ONLY through the
// move_asset RPC: a direct UPDATE of assets.site_id is blocked by
// trg_assets_site_guard, so an edit never sends site_id. Every error is thrown
// unchanged (Rule 10.5) so the DB's messages reach the UI verbatim.

const must = ({ data, error }) => {
  if (error) throw error
  return data
}

// An UPDATE that RLS filters out affects zero rows without an error (Rule 10.4).
const mustTouch = (res, what) => {
  const data = must(res)
  if (!data || (Array.isArray(data) && data.length === 0)) {
    throw new Error(`${what} was not saved — you may not have permission, or the record no longer exists.`)
  }
  return Array.isArray(data) ? data[0] : data
}

// Columns verified against the live schema on 2026-10-22 (Rule 11).
export const ASSET_CATEGORIES = ['machine', 'generator', 'mould', 'pallet', 'trolley', 'mixer', 'tank', 'pump', 'storage', 'tool', 'vehicle', 'other']
export const ASSET_CONDITIONS = ['good', 'fair', 'needs_repair', 'out_of_service']
export const ASSET_STATUSES = ['active', 'down', 'maintenance', 'retired']

// asset_type follows the category: machine → machine, vehicle → vehicle,
// anything else → equipment.
export const assetTypeFor = (category) => (category === 'machine' ? 'machine' : category === 'vehicle' ? 'vehicle' : 'equipment')

// Fields any writer may send on edit. site_id is never here (use moveAsset).
const EDITABLE = ['name', 'code', 'category', 'asset_type', 'quantity', 'serial_or_tag', 'acquired_on', 'funding_source', 'condition', 'status', 'notes']
const pick = (obj, keys) => Object.fromEntries(keys.filter(k => k in obj).map(k => [k, obj[k]]))

export const assetsService = {
  async listRegister() {
    return must(await supabase.from('v_site_asset_register').select('*').order('site_name').order('category').order('name'))
  },

  // Movements of this record plus the record it was split from (the split
  // movement row sits on the new record with split_from_asset_id set), and any
  // records split off it.
  async listMovements(assetId) {
    return must(await supabase.from('asset_movements')
      .select('id, asset_id, from_site_id, to_site_id, moved_on, quantity, reason, split_from_asset_id, moved_by_name, created_at')
      .or(`asset_id.eq.${assetId},split_from_asset_id.eq.${assetId}`)
      .order('moved_on', { ascending: false })
      .order('created_at', { ascending: false }))
  },

  // canMoney: md/accountant may set acquisition_cost; md alone may set
  // investment_pool_ref. Otherwise those columns are left out entirely.
  async createAsset(form, { canCost = false, canPoolRef = false } = {}) {
    const payload = { ...pick(form, EDITABLE), asset_type: assetTypeFor(form.category), site_id: form.site_id || null }
    if (canCost) payload.acquisition_cost = form.acquisition_cost
    if (canPoolRef) payload.investment_pool_ref = form.investment_pool_ref
    return must(await supabase.from('assets').insert(payload).select().single())
  },

  async updateAsset(id, form, { canCost = false, canPoolRef = false } = {}) {
    const payload = { ...pick(form, EDITABLE), asset_type: assetTypeFor(form.category) }
    if (canCost) payload.acquisition_cost = form.acquisition_cost
    if (canPoolRef) payload.investment_pool_ref = form.investment_pool_ref
    return mustTouch(await supabase.from('assets').update(payload).eq('id', id).select(), 'Asset')
  },

  // Returns the id of the record now at the destination (the same id for a
  // whole move, a new id for a part move).
  async moveAsset({ assetId, toSiteId, quantity, movedOn, reason }) {
    return must(await supabase.rpc('move_asset', {
      p_asset_id: assetId,
      p_to_site_id: toSiteId,
      p_quantity: quantity,
      p_moved_on: movedOn,
      p_reason: reason,
    }))
  },
}
