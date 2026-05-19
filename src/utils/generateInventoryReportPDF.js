import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export async function generateInventoryReportPDF(items, movements, { from, to } = {}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W  = doc.internal.pageSize.getWidth();
  const ml = 14;
  const mr = W - 14;

  // ── LOGO + HEADER ─────────────────────────────────────────────
  try {
    const res  = await fetch('/logo.png');
    const blob = await res.blob();
    const b64  = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
    doc.addImage(b64, 'PNG', ml, 8, 30, 15);
  } catch { /* no logo */ }

  doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(20);
  doc.text('ABUJA PRECAST CONCRETE', ml + 33, 14);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
  doc.text('RC: 1838184', ml + 33, 19);

  doc.setFontSize(20); doc.setFont('helvetica', 'bold'); doc.setTextColor(245, 166, 35);
  doc.text('INVENTORY REPORT', mr, 15, { align: 'right' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(60);
  const dateRange = from || to
    ? `Period: ${from || 'all time'} → ${to || 'present'}`
    : `Generated: ${new Date().toISOString().split('T')[0]}`;
  doc.text(dateRange, mr, 22, { align: 'right' });
  doc.setDrawColor(180); doc.setLineWidth(0.5); doc.line(ml, 28, mr, 28);

  // ── LOW STOCK ALERTS ─────────────────────────────────────────
  const lowStock = items.filter(i => Number(i.current_stock) <= Number(i.reorder_level));
  let curY = 35;
  if (lowStock.length > 0) {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(200, 60, 60);
    doc.text(`⚠ ${lowStock.length} ITEM${lowStock.length > 1 ? 'S' : ''} BELOW REORDER LEVEL`, ml, curY);
    curY += 4;
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 50, 50);
    doc.text(lowStock.map(i => i.name).join(', '), ml, curY, { maxWidth: W - 28 });
    curY += 8;
    doc.setDrawColor(200, 60, 60); doc.setLineWidth(0.3); doc.line(ml, curY, mr, curY);
    curY += 5;
  }

  // ── STOCK LEVELS TABLE ────────────────────────────────────────
  const N = (n) => `N${Math.round(Number(n) || 0).toLocaleString()}`;
  const totalValue = items.reduce((s, i) => s + (Number(i.current_stock) * Number(i.unit_cost || 0)), 0);

  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(40);
  doc.text('CURRENT STOCK LEVELS', ml, curY);
  curY += 4;

  const itemRows = items.map(i => {
    const value = Number(i.current_stock) * Number(i.unit_cost || 0);
    const isLow = Number(i.current_stock) <= Number(i.reorder_level);
    return [
      { content: i.name, styles: { fontStyle: isLow ? 'bold' : 'normal', textColor: isLow ? [200, 60, 60] : [30, 30, 30] } },
      i.unit,
      { content: Number(i.current_stock).toLocaleString(), styles: { halign: 'right', textColor: isLow ? [200, 60, 60] : [30, 30, 30] } },
      { content: Number(i.reorder_level).toLocaleString(), styles: { halign: 'right' } },
      { content: N(i.unit_cost), styles: { halign: 'right' } },
      { content: N(value), styles: { halign: 'right', fontStyle: 'bold' } },
      i.supplier || '—',
    ];
  });

  itemRows.push([
    { content: 'TOTAL STOCK VALUE', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', textColor: [40, 40, 40] } },
    { content: N(totalValue), styles: { halign: 'right', fontStyle: 'bold', textColor: [180, 100, 0] } },
    '',
  ]);

  autoTable(doc, {
    startY: curY,
    head: [['Item', 'Unit', 'On Hand', 'Reorder', 'Unit Cost', 'Value', 'Supplier']],
    body: itemRows,
    margin: { left: ml, right: 14 },
    headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, halign: 'center' },
    bodyStyles: { fontSize: 8.5, textColor: [30, 30, 30] },
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: 16, halign: 'center' },
      2: { cellWidth: 20, halign: 'right' },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 26, halign: 'right' },
      6: { cellWidth: 40 },
    },
    tableLineColor: [210, 210, 210],
    tableLineWidth: 0.25,
  });

  // ── MOVEMENT HISTORY ─────────────────────────────────────────
  if (movements.length > 0) {
    const movY = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(40);
    doc.text('STOCK MOVEMENT HISTORY', ml, movY);

    const movRows = movements.slice(0, 200).map(m => [
      m.date,
      { content: m.movement_type === 'in' ? 'IN' : 'OUT', styles: { halign: 'center', fontStyle: 'bold', textColor: m.movement_type === 'in' ? [30, 160, 100] : [200, 60, 60] } },
      m.item?.name || '—',
      { content: Number(m.quantity).toLocaleString(), styles: { halign: 'right' } },
      m.item?.unit || '',
      m.movement_type === 'in' ? (m.supplier || '—') : (m.issued_to || '—'),
      m.staff_name || '—',
    ]);

    autoTable(doc, {
      startY: movY + 3,
      head: [['Date', 'Type', 'Item', 'Qty', 'Unit', 'From/To', 'Staff']],
      body: movRows,
      margin: { left: ml, right: 14 },
      headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, halign: 'center' },
      bodyStyles: { fontSize: 8, textColor: [30, 30, 30] },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 14, halign: 'center' },
        2: { cellWidth: 36 },
        3: { cellWidth: 16, halign: 'right' },
        4: { cellWidth: 14, halign: 'center' },
        5: { cellWidth: 38 },
        6: { cellWidth: 32 },
      },
      tableLineColor: [210, 210, 210],
      tableLineWidth: 0.25,
    });
  }

  // ── FOOTER ────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const footY = doc.internal.pageSize.getHeight() - 10;
    doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(ml, footY - 4, mr, footY - 4);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(120);
    doc.text('ABUJA PRECAST CONCRETE LIMITED · 1, Dutse Alhaji, Off Bwari Expressway, Abuja', W / 2, footY - 1, { align: 'center' });
    doc.text(`Page ${i} of ${pageCount}`, mr, footY - 1, { align: 'right' });
  }

  const filename = from || to ? `inventory-report-${from || 'all'}-to-${to || 'now'}.pdf` : `inventory-report-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}
