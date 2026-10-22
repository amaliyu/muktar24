import jsPDF from 'jspdf'
import { ML, drawHeader, drawFooter, sectionTitle, table, pdfNaira, pdfQty } from './sitePdfCommon'
import { moneyCells } from './weeklySiteReport'

// Draws a model from buildWeeklySiteReport — no figures are computed here.
// Guard: a client model for a full-supply contract must carry no money cells;
// if one ever appears the PDF is refused rather than sent to a client.
export async function generateWeeklySiteReportPDF(model, { contractModel, save = true } = {}) {
  if (model.version === 'client' && contractModel === 'full_supply' && moneyCells(model).length) {
    throw new Error('Client report blocked: it contains naira amounts for a full-supply contract.')
  }
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const cell = (v) => (v && typeof v === 'object' && 'money' in v ? pdfNaira(v.money) : pdfQty(v))

  let y = await drawHeader(doc, model.title, [model.clientName || '', model.siteName || '', `Week: ${model.weekLabel}`])

  for (const s of model.sections) {
    if (s.id === 'header') {
      y = sectionTitle(doc, 'Report details', y)
      y = table(doc, { startY: y, head: ['Client', 'Site', 'Contract ref', 'Week'], body: [s.items.map(i => cell(i.value))] })
      continue
    }
    y = sectionTitle(doc, s.title, y)
    if (s.kind === 'text') {
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(40)
      const lines = doc.splitTextToSize(s.text, W - 2 * ML)
      doc.text(lines, ML, y + 3)
      y += 3 + lines.length * 4.5 + 5
    } else if (s.kind === 'table') {
      y = table(doc, { startY: y, head: s.head, body: s.rows.map(r => r.map(cell)), foot: (s.foot || []).map(r => r.map(cell)), numericCols: s.numericCols })
    } else if (s.kind === 'facts') {
      y = table(doc, { startY: y, head: ['Item', 'Value'], body: s.items.map(i => [i.label, cell(i.value)]), numericCols: [1] })
    }
    const extra = [...(s.note ? [s.note] : []), ...(s.lines || [])]
    if (extra.length) {
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(90)
      y -= 4
      for (const line of extra) {
        const wrapped = doc.splitTextToSize(line, W - 2 * ML)
        if (y + wrapped.length * 4 > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); y = 20 }
        doc.text(wrapped, ML, y)
        y += wrapped.length * 4
      }
      y += 5
    }
  }

  drawFooter(doc, model.watermark)
  const slug = (model.siteName || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const filename = `weekly-site-report-${slug}-${model.week.from}${model.version === 'internal' ? '-INTERNAL' : ''}.pdf`
  if (save) doc.save(filename)
  return { doc, filename }
}
