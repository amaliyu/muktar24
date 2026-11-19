import { supabase } from '../lib/supabase'

export async function getSiteScorecard(siteId, date) {
  const { data, error } = await supabase.rpc('site_daily_scorecard', { p_site_id: siteId, p_date: date })
  if (error) throw error
  return data
}

export async function getLatestSiteScorecard(siteId) {
  const { data, error } = await supabase.from('production_log').select('date')
    .eq('site_id', siteId).gt('quantity_produced', 0).order('date', { ascending: false })
    .limit(1).maybeSingle()
  if (error) throw error
  return data ? getSiteScorecard(siteId, data.date) : null
}
