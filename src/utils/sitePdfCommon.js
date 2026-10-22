import autoTable from 'jspdf-autotable'

// Shared branding for the Phase 7B-2 site PDFs — the same header (logo, name,
// RC number, orange title) and footer as the existing generate*PDF.js reports.

export const ML = 14

export async function drawHeader(doc, title, subtitleLines = []) {
  const W = doc.internal.pageSize.getWidth()
  const mr = W - ML
  try {
    const res = await fetch('/logo.png')
    const blob = await res.blob()
    const b64 = await new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.readAsDataURL(blob)
    })
    doc.addImage(b64, 'PNG', ML, 8, 30, 15)
  } catch { /* no logo */ }

  doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(20)
  doc.text('ABUJA PRECAST CONCRETE', ML + 33, 14)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80)
  doc.text('RC: 1838184', ML + 33, 19)

  // Shrink the title to fit the space right of the company name.
  doc.setFontSize(12); doc.setFont('helvetica', 'bold')
  const room = mr - (ML + 33 + doc.getTextWidth('ABUJA PRECAST CONCRETE') + 6)
  let size = 18
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(size)
  while (size > 10 && doc.getTextWidth(title) > room) { size -= 1; doc.setFontSize(size) }
  doc.setTextColor(245, 166, 35)
  const titleLines = doc.splitTextToSize(title, room)
  doc.text(titleLines, mr, 15, { align: 'right' })
  let y = 15 + (titleLines.length - 1) * size * 0.4 + 7
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(60)
  for (const line of subtitleLines) { doc.text(line, mr, y, { align: 'right' }); y += 4.5 }
  const lineY = Math.max(28, y)
  doc.setDrawColor(180); doc.setLineWidth(0.5); doc.line(ML, lineY, mr, lineY)
  return lineY + 7
}

export function drawFooter(doc, watermark = null) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const mr = W - ML
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    if (watermark) drawWatermark(doc, watermark)
    const footY = H - 10
    doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(ML, footY - 4, mr, footY - 4)
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(120)
    doc.text('ABUJA PRECAST CONCRETE LIMITED · 1, Dutse Alhaji, Off Bwari Expressway, Abuja', W / 2, footY - 1, { align: 'center' })
    doc.text(`Page ${i} of ${pageCount}`, mr, footY - 1, { align: 'right' })
    if (watermark) {
      doc.setFont('helvetica', 'bold'); doc.setTextColor(200, 60, 60)
      doc.text(watermark, W / 2, footY - 6, { align: 'center' })
    }
  }
}

function drawWatermark(doc, text) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const hasG = typeof doc.GState === 'function' && typeof doc.setGState === 'function'
  if (hasG) doc.setGState(new doc.GState({ opacity: 0.12 }))
  doc.setFont('helvetica', 'bold'); doc.setFontSize(40); doc.setTextColor(200, 60, 60)
  doc.text(text, W / 2, H / 2, { align: 'center', angle: 35 })
  if (hasG) doc.setGState(new doc.GState({ opacity: 1 }))
}

// Section heading; starts a new page when too close to the bottom.
export function sectionTitle(doc, title, y) {
  const H = doc.internal.pageSize.getHeight()
  if (y > H - 40) { doc.addPage(); y = 20 }
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(40)
  doc.text(title.toUpperCase(), ML, y)
  return y + 3
}

export function table(doc, { startY, head, body, foot, numericCols = [] }) {
  const columnStyles = Object.fromEntries(numericCols.map(i => [i, { halign: 'right' }]))
  autoTable(doc, {
    startY,
    head: [head],
    body,
    // Foot cells don't pick up columnStyles, so align them here.
    foot: foot && foot.length ? foot.map(r => r.map((c, i) => (numericCols.includes(i) ? { content: c, styles: { halign: 'right' } } : c))) : undefined,
    showFoot: 'lastPage',
    margin: { left: ML, right: ML },
    headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, halign: 'center' },
    bodyStyles: { fontSize: 8.5, textColor: [30, 30, 30] },
    footStyles: { fillColor: [240, 240, 240], textColor: [30, 30, 30], fontStyle: 'bold', fontSize: 8.5 },
    columnStyles,
    tableLineColor: [210, 210, 210],
    tableLineWidth: 0.25,
  })
  return doc.lastAutoTable.finalY + 8
}

// Helvetica has no ₦ glyph; the existing PDFs print naira as "N1,234".
export const pdfNaira = (v) => {
  const x = Number(v) || 0
  const s = Math.abs(x).toLocaleString('en-NG', { minimumFractionDigits: Number.isInteger(x) ? 0 : 2, maximumFractionDigits: 2 })
  return `${x < 0 ? '-' : ''}N${s}`
}
export const pdfQty = (v) => (typeof v === 'number' ? v.toLocaleString('en-NG', { maximumFractionDigits: 2 }) : String(v ?? '—'))
