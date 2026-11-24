import { expect, it, vi } from 'vitest'
import { FACE_MODEL, siteAttendance } from './siteAttendance'
const db = vi.hoisted(() => ({ calls: [] }))
vi.mock('../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../test/supabaseMock')
  const { supabase, calls } = createSupabaseMock(() => ({ data: { passed: true }, error: null }))
  db.calls = calls
  return { supabase }
})
it('sends the v2 model and complete engine log payload, truncating user agent', async () => {
  expect(FACE_MODEL).toBe('human-faceres-v2')
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('a'.repeat(500))
  await siteAttendance.logEngine('site', { backend: 'wasm', score: .999 }, 'phone')
  expect(db.calls[0]).toEqual({ rpc: 'log_face_engine', args: {
    p_site_id: 'site', p_model: FACE_MODEL, p_backend: 'wasm', p_score: .999, p_device_id: 'phone', p_user_agent: 'a'.repeat(400),
  } })
  vi.restoreAllMocks()
  await siteAttendance.listEngineChecks()
  expect(db.calls[1]).toMatchObject({ table: 'face_engine_checks', ops: expect.arrayContaining([['order', 'created_at', { ascending: false }], ['limit', 20]]) })
})
