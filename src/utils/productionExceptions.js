import { number } from './requisitionText'
import { lagosToday } from './lateEntry'

export const parameterName = { cement: 'Cement', diesel: 'Diesel', breakage: 'Breakage' }
export const varianceLabel = value => (Number(value) > 0 ? '+' : Number(value) < 0 ? '−' : '') + number(Math.abs(Number(value))) + '%'
export const isAdverse = row => row.parameter === 'breakage' || row.direction === 'over'

export function warningSentence(row) {
  const actual = number(row.actual_qty)
  const blocks = number(row.blocks)
  const rate = number(row.actual_rate)
  const budget = number(row.budget_rate)
  switch (row.parameter) {
    case 'cement': return `${actual} bags for ${blocks} blocks — ${rate} per bag against ${budget} (${varianceLabel(row.variance_pct)})`
    case 'diesel': return `${actual} L for ${blocks} blocks — ${rate} L per 1,000 against ${budget} (${varianceLabel(row.variance_pct)})`
    case 'breakage': return `${actual} broken of ${blocks} — ${rate}% against ${budget}% allowed`
    default: return ''
  }
}

export function warningAge(row) {
  const date = row.created_at ? lagosToday(new Date(row.created_at)) : row.date
  return Math.max(0, Math.round((Date.parse(lagosToday()) - Date.parse(date)) / 86400000)) || 0
}

const parameterOrder = ['cement', 'diesel', 'breakage']
const statusOrder = ['open', 'explained', 'closed', 'resolved']

export function groupWarningDays(rows) {
  const days = new Map()
  for (const line of rows) {
    const key = line.site_id + ':' + line.date
    if (!days.has(key)) days.set(key, { key, site_id: line.site_id, date: line.date, lines: [] })
    days.get(key).lines.push(line)
  }
  return [...days.values()].map(day => {
    const lines = day.lines.sort((a, b) => parameterOrder.indexOf(a.parameter) - parameterOrder.indexOf(b.parameter))
    const status = statusOrder.find(value => lines.some(line => line.status === value))
    const actionLine = lines.find(line => ['open', 'explained'].includes(line.status)) || lines.find(line => line.status !== 'resolved')
    const oldestOpen = lines.filter(line => line.status === 'open').sort((a, b) =>
      String(a.created_at || a.date).localeCompare(String(b.created_at || b.date)))[0]
    return { ...day, lines, status, actionLine, age: oldestOpen ? warningAge(oldestOpen) : null }
  }).sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key))
}

export function warningWindowStart() {
  const date = new Date(lagosToday() + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() - 119)
  return date.toISOString().slice(0, 10)
}
