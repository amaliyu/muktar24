import { expect, it, vi } from 'vitest'
const rpc = vi.hoisted(() => vi.fn(async () => ({ data: 'id', error: null })))
vi.mock('../lib/supabase', () => ({ supabase: { rpc } }))
import { siteGenerator } from './siteGenerator'
it('maps fields, converts numbers and nulls blanks', async () => {
  await siteGenerator.record('s', '2026-11-25', { startedAt: '07:30', stoppedAt: '17:00', breakMinutes: '60', meterStart: '', meterEnd: '15.5', note: '', lateReason: '  missed entry  ' })
  expect(rpc).toHaveBeenLastCalledWith('record_generator_day', { p_site_id: 's', p_on_date: '2026-11-25', p_started_at: '07:30', p_stopped_at: '17:00', p_break_minutes: 60, p_hour_meter_start: null, p_hour_meter_end: 15.5, p_note: null, p_late_reason: 'missed entry' })
  await siteGenerator.day('s', '2026-11-25')
  expect(rpc).toHaveBeenLastCalledWith('site_generator_day', { p_site_id: 's', p_date: '2026-11-25' })
  rpc.mockResolvedValueOnce({ error: new Error('server refusal') })
  await expect(siteGenerator.day('s', 'date')).rejects.toThrow('server refusal')
})
