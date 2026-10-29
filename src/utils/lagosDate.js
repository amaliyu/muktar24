// Calendar dates in Lagos. Month arguments are zero-based, like Date.getMonth().
export const todayLagos = (now = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(now)
export const dateParts = (now = new Date()) => todayLagos(now).split('-').map(Number)
const isoUTC = d => d.toISOString().slice(0, 10)
export const monthStart = (year, month) => isoUTC(new Date(Date.UTC(year, month, 1)))
export const monthEnd = (year, month) => isoUTC(new Date(Date.UTC(year, month + 1, 0)))
export const shiftDate = (date, days) => isoUTC(new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000))
export function periodRange(preset, now = new Date()) {
  const to = todayLagos(now), [y, m] = dateParts(now)
  if (preset === 'today') return { from: to, to }
  if (preset === 'week') {
    const dow = new Date(to + 'T00:00:00Z').getUTCDay()
    return { from: shiftDate(to, -(dow === 0 ? 6 : dow - 1)), to }
  }
  if (preset === 'month') return { from: monthStart(y, m - 1), to }
  if (preset === 'lastmonth') return { from: monthStart(y, m - 2), to: monthEnd(y, m - 2) }
  if (preset === 'quarter') return { from: monthStart(y, Math.floor((m - 1) / 3) * 3), to }
  if (preset === 'year') return { from: `${y}-01-01`, to }
  return { from: '', to: '' }
}
