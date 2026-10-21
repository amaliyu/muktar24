import { supabase } from '../lib/supabase'

// Phase 7A — production sites (Dutse factory + mobile client sites).
// The Dutse factory row has a fixed id; every pre-7A record was backfilled to it
// and the DB's fn_fill_site_id trigger falls back to it when no site is given.
export const DUTSE_SITE_ID = '00000000-0000-4000-8000-000000000001'

// A site is the factory (yard stock lives there) only if site_type says so.
// When the site row isn't loaded yet, fall back to the fixed Dutse id so a
// Dutse record is never mis-treated as a client-site one.
export const isFactorySite = (siteId, sites = []) => {
  const site = sites.find(s => s.id === siteId)
  if (site) return site.site_type === 'factory'
  return siteId === DUTSE_SITE_ID
}

export const siteName = (siteId, sites = []) =>
  sites.find(s => s.id === siteId)?.name || (siteId === DUTSE_SITE_ID ? 'Dutse Factory' : '—')

export const sitesService = {
  // Active sites, factory first, then by name. Errors are thrown (Rule 10.5) —
  // an RLS block or bad column must never look like "no sites".
  async getActive() {
    const { data, error } = await supabase
      .from('production_sites')
      .select('id, code, name, site_type, contract_model, client_name, is_active')
      .eq('is_active', true)
      .order('name')
    if (error) throw error
    return [...data].sort((a, b) =>
      (a.site_type === 'factory' ? 0 : 1) - (b.site_type === 'factory' ? 0 : 1) || a.name.localeCompare(b.name))
  },

  // Active machines stationed at a site, ordered by code.
  async getMachines(siteId) {
    const { data, error } = await supabase
      .from('assets')
      .select('id, code, name, site_id, status')
      .eq('asset_type', 'machine')
      .eq('status', 'active')
      .eq('site_id', siteId)
      .order('code')
    if (error) throw error
    return data
  },
}
