import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import ShareActions from './ShareActions'
import * as share from '../utils/share'

vi.mock('../lib/supabase', () => ({ supabase: {} }))

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); delete navigator.share })

it('shows native share and copies with a three-second confirmation', async () => {
  vi.useFakeTimers()
  Object.defineProperty(navigator, 'share', { value: vi.fn().mockResolvedValue(undefined), configurable: true })
  vi.spyOn(share, 'copyText').mockResolvedValue(true)
  const onShared = vi.fn()
  render(<ShareActions text="My report" title="Report" label="Share report" onShared={onShared} />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Share report' })))
  expect(navigator.share).toHaveBeenCalledWith({ title: 'Report', text: 'My report' })
  expect(onShared).toHaveBeenCalledWith('My report')
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy text' })))
  expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  act(() => vi.advanceTimersByTime(3000))
  expect(screen.getByRole('button', { name: 'Copy text' })).toBeInTheDocument()
})

it('shows selectable text on copy failure and does not log cancellation', async () => {
  Object.defineProperty(navigator, 'share', { value: vi.fn().mockRejectedValue({ name: 'AbortError' }), configurable: true })
  vi.spyOn(share, 'copyText').mockResolvedValue(false)
  const onShared = vi.fn()
  render(<ShareActions text="My report" onShared={onShared} />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Share' })))
  expect(onShared).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Copy text' }))
  const field = await screen.findByRole('textbox', { name: 'Could not copy — select the text' })
  expect(field).toHaveAttribute('readonly')
  expect(field).toHaveValue('My report')
})
