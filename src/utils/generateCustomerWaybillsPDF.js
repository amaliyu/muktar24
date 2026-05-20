import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${day}-${months[parseInt(m,10)-1]}-${y}`;
}

export async function generateCustomerWaybillsPDF(customer, waybills, fromDate, toDate) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
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
    doc.addImage(b64, 'PNG', ml, 8, 28, 14);
  } catch { /* no logo */ }

  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(20);
  doc.text('ABUJA PRECAST CONCRETE LIMITED', ml + 31, 13);
  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
  doc.text('RC: 1838184  ·  1, Dutse Alhaji, Off Bwari Expressway, Abuja', ml + 31, 18);

  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(245, 166, 35);
  doc.text('CUSTOMER WAYBILL REPORT', mr, 13, { align: 'right' });

  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(20);
  doc.text((customer.name || '—').toUpperCase(), mr, 20, { align: 'right' });

  const period = (fromDate || toDate)
    ? `${fromDate ? fmtDate(fromDate) : 'All time'} — ${toDate ? fmtDate(toDate) : 'Present'}`
    : 'All Time';
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
  doc.text(`Period: ${period}`, mr, 26, { align: 'right' });

  doc.setDrawColor(180); doc.setLineWidth(0.5); doc.line(ml, 30, mr, 30);

  // ── TABLE ─────────────────────────────────────────────────────
  const tableBody = waybills.map(w => [
    w.waybill_number || '—',
    fmtDate(w.waybill_date),
    w.block_type || '—',
    { content: Number(w.quantity_loaded || 0).toLocaleString(), styles: { halign: 'right' } },
    { content: Number(w.quantity_received || 0).toLocaleString(), styles: { halign: 'right', textColor: [34, 150, 100], fontStyle: 'bold' } },
    { content: String(w.quantity_damaged || 0), styles: { halign: 'right', textColor: (w.quantity_damaged || 0) > 0 ? [200, 50, 50] : [100, 100, 100] } },
    w.driver?.full_name || '—',
    w.truck_number || '—',
    w.batch_number || '—',
  ]);

  autoTable(doc, {
    startY: 34,
    head: [['Waybill No.', 'Date', 'Product / Block Type', 'Loaded', 'Received', 'Damaged', 'Driver', 'Truck / Plate', 'Batch No.']],
    body: tableBody.length > 0 ? tableBody : [['—','—','No waybills in selected period','—','—','—','—','—','—']],
    margin: { left: ml, right: 14 },
    headStyles: { fillColor: [25, 25, 25], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, halign: 'center' },
    bodyStyles: { fontSize: 8.5, textColor: [25, 25, 25] },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 45 },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 20, halign: 'right' },
      6: { cellWidth: 35 },
      7: { cellWidth: 28 },
      8: { cellWidth: 28 },
    },
    tableLineColor: [210, 210, 210],
    tableLineWidth: 0.25,
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const row = waybills[data.row.index];
      if (!row) return;
      if (data.column.index === 4) data.cell.styles.textColor = [34, 150, 100];
      if (data.column.index === 5 && (row.quantity_damaged || 0) > 0) data.cell.styles.textColor = [200, 50, 50];
    },
  });

  const tableEndY = doc.lastAutoTable.finalY + 8;

  // ── SUMMARY BOX ───────────────────────────────────────────────
  const totalLoaded   = waybills.reduce((s, w) => s + (w.quantity_loaded   || 0), 0);
  const totalReceived = waybills.reduce((s, w) => s + (w.quantity_received || 0), 0);
  const totalDamaged  = waybills.reduce((s, w) => s + (w.quantity_damaged  || 0), 0);
  const damageRate    = totalLoaded > 0 ? ((totalDamaged / totalLoaded) * 100).toFixed(1) : '0.0';

  const boxH = 30;
  doc.setFillColor(248, 248, 252);
  doc.setDrawColor(200, 200, 220);
  doc.setLineWidth(0.4);
  doc.roundedRect(ml, tableEndY, mr - ml, boxH, 2, 2, 'FD');

  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(80);
  doc.text('SUMMARY', ml + 4, tableEndY + 7);

  const cols = mr - ml - 8;
  const colW = cols / 4;
  const summaryItems = [
    { label: 'TOTAL TRIPS', value: String(waybills.length), color: [30, 30, 30] },
    { label: 'TOTAL LOADED', value: Number(totalLoaded).toLocaleString() + ' blocks', color: [180, 100, 0] },
    { label: 'TOTAL RECEIVED', value: Number(totalReceived).toLocaleString() + ' blocks', color: [34, 150, 100] },
    { label: 'TRANSIT DAMAGED', value: `${Number(totalDamaged).toLocaleString()} blocks (${damageRate}%)`, color: totalDamaged > 0 ? [200, 50, 50] : [100, 100, 100] },
  ];

  summaryItems.forEach(({ label, value, color }, i) => {
    const cx = ml + 4 + i * colW;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120);
    doc.text(label, cx, tableEndY + 15);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...color);
    doc.text(value, cx, tableEndY + 24);
  });

  // ── FOOTER ────────────────────────────────────────────────────
  const footY = doc.internal.pageSize.getHeight() - 10;
  doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(ml, footY - 3, mr, footY - 3);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(130);
  doc.text('ABUJA PRECAST CONCRETE LIMITED  ·  Tel: 09055541433, 07030647949  ·  iabujaprecast@gmail.com', W / 2, footY + 1, { align: 'center' });

  const fname = `Waybills_${(customer.name || 'customer').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fname);
}
