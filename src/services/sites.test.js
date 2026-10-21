import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ resolve: null }))
vi.mock('../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../test/supabaseMock')
  return createSupabaseMock((table, ops) => state.resolve(table, ops))
})

import { sitesService, DUTSE_SITE_ID, isFactorySite } from './sites'

describe('sitesService', () => {
  beforeEach(() => { state.resolve = () => ({ data: [], error: null }) })

  it('getActive throws the query error instead of returning an empty list', async () => {
    state.resolve = () => ({ data: null, error: { message: 'permission denied for table production_sites' } })
    await expect(sitesService.getActive()).rejects.toMatchObject({ message: 'permission denied for table production_sites' })
  })

  it('getMachines throws the query error', async () => {
    state.resolve = () => ({ data: null, error: { message: 'boom' } })
    await expect(sitesService.getMachines(DUTSE_SITE_ID)).rejects.toMatchObject({ message: 'boom' })
  })

  it('getActive orders the factory first, then by name', async () => {
    state.resolve = () => ({
      data: [
        { id: 'k', name: 'Kado Site (Sequoia)', site_type: 'client_site' },
        { id: 'd', name: 'Dutse Factory', site_type: 'factory' },
        { id: 'l', name: 'Life Camp Site (Bilaad)', site_type: 'client_site' },
      ],
      error: null,
    })
    const sites = await sitesService.getActive()
    expect(sites.map(s => s.id)).toEqual(['d', 'k', 'l'])
  })

  it('isFactorySite reads site_type, and falls back to the Dutse id when sites are not loaded', () => {
    const sites = [{ id: DUTSE_SITE_ID, site_type: 'factory' }, { id: 'kado', site_type: 'client_site' }]
    expect(isFactorySite(DUTSE_SITE_ID, sites)).toBe(true)
    expect(isFactorySite('kado', sites)).toBe(false)
    expect(isFactorySite(DUTSE_SITE_ID, [])).toBe(true)
    expect(isFactorySite('kado', [])).toBe(false)
  })
})
