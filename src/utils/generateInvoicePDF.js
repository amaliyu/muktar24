import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export async function generateInvoicePDF(invoice, order) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();   // 210mm
  const ml = 14;                                 // left margin
  const mr = W - 14;                             // right edge
  const mid = W / 2;                             // 105mm midpoint
  const colW = (W - 28) / 2;                    // each column = 91mm

  // ── HEADER ────────────────────────────────────────────────────
  // Left: Logo
  try {
    const res = await fetch('/logo.png');
    const blob = await res.blob();
    const b64 = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
    doc.addImage(b64, 'PNG', ml, 8, 30, 15);
  } catch { /* continue without logo */ }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20);
  doc.text('ABUJA PRECAST CONCRETE', ml + 33, 14);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text('RC: 1838184', ml + 33, 19);

  // Right: INVOICE + number + date
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(245, 166, 35);
  doc.text('INVOICE', mr, 15, { align: 'right' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(40);
  doc.text(`No: ${String(invoice.invoice_number || '—')}`, mr, 21, { align: 'right' });
  doc.text(`Date: ${String(invoice.issued_date || new Date().toISOString().split('T')[0])}`, mr, 26, { align: 'right' });

  // Header rule
  doc.setDrawColor(180);
  doc.setLineWidth(0.5);
  doc.line(ml, 30, mr, 30);

  // ── BILL TO / FOR SUPPLY ──────────────────────────────────────
  let leftY = 37;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(140);
  doc.text('BILL TO:', ml, leftY);
  leftY += 5;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20);
  doc.text(String(order.customer?.name || '—'), ml, leftY);
  leftY += 5;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(70);
  if (order.customer?.location) { doc.text(order.customer.location, ml, leftY); leftY += 5; }
  if (order.customer?.phone)    { doc.text(order.customer.phone,    ml, leftY); leftY += 5; }

  // Right: supply description
  const supplyText = 'FOR SUPPLY AND LOADING OF HOLLOW CONCRETE BLOCKS AND INTERLOCKS';
  const supplyLines = doc.splitTextToSize(supplyText, colW - 6);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20);
  doc.text(supplyLines, mid + 5, 37);

  const billEndY = Math.max(leftY, 37 + supplyLines.length * 4.5) + 4;

  doc.setDrawColor(200);
  doc.setLineWidth(0.3);
  doc.line(ml, billEndY, mr, billEndY);

  // ── ITEMS TABLE ───────────────────────────────────────────────
  const items = order.order_items || [];
  const subtotal   = items.reduce((s, i) => s + Number(i.subtotal ?? i.quantity * i.unit_price), 0);
  const vat        = subtotal * 0.075;
  const grandTotal = subtotal + vat;

  const tableRows = items.map(item => [
    `${item.block_type} Hollow Concrete Blocks`,
    Number(item.quantity).toLocaleString(),
    `N${Number(item.unit_price).toLocaleString()}`,
    `N${Number(item.subtotal ?? item.quantity * item.unit_price).toLocaleString()}`,
  ]);

  // Subtotal / VAT / Grand Total rows
  const spanRight = (label, value, bold, color) => ([
    { content: label, colSpan: 3, styles: { halign: 'right', fontStyle: bold ? 'bold' : 'normal', textColor: color || [40, 40, 40] } },
    { content: value, styles: { halign: 'right', fontStyle: bold ? 'bold' : 'normal', textColor: color || [40, 40, 40] } },
  ]);

  autoTable(doc, {
    startY: billEndY + 3,
    head: [['DETAILS', 'QUANTITY', 'RATE (N)', 'AMOUNT (N)']],
    body: [
      ...tableRows,
      spanRight('SUBTOTAL', `N${Math.round(subtotal).toLocaleString()}`),
      spanRight('VAT (7.5%)', `N${Math.round(vat).toLocaleString()}`),
      spanRight('GRAND TOTAL', `N${Math.round(grandTotal).toLocaleString()}`, true, [180, 100, 0]),
    ],
    margin: { left: ml, right: 14 },
    headStyles: {
      fillColor: [30, 30, 30],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'center',
    },
    bodyStyles: { fontSize: 10, textColor: [30, 30, 30] },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 24, halign: 'center' },
      2: { cellWidth: 30, halign: 'right' },
      3: { cellWidth: 36, halign: 'right' },
    },
    tableLineColor: [210, 210, 210],
    tableLineWidth: 0.25,
  });

  const tableEndY = doc.lastAutoTable.finalY + 6;

  // ── IMPORTANT NOTICES + AUTHORISED BY ────────────────────────
  const notices = [
    'Invoice valid for 48 HOURS from date of issue. After this, invoice becomes void.',
    'All prices are inclusive of VAT at 7.5%.',
    'No refunds except for reasonable and justifiable cause, submitted in writing within 48 hours of delivery.',
    'Block prices are fixed after payment. Delivery costs are subject to change without notice.',
    'If delivery is not requested within 2 months of payment, material prices are subject to review.',
    'Payment must be confirmed before delivery commences.',
  ];

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40);
  doc.text('IMPORTANT NOTICES:', ml, tableEndY + 5);

  let noticeY = tableEndY + 10;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(55);
  notices.forEach((text, i) => {
    const lines = doc.splitTextToSize(`${i + 1}. ${text}`, colW - 4);
    doc.setFontSize(7.5);
    doc.text(lines, ml, noticeY);
    noticeY += lines.length * 3.8 + 1.5;
  });

  // Right column: AUTHORISED BY box
  const authX    = mid + 5;
  const authBoxY = tableEndY + 5;
  const authBoxH = noticeY - authBoxY + 2;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40);
  doc.text('AUTHORISED BY:', authX, tableEndY + 5);

  doc.setDrawColor(170);
  doc.setLineWidth(0.4);
  doc.rect(authX, authBoxY + 6, colW - 6, Math.max(authBoxH - 6, 28));

  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(190);
  const boxMidX = authX + (colW - 6) / 2;
  const boxMidY = authBoxY + 6 + Math.max(authBoxH - 6, 28) / 2;
  doc.text('Stamp & Signature', boxMidX, boxMidY, { align: 'center' });

  const sectionEndY = noticeY + 4;

  // ── PAYMENT DETAILS ───────────────────────────────────────────
  doc.setDrawColor(180);
  doc.setLineWidth(0.4);
  doc.line(ml, sectionEndY, mr, sectionEndY);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40);
  doc.text('PAYMENT DETAILS', ml, sectionEndY + 6);

  const labelX  = ml;
  const valueX  = ml + 32;
  const payRowH = 5;
  let payY = sectionEndY + 12;

  [
    ['Account Name:', 'ABUJA PRECAST CONCRETE LTD'],
    ['Bank:',         'TAJ BANK PLC'],
    ['Account No:',   '0001732895'],
  ].forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80);
    doc.setFontSize(9);
    doc.text(label, labelX, payY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20);
    doc.text(value, valueX, payY);
    payY += payRowH;
  });

  // ── FOOTER ────────────────────────────────────────────────────
  const footerY = payY + 6;
  doc.setDrawColor(200);
  doc.setLineWidth(0.3);
  doc.line(ml, footerY, mr, footerY);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(245, 166, 35);
  doc.text('THANK YOU FOR YOUR PATRONAGE!', W / 2, footerY + 7, { align: 'center' });

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(90);
  doc.text(
    '1, Dutse Alhaji, Behind Tipper Garage, Beside Istanbul Quarry, Off Bwari Expressway, Bmuko Village, Abuja, Nigeria.',
    W / 2, footerY + 13, { align: 'center' }
  );
  doc.text(
    'Tel: 09055541433, 07030647949   |   Email: iabujaprecast@gmail.com',
    W / 2, footerY + 18, { align: 'center' }
  );

  doc.save(`${invoice.invoice_number || 'invoice'}.pdf`);
}
