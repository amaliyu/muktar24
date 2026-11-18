import { supabase } from '../lib/supabase'
import { inventoryService } from './inventory'
import { missingProductionItems } from '../utils/productionDust'

// A failed flag lookup MUST block a production write. Never silently fall back.
export async function productionMaterialsInDb() {
  const { data, error } = await supabase.rpc('app_flag', { p_key: 'production_materials_in_db' })
  if (error) throw error
  if (typeof data !== 'boolean') throw new Error('Invalid production_materials_in_db flag response')
  return data
}

export async function loadDustStandards() {
  const { data, error } = await supabase.from('site_block_standards')
    .select('site_id, block_type, dust_kg_per_block, set_by_name, set_at, notes')
    .order('block_type')
  if (error) throw error
  return data || []
}

export async function saveDustStandard(row, fullName) {
  const kg = Number(row.dust_kg_per_block)
  if (!Number.isFinite(kg) || kg <= 0 || kg > 60) throw new Error('Dust per block must be greater than 0 and at most 60 kg')
  if (!fullName?.trim()) throw new Error('MD full name is required')
  const { data, error } = await supabase.from('site_block_standards').upsert({
    site_id: row.site_id, block_type: row.block_type,
    dust_kg_per_block: kg, set_by_name: fullName.trim(), set_at: new Date().toISOString(),
  }, { onConflict: 'site_id,block_type' }).select('site_id, block_type').single()
  if (error) throw error
  return data
}

export async function postProductionMaterials({ dbPosting, entry, reference, isEdit, warn }) {
  if (dbPosting) {
    const items = await inventoryService.getAllItems()
    warn(missingProductionItems(items, entry))
    return
  }
  if (isEdit) await inventoryService.reverseProductionMovements(reference)
  const { missing } = await inventoryService.autoDeductProduction({
    siteId: entry.site_id, cementBags: entry.cement_bags,
    graniteDustKg: entry.granite_dust_kg, chippingsKg: entry.chippings_kg,
    dieselLitres: entry.diesel_litres, date: entry.date, reference,
  })
  warn(missing)
  await inventoryService.getAllItems()
}
