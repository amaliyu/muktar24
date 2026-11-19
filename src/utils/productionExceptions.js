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
