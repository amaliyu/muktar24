import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IconButton } from './Ico'

describe('IconButton', () => {
  it('keeps its action label, styling and minimum target even with smaller supplied dimensions', () => {
    render(<IconButton aria-label="Delete receipt RCP-0012" style={{ color: 'red', minWidth: 16, minHeight: 16 }}>X</IconButton>)
    const button = screen.getByRole('button', { name: 'Delete receipt RCP-0012' })
    expect(button).toHaveStyle({ 'min-width': '44px', 'min-height': '44px', color: 'rgb(255, 0, 0)' })
    expect(button).toHaveAttribute('type', 'button')
  })

  it('supports Enter and Space without submitting an enclosing form', async () => {
    const user = userEvent.setup()
    const close = vi.fn()
    const submit = vi.fn(e => e.preventDefault())
    render(<form onSubmit={submit}><IconButton aria-label="Close" onClick={close}>X</IconButton></form>)
    await user.tab()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(close).toHaveBeenCalledTimes(2)
    expect(submit).not.toHaveBeenCalled()
  })
})
