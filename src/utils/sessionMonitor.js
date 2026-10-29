export const CLOCK_WARNING = "Your phone's date/time looks wrong — set it to automatic."
// Durations use a monotonic clock: changing the phone's wall clock cannot end
// a valid session. expires_at is used only to display the clock-setting hint.
export function startSessionMonitor({ session, receivedAt, auth, onSession, onWarning, onClockWarning, onRefreshFailure,
  now = () => performance.now(), wallNow = () => Date.now(), intervalMs = 60000 }) {
  const lifetime = session.expires_in != null && Number.isFinite(Number(session.expires_in)) ? Math.max(0, Number(session.expires_in)) : 3600
  const deadline = receivedAt + lifetime * 1000
  if (session.expires_at && Math.abs(session.expires_at * 1000 - (wallNow() + lifetime * 1000)) > 300000) onClockWarning(CLOCK_WARNING)
  let stopped = false, refreshing = false
  const check = async () => {
    if (stopped || refreshing) return
    const left = deadline - now()
    onWarning(left <= 900000, Math.max(0, Math.ceil(left / 60000)))
    if (left > 0) return
    refreshing = true
    try {
      const { data, error } = await auth.refreshSession()
      if (stopped) return
      if (error) throw error
      if (!data?.session) throw new Error('Session refresh returned no session.')
      stopped = true
      onSession(data.session)
    } catch (e) {
      if (stopped) return
      stopped = true
      onRefreshFailure(e)
      await auth.signOut()
    }
  }
  check()
  const interval = setInterval(check, intervalMs)
  return () => { stopped = true; clearInterval(interval) }
}
