const fiveMinutes = 5 * 60000

export async function checkDeviceClock(supabase, now = Date.now) {
  try {
    const start = now()
    const { data, error } = await supabase.rpc('server_time')
    const end = now()
    if (error) return null
    const offsetMs = Date.parse(data) - (start + end) / 2
    return Number.isFinite(offsetMs) ? { offsetMs, wrong: Math.abs(offsetMs) > fiveMinutes } : null
  } catch { return null }
}

export function clockWarningText(offsetMs) {
  const minutes = Math.round(Math.abs(offsetMs) / 60000)
  const hours = Math.round(minutes / 6) / 10
  const duration = Math.abs(offsetMs) >= 120 * 60000 ? hours + ' hours' : minutes + ' minutes'
  return "This device's clock is " + duration + (offsetMs < 0 ? ' ahead' : ' behind') +
    ' — set date and time to automatic.'
}
