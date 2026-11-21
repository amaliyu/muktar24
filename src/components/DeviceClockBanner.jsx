import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { checkDeviceClock, clockWarningText } from '../utils/clockCheck'
import { theme, ui } from './site/siteUi'

export default function DeviceClockBanner({ userId }) {
  const [warning, setWarning] = useState(null)
  useEffect(() => {
    if (!userId) return
    let active = true
    let lastCheck = -Infinity
    const check = async () => {
      const now = performance.now()
      if (now - lastCheck < 60 * 60000) return
      lastCheck = now
      const result = await checkDeviceClock(supabase)
      if (active) setWarning(result?.wrong ? { userId, text: clockWarningText(result.offsetMs) } : null)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    check()
    document.addEventListener('visibilitychange', onVisible)
    return () => { active = false; document.removeEventListener('visibilitychange', onVisible) }
  }, [userId])

  if (!warning || warning.userId !== userId) return null
  return <div role="status" style={{ ...ui.panel, borderColor: theme.accent, color: theme.accent, overflowWrap: 'anywhere', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
    <span>{warning.text}</span>
    <button type="button" data-ico-allow data-board-allow style={{ ...ui.btn(), minHeight: 44 }} onClick={() => setWarning(null)}>Dismiss</button>
  </div>
}
