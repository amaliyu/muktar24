import { expect, it } from 'vitest'
import { parameterName, isAdverse, warningSentence, groupWarningDays, lineText, statusText } from './productionExceptions'
import { scorecardMetrics } from './siteScorecard'
const parameters = ['cement','diesel','breakage','stacking_breakage','loading_breakage','offloading_breakage']
it('names and orders all six warning parameters', () => {
  expect(parameters.map(p => parameterName[p])).toEqual(['Cement','Diesel','Production breakage','Stacking breakage','Loading breakage','Offloading breakage'])
  const [day] = groupWarningDays([...parameters].reverse().map(parameter => ({ parameter, site_id: 's', date: '2026-11-26', status: 'open' })))
  expect(day.lines.map(x => x.parameter)).toEqual(parameters)
})
it.each(parameters.slice(2))('%s is adverse and uses the breakage fallback sentence', parameter => {
  const row = { parameter, direction: 'under', actual_qty: 9, blocks: 417, actual_rate: 2.16, budget_rate: 1 }
  expect(isAdverse(row)).toBe(true)
  expect(warningSentence(row)).toBe(warningSentence({ ...row, parameter: 'breakage' }))
  expect(lineText({ ...row, message: 'Complete database sentence.' })).toBe('Complete database sentence.')
})
it('cement and diesel are adverse only when over', () => {
  expect(isAdverse({ parameter: 'cement', direction: 'under' })).toBe(false)
  expect(isAdverse({ parameter: 'diesel', direction: 'over' })).toBe(true)
})
it('scorecard takes stacking warnings and prefers a cost line over a quality line', () => {
  const score = { breakage: { allowed_pct: 1 } }
  const quality = { parameter: 'stacking_breakage', kind: 'quality', status: 'open', message: 'Stacking quality' }
  const cost = { parameter: 'loading_breakage', kind: 'cost', status: 'open', message: 'Loading cost' }
  expect(scorecardMetrics(score, [quality]).breakage.hint).toBe('Stacking quality')
  expect(scorecardMetrics(score, [quality, cost]).breakage).toMatchObject({ hint: 'Loading cost', chip: { label: 'Too much' } })
  expect(scorecardMetrics(score, [{ ...cost, status: 'resolved' }, quality]).breakage.hint).toBe('Stacking quality')
  expect(scorecardMetrics(score, [{ ...cost, status: 'closed' }, quality]).breakage.hint).toBe('Stacking quality')
  expect(scorecardMetrics({}, [cost]).breakage.hint).toBe('Loading cost')
})

it('takes escalation from the first flagged active line and ignores closed/resolved history', () => {
  const common = { site_id: 's', date: '2026-11-26', escalated_at: '2026-11-26T05:00:00Z', escalated_by_name: 'ICO', escalation_note: 'Needs an MD decision' }
  const rows = [
    { ...common, parameter: 'cement', status: 'closed', escalation_note: 'Closed history' },
    { ...common, parameter: 'diesel', status: 'resolved', escalation_note: 'Resolved history' },
    { ...common, parameter: 'stacking_breakage', status: 'explained' },
    { ...common, parameter: 'loading_breakage', status: 'open', escalation_note: 'Later line' },
  ]
  const [day] = groupWarningDays(rows)
  expect(day.escalated).toEqual({ at: common.escalated_at, by: 'ICO', note: 'Needs an MD decision' })
  expect(statusText(day)).toBe('Escalated to the MD')
  expect(groupWarningDays(rows.slice(0, 2))[0].escalated).toBeNull()
  expect(groupWarningDays(rows.map(row => ({ ...row, escalated_at: null })))[0].escalated).toBeNull()
})
