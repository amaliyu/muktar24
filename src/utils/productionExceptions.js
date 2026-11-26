import { number } from './requisitionText'
import { lagosToday } from './lateEntry'

export const parameterName = { cement: 'Cement', diesel: 'Diesel', breakage: 'Production breakage', stacking_breakage: 'Stacking breakage', loading_breakage: 'Loading breakage', offloading_breakage: 'Offloading breakage' }
export const varianceLabel = value => (Number(value) > 0 ? '+' : Number(value) < 0 ? '−' : '') + number(Math.abs(Number(value))) + '%'
export const isAdverse = row => row.parameter?.endsWith('breakage') || row.direction === 'over'

export function warningSentence(row) {
  const actual = number(row.actual_qty)
  const blocks = number(row.blocks)
  const rate = number(row.actual_rate)
  const budget = number(row.budget_rate)
  switch (row.parameter) {
    case 'cement': return `${actual} bags for ${blocks} blocks — ${rate} per bag against ${budget} (${varianceLabel(row.variance_pct)})`
    case 'diesel': return `${actual} L for ${blocks} blocks — ${rate} L per 1,000 against ${budget} (${varianceLabel(row.variance_pct)})`
    case 'stacking_breakage':
    case 'loading_breakage':
    case 'offloading_breakage':
    case 'breakage': return `${actual} broken of ${blocks} — ${rate}% against ${budget}% allowed`
    default: return ''
  }
}

export const lineText = row => row.message || warningSentence(row)

export function lineBadge(row) {
  if (row.status === 'resolved') return { label: 'Cleared', tone: 'textMuted' }
  if (row.kind === 'cost') return { label: 'Too much', tone: 'red' }
  if (row.kind === 'quality') return { label: 'Check quality', tone: 'accent' }
  return null
}

export function statusText(day, viewer) {
  if (day.escalated) return 'Escalated to the MD'
  if (day.status === 'open') return viewer === day.site_id ? 'Please explain' : 'Waiting for the site manager'
  if (day.status === 'explained') return 'Explained — waiting for review'
  return day.status === 'closed' ? 'Closed' : 'Cleared'
}

export function dayNaira(day) {
  const priced = day.lines.filter(line => ['open', 'explained'].includes(line.status) && line.value_naira != null)
  return priced.length ? priced.reduce((sum, line) => sum + Number(line.value_naira), 0) : null
}

export function warningAge(row) {
  const date = row.created_at ? lagosToday(new Date(row.created_at)) : row.date
  return Math.max(0, Math.round((Date.parse(lagosToday()) - Date.parse(date)) / 86400000)) || 0
}

const parameterOrder = ['cement', 'diesel', 'breakage', 'stacking_breakage', 'loading_breakage', 'offloading_breakage']
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
    const escalation = lines.find(line => ['open', 'explained'].includes(line.status) && line.escalated_at)
    const escalated = escalation ? { at: escalation.escalated_at, by: escalation.escalated_by_name, note: escalation.escalation_note } : null
    const oldestOpen = lines.filter(line => line.status === 'open').sort((a, b) =>
      String(a.created_at || a.date).localeCompare(String(b.created_at || b.date)))[0]
    return { ...day, lines, status, actionLine, escalated, age: oldestOpen ? warningAge(oldestOpen) : null }
  }).sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key))
}

export function warningWindowStart() {
  const date = new Date(lagosToday() + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() - 119)
  return date.toISOString().slice(0, 10)
}
