import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export async function generateWaybillPDF(waybill) {
  // waybill: { waybill_number, date, customer_name, customer_location,
  //            block_type, quantity_loaded, batch_number, driver_name,
  //            truck_number, notes }
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

  doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(245, 166, 35);
  doc.text('WAYBILL', mr, 14, { align: 'right' });
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(40);
  doc.text(String(waybill.waybill_number || '—'), mr, 21, { align: 'right' });

  doc.setDrawColor(180); doc.setLineWidth(0.5); doc.line(ml, 28, mr, 28);

  // ── DELIVERY DETAILS ─────────────────────────────────────────
  const rowH = 9;
  let y = 35;

  const field = (label, value, x, width) => {
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(140);
    doc.text(label, x, y);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(20);
    doc.text(String(value || '—'), x, y + 5);
  };

  const half = (W - 28) / 2;
  field('DATE', waybill.date || new Date().toISOString().split('T')[0], ml, half);
  field('WAYBILL NO.', waybill.waybill_number, ml + half + 6, half);
  y += rowH + 4;

  field('CUSTOMER / RECIPIENT', waybill.customer_name, ml, half * 2);
  y += rowH + 4;

  field('DELIVERY LOCATION', waybill.customer_location, ml, half * 2);
  y += rowH + 4;

  doc.setDrawColor(220); doc.setLineWidth(0.3); doc.line(ml, y, mr, y);
  y += 5;

  // ── GOODS TABLE ───────────────────────────────────────────────
  autoTable(doc, {
    startY: y,
    head: [['Block Type', 'Batch No.', 'Quantity Loaded', 'Unit', 'Notes']],
    body: [[
      waybill.block_type || '—',
      waybill.batch_number || '—',
      { content: String(Number(waybill.quantity_loaded || 0).toLocaleString()), styles: { fontStyle: 'bold', halign: 'right', fontSize: 12 } },
      'blocks',
      waybill.notes || '',
    ]],
    margin: { left: ml, right: 14 },
    headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 10, textColor: [20, 20, 20] },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 35 },
      2: { cellWidth: 35, halign: 'right' },
      3: { cellWidth: 20 },
      4: { cellWidth: 52 },
    },
    tableLineColor: [210, 210, 210],
    tableLineWidth: 0.25,
  });

  y = doc.lastAutoTable.finalY + 10;

  // ── DRIVER / TRUCK ────────────────────────────────────────────
  field('DRIVER NAME', waybill.driver_name, ml, half);
  field('TRUCK / PLATE NO.', waybill.truck_number, ml + half + 6, half);
  y += rowH + 6;

  doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(ml, y, mr, y);
  y += 6;

  // ── SIGNATURE BLOCKS ─────────────────────────────────────────
  const sigW = (W - 28 - 12) / 3;
  const sigs = [
    { label: 'LOADED BY (Store Officer)', name: '' },
    { label: 'DRIVER SIGNATURE', name: '' },
    { label: 'RECEIVED BY (Customer)', name: '' },
  ];

  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(40);
  sigs.forEach((sig, i) => {
    const sx = ml + i * (sigW + 6);
    doc.text(sig.label, sx, y);
    doc.setDrawColor(180); doc.setLineWidth(0.4);
    doc.rect(sx, y + 3, sigW, 28);
    doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(180);
    doc.text('Sign & Date', sx + sigW / 2, y + 20, { align: 'center' });
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
    doc.text('Name: ___________________________', sx, y + 35);
  });

  y += 50;

  // ── IMPORTANT NOTICE ─────────────────────────────────────────
  doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(ml, y, mr, y);
  y += 5;
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(60);
  doc.text('IMPORTANT:', ml, y);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
  const notice = 'Please count and verify all blocks before signing. Any shortage or damage must be noted on this waybill. ' +
    'This signed waybill serves as proof of delivery. Return signed copy to: Abuja Precast Concrete Limited, 1 Dutse Alhaji, Abuja.';
  const noticeLines = doc.splitTextToSize(notice, W - 28);
  doc.text(noticeLines, ml, y + 4);

  // ── FOOTER ────────────────────────────────────────────────────
  const footY = doc.internal.pageSize.getHeight() - 10;
  doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(ml, footY - 4, mr, footY - 4);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(120);
  doc.text('ABUJA PRECAST CONCRETE LIMITED · Tel: 09055541433, 07030647949 · iabujaprecast@gmail.com', W / 2, footY - 1, { align: 'center' });

  doc.save(`${waybill.waybill_number || 'waybill'}.pdf`);
}
