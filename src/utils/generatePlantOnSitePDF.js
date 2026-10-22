import jsPDF from 'jspdf'
import { drawHeader, drawFooter, sectionTitle, table, pdfQty } from './sitePdfCommon'
import { shortDate } from './weeklySiteReport'

// "Plant on site" list for a client site — the APCL / investor equipment there,
// for demobilisation and removal (Sequoia §10). Quantities only: no cost or
// pool reference is ever drawn, whatever the caller passes.
export async function generatePlantOnSitePDF({ siteName, date, assets }, { save = true } = {}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const title = `APCL plant and equipment at ${siteName} — ${shortDate(date)}`
  let y = await drawHeader(doc, 'PLANT ON SITE', [siteName, shortDate(date)])

  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(20)
  const lines = doc.splitTextToSize(title, doc.internal.pageSize.getWidth() - 28)
  doc.text(lines, 14, y)
  y += lines.length * 5 + 4

  const rows = assets.filter(a => a.status !== 'retired')
  y = sectionTitle(doc, 'Items', y)
  if (!rows.length) {
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(40)
    doc.text('No APCL plant or equipment recorded at this site.', 14, y + 3)
    y += 10
  } else {
    const body = rows.map((a, i) => [
      String(i + 1), a.code || '—', a.name, cap(a.category), pdfQty(Number(a.quantity) || 0),
      a.serial_or_tag || '—', a.funding_source === 'investor' ? 'Investor' : 'APCL', cap(a.condition),
    ])
    y = table(doc, {
      startY: y,
      head: ['#', 'Code', 'Item', 'Category', 'Qty', 'Serial / tag', 'Owner', 'Condition'],
      body,
      // No grand total of quantity: it would add machines to pallets.
      foot: [['', '', `${rows.length} item${rows.length === 1 ? '' : 's'}`, '', '', '', '', '']],
      numericCols: [4],
    })
  }

  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(90)
  doc.text('All items listed are the property of APCL or its investment vehicle and are to be released for removal on demobilisation.', 14, y, { maxWidth: doc.internal.pageSize.getWidth() - 28 })
  y += 14
  doc.setTextColor(40)
  doc.text('Checked by APCL: ______________________   Date: ____________', 14, y)
  doc.text('Client representative: __________________   Date: ____________', 14, y + 8)

  drawFooter(doc)
  const slug = String(siteName || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const filename = `plant-on-site-${slug}-${date}.pdf`
  if (save) doc.save(filename)
  return { doc, filename }
}

const cap = (s) => (s ? String(s).replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) : '—')
