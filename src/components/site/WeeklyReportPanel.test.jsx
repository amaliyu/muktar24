import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
const fetchMock = vi.hoisted(() => vi.fn())
const pdfMock = vi.hoisted(() => vi.fn(async () => ({ filename: 'x.pdf' })))
vi.mock('../../services/siteReports', () => ({ fetchWeeklyReportData: fetchMock }))
vi.mock('../../utils/generateWeeklySiteReportPDF', () => ({ generateWeeklySiteReportPDF: pdfMock }))

import WeeklyReportPanel from './WeeklyReportPanel'

const contract = { id: 'k1', site_id: 'kado', client_name: 'Sequoia Projects Limited', contract_model: 'full_supply' }
const site = { id: 'kado', name: 'Kado Site (Sequoia)' }
const empty = { cycles: [], forecasts: [], production: [], damages: [], handovers: [], receipts: [], items: [], movements: [], expenses: [] }

describe('WeeklyReportPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('a failed fetch is shown and no PDF is made (Rule 10.5)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('permission denied for table production_log'))
    render(<WeeklyReportPanel contract={contract} site={site} userProfile={{ role: 'md', effectiveRoles: ['md'] }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Client PDF' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Report not generated.*permission denied for table production_log/)
    expect(pdfMock).not.toHaveBeenCalled()
  })

  it('an empty week still produces a PDF; internal is offered only to md / ico', async () => {
    fetchMock.mockResolvedValueOnce(empty)
    const { unmount } = render(<WeeklyReportPanel contract={contract} site={site} userProfile={{ role: 'production_manager', effectiveRoles: ['production_manager'] }} />)
    expect(screen.queryByRole('button', { name: 'Internal PDF' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Client PDF' }))
    expect(await screen.findByRole('status')).toHaveTextContent('No production recorded this week.')
    expect(pdfMock.mock.calls[0][0].version).toBe('client')
    expect(fetchMock.mock.calls[0][0].internal).toBe(false)
    unmount()
    render(<WeeklyReportPanel contract={contract} site={site} userProfile={{ role: 'ico', effectiveRoles: ['ico'] }} />)
    expect(screen.getByRole('button', { name: 'Internal PDF' })).toBeInTheDocument()
  })
})
