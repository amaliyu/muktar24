const lagosDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit',
})

export const lagosToday = (now = new Date()) => lagosDate.format(now)

export function daysLate(dateStr, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return 0
  const date = Date.parse(dateStr)
  if (!Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== dateStr) return 0
  return Math.max(0, (Date.parse(lagosToday(now)) - date) / 86400000)
}

export const isLate = (dateStr, now) => daysLate(dateStr, now) > 1
