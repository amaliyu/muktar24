import jsPDF from 'jspdf'
import { ML, drawHeader, drawFooter, sectionTitle, table } from './sitePdfCommon'
import { monthLabelLong, fmtPct } from './investorPools'

// Helvetica has no ₦ glyph; the existing PDFs print naira as "N1,234". The
// investor PDFs always show kobo.
export const pdfNaira2 = (v) => {
  const x = Number(v) || 0
  return `${x < 0 ? '-' : ''}N${Math.abs(x).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
const day = (iso) => (iso ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) : '—')

// "Monthly SPV close" — INTERNAL (md, accountant, ico). Draws a model from
// buildCloseStatement: every line, every investor. No figure is computed here.
export async function generateSpvClosePDF({ statement: st, siteName, termLabel, computedAt, approvedAt }, { save = true } = {}) {
  if (!st) throw new Error('Nothing to print: compute the month first.')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const status = st.status === 'approved' ? 'Approved' : st.status === 'draft' ? 'DRAFT — not approved' : 'Voided'
  let y = await drawHeader(doc, 'MONTHLY SPV CLOSE', [siteName, monthLabelLong(st.month), `Terms: ${termLabel}`, status])

  y = sectionTitle(doc, 'Statement', y)
  const body = st.lines.map(l => [l.label, pdfNaira2(l.amount)])
  body.push([`${st.excluded.label} (${st.excluded.note})`, pdfNaira2(st.excluded.amount)])
  body.push(['ICA (investors\' capital at month end)', pdfNaira2(st.ica)])
  body.push(['Investors already paid before this month', pdfNaira2(st.investorsPaidBefore)])
  y = table(doc, { startY: y, head: ['Line', 'Amount'], body, numericCols: [1] })

  if (st.banner) {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(180, 40, 40)
    const w = doc.splitTextToSize(st.banner, doc.internal.pageSize.getWidth() - 2 * ML)
    doc.text(w, ML, y); y += w.length * 4.5 + 4
  }

  y = sectionTitle(doc, 'Waterfall', y)
  y = table(doc, {
    startY: y,
    head: ['Tier', 'NDC in tier', 'Investors', 'APCL'],
    body: st.tiers.length ? st.tiers.map(t => [t.text, pdfNaira2(t.ndc_in_tier), pdfNaira2(t.investor), pdfNaira2(t.apcl)]) : [['Nothing to split this month', '', '', '']],
    foot: [['Investor portion / APCL operator share', '', pdfNaira2(st.investorPortion), pdfNaira2(st.apclOperatorShare)]],
    numericCols: [1, 2, 3],
  })

  y = sectionTitle(doc, 'Lines', y)
  y = table(doc, {
    startY: y,
    head: ['Name', 'Capital share', 'Amount', 'Paid'],
    body: st.investorLines.length
      ? st.investorLines.map(l => [l.name, l.capital_share == null ? '—' : fmtPct(l.capital_share), pdfNaira2(l.amount), l.paid ? `${day(l.paid_on)}${l.paid_reference ? ` · ${l.paid_reference}` : ''}` : 'Unpaid'])
      : [['No distribution lines', '', '', '']],
    numericCols: [1, 2],
  })

  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(90)
  doc.text(`Computed ${day(computedAt)}${approvedAt ? ` · approved ${day(approvedAt)}` : ''}. Only distributions actually paid count toward the tier thresholds.`, ML, y, { maxWidth: doc.internal.pageSize.getWidth() - 2 * ML })

  drawFooter(doc, 'INTERNAL')
  const slug = (siteName || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const filename = `spv-close-${slug}-${String(st.month).slice(0, 7)}-INTERNAL.pdf`
  if (save) doc.save(filename)
  return { doc, filename }
}
