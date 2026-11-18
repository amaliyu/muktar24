import { describe, expect, it, vi, beforeEach } from 'vitest'
vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))
vi.mock('./inventory', () => ({ inventoryService: {
  getAllItems: vi.fn(), autoDeductProduction: vi.fn(), reverseProductionMovements: vi.fn(),
} }))
import { supabase } from '../lib/supabase'
import { inventoryService } from './inventory'
import { productionMaterialsInDb, postProductionMaterials } from './productionMaterials'
const entry = { site_id: 'kado', cement_bags: 2, granite_dust_kg: 2300, chippings_kg: 0, diesel_litres: 4, date: '2026-11-18' }
beforeEach(() => {
  vi.resetAllMocks()
  inventoryService.getAllItems.mockResolvedValue([{ site_id: 'kado', material: 'cement' }])
  inventoryService.autoDeductProduction.mockResolvedValue({ missing: ['dust'] })
  inventoryService.reverseProductionMovements.mockResolvedValue()
})
describe('B1 posting flag', () => {
  it('calls browser deduction on create only when flag OFF', async () => {
    supabase.rpc.mockResolvedValue({ data: false, error: null })
    const flag = await productionMaterialsInDb()
    await postProductionMaterials({ dbPosting: flag, entry, reference: 'PROD-12345678', isEdit: false, warn: vi.fn() })
    expect(inventoryService.autoDeductProduction).toHaveBeenCalledTimes(1)
    expect(inventoryService.reverseProductionMovements).not.toHaveBeenCalled()
  })
  it('skips reverse and deduction on edit when flag ON and warns about missing stock', async () => {
    supabase.rpc.mockResolvedValue({ data: true, error: null })
    const flag = await productionMaterialsInDb()
    const warn = vi.fn()
    await postProductionMaterials({ dbPosting: flag, entry, reference: 'PROD-12345678', isEdit: true, warn })
    expect(inventoryService.autoDeductProduction).not.toHaveBeenCalled()
    expect(inventoryService.reverseProductionMovements).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(['dust', 'diesel'])
  })
  it('reverses and deducts on edit when flag OFF', async () => {
    supabase.rpc.mockResolvedValue({ data: false, error: null })
    await postProductionMaterials({ dbPosting: await productionMaterialsInDb(), entry, reference: 'PROD-12345678', isEdit: true, warn: vi.fn() })
    expect(inventoryService.reverseProductionMovements).toHaveBeenCalledOnce()
    expect(inventoryService.autoDeductProduction).toHaveBeenCalledOnce()
  })
  it('fails closed when flag RPC errors or returns a non-boolean', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: new Error('RPC unavailable') })
      .mockResolvedValueOnce({ data: null, error: null })
    await expect(productionMaterialsInDb()).rejects.toThrow('RPC unavailable')
    await expect(productionMaterialsInDb()).rejects.toThrow('Invalid production_materials_in_db')
    expect(inventoryService.autoDeductProduction).not.toHaveBeenCalled()
  })
})
