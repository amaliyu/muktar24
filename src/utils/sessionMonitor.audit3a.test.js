import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { startSessionMonitor } from './sessionMonitor'
let cleanup
beforeEach(() => vi.useFakeTimers())
afterEach(() => { cleanup?.(); vi.useRealTimers() })
const setup = (session = { expires_in: 3600 }, refresh) => {
  const callbacks = { onSession: vi.fn(), onWarning: vi.fn(), onRefreshFailure: vi.fn() }
  const auth = { refreshSession: vi.fn(refresh || (async () => ({ data: { session: { expires_in: 3600 } }, error: null }))), signOut: vi.fn(async () => ({})) }
  const clock = { elapsed: 0 }
  cleanup = startSessionMonitor({ session, receivedAt: 0, auth, ...callbacks, now: () => clock.elapsed, wallNow: () => 1000000 })
  return { auth, clock, ...callbacks }
}
it('uses the restored expiry even when expires_in says a full hour', async () => {
  const ctx = setup({ expires_at: 1600, expires_in: 3600 })
  expect(ctx.onWarning).toHaveBeenLastCalledWith(true, 10)
  expect(ctx.auth.refreshSession).not.toHaveBeenCalled()
  ctx.clock.elapsed = 10 * 60000
  await vi.advanceTimersByTimeAsync(60000)
  expect(ctx.auth.refreshSession).toHaveBeenCalledTimes(1)
})
it('refreshes immediately when the restored expiry has passed', async () => {
  const ctx = setup({ expires_at: 999, expires_in: 3600 })
  expect(ctx.onWarning).toHaveBeenLastCalledWith(true, 0)
  expect(ctx.auth.refreshSession).toHaveBeenCalledTimes(1)
  expect(ctx.auth.signOut).not.toHaveBeenCalled()
})
it('15: warns 15 minutes before elapsed expiry then refreshes without signing out', async () => {
  const ctx = setup()
  ctx.clock.elapsed = 45 * 60000
  await vi.advanceTimersByTimeAsync(60000)
  expect(ctx.onWarning).toHaveBeenLastCalledWith(true, 15)
  ctx.clock.elapsed = 60 * 60000
  await vi.advanceTimersByTimeAsync(60000)
  expect(ctx.auth.refreshSession).toHaveBeenCalledTimes(1)
  expect(ctx.onSession).toHaveBeenCalledWith({ expires_in: 3600 })
  expect(ctx.auth.signOut).not.toHaveBeenCalled()
})
it('15: refresh error, including a returned Supabase error, is the only expiry sign-out path', async () => {
  const failure = new Error('TEST refresh refused')
  const ctx = setup(undefined, async () => ({ data: null, error: failure }))
  ctx.clock.elapsed = 3600000
  await vi.advanceTimersByTimeAsync(60000)
  expect(ctx.onRefreshFailure).toHaveBeenCalledWith(failure)
  expect(ctx.auth.signOut).toHaveBeenCalledTimes(1)
})
it('15: wall-clock changes after setup do not trigger expiry', async () => {
  const ctx = setup()
  vi.setSystemTime(new Date('2040-01-01'))
  await vi.advanceTimersByTimeAsync(5 * 60000)
  expect(ctx.auth.refreshSession).not.toHaveBeenCalled()
  expect(ctx.auth.signOut).not.toHaveBeenCalled()
})
it('15: disposing a monitor prevents a late failed refresh from logging out a replacement session', async () => {
  let finish
  const ctx = setup(undefined, () => new Promise(resolve => { finish = resolve }))
  ctx.clock.elapsed = 3600000
  await vi.advanceTimersByTimeAsync(60000)
  cleanup()
  finish({ data: null, error: new Error('old session') })
  await vi.advanceTimersByTimeAsync(0)
  expect(ctx.auth.signOut).not.toHaveBeenCalled()
})
