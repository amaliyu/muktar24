import jsPDF from 'jspdf'
import { ML, drawHeader, drawFooter, sectionTitle, table } from './sitePdfCommon'
import { pdfNaira2 } from './generateSpvClosePDF'
import { monthLabelLong, fmtPct } from './investorPools'

const day = (iso) => (iso ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${String(iso).slice(0, 10)}T12:00:00Z`)) : '—')

// "Monthly investor statement" — one investor, one site, one approved month.
// Draws a model from buildInvestorStatement, which carries only this investor's
// own figures: no other investor's name or amount can reach the page.
export async function generateInvestorStatementPDF(m, { save = true } = {}) {
  if (!m) throw new Error('Nothing to print.')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = await drawHeader(doc, 'MONTHLY INVESTOR STATEMENT', [m.investorName, m.siteName, monthLabelLong(m.month), ...(m.term ? [`Terms: ${m.term}`] : [])])

  y = sectionTitle(doc, 'Your position', y)
  y = table(doc, {
    startY: y,
    head: ['Item', 'Value'],
    body: [
      ['Investor', m.investorName],
      ['Capital at this site', pdfNaira2(m.capital)],
      ['Your capital share this month', fmtPct(m.capitalShare)],
      ['Your amount this month', pdfNaira2(m.amount)],
      ['Paid', m.paid ? `Yes — ${day(m.paidOn)}${m.paidReference ? ` · ${m.paidReference}` : ''}` : 'Not yet paid'],
      ['Cumulative paid to you at this site', pdfNaira2(m.cumulativePaid)],
      ['Multiple of capital received', `${m.multiple.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`],
      ['Current tier', m.currentTier ? m.currentTier.text : '—'],
    ],
    numericCols: [],
  })

  y = sectionTitle(doc, "The site's month", y)
  const body = m.lines.map(l => [l.label, pdfNaira2(l.amount)])
  body.push(['Investor portion (all investors at this site)', pdfNaira2(m.investorPortion)])
  y = table(doc, { startY: y, head: ['Line', 'Amount'], body, numericCols: [1] })

  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(90)
  doc.text('Your share of the investor portion is your capital-days at the site divided by all capital-days in the month. Only amounts actually paid count toward the tier thresholds. The tier above is based on what has been paid to you against your capital.', ML, y, { maxWidth: doc.internal.pageSize.getWidth() - 2 * ML })

  drawFooter(doc)
  const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const filename = `investor-statement-${slug(m.investorName)}-${slug(m.siteName)}-${String(m.month).slice(0, 7)}.pdf`
  if (save) doc.save(filename)
  return { doc, filename }
}
