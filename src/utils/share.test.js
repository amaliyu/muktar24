import { afterEach, expect, it, vi } from 'vitest'
import { copyText, shareText } from './share'

const define = (object, key, value) => {
  const previous = Object.getOwnPropertyDescriptor(object, key)
  Object.defineProperty(object, key, { configurable: true, value })
  return () => previous ? Object.defineProperty(object, key, previous) : delete object[key]
}
const cleanup = []
afterEach(() => { cleanup.splice(0).reverse().forEach(restore => restore()); vi.restoreAllMocks() })

it('uses the native share sheet and leaves the message unchanged', async () => {
  const share = vi.fn().mockResolvedValue(undefined)
  cleanup.push(define(navigator, 'share', share))
  expect(await shareText('a & b', 'Report')).toBe('shared')
  expect(share).toHaveBeenCalledWith({ title: 'Report', text: 'a & b' })
})

it('cancels quietly without opening WhatsApp when the share sheet is dismissed', async () => {
  cleanup.push(define(navigator, 'share', vi.fn().mockRejectedValue({ name: 'AbortError' })))
  const open = vi.spyOn(window, 'open').mockImplementation(() => null)
  expect(await shareText('Reminder', 'Report')).toBe('cancelled')
  expect(open).not.toHaveBeenCalled()
})

it('opens an encoded WhatsApp link when the native share sheet is unavailable', async () => {
  cleanup.push(define(navigator, 'share', undefined))
  const open = vi.spyOn(window, 'open').mockImplementation(() => null)
  expect(await shareText('a & b', 'Report')).toBe('opened')
  expect(open).toHaveBeenCalledWith('https://wa.me/?text=a%20%26%20b', '_blank', 'noopener,noreferrer')
})

it('copies with the clipboard API or an invisible textarea and reports failure', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  cleanup.push(define(navigator, 'clipboard', { writeText }))
  expect(await copyText('Report')).toBe(true)
  expect(writeText).toHaveBeenCalledWith('Report')
  writeText.mockRejectedValue(new Error('Permission denied'))
  const execCommand = vi.fn(() => document.querySelector('textarea')?.value === 'Fallback')
  cleanup.push(define(document, 'execCommand', execCommand))
  expect(await copyText('Fallback')).toBe(true)
  expect(execCommand).toHaveBeenCalledWith('copy')
  expect(document.querySelector('textarea')).toBeNull()
  expect(await copyText('Denied')).toBe(false)
})
