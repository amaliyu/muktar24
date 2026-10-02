import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// invoiceData: { invoice_number, issued_date, due_date, items:[{description,quantity,unit_price}],
//                delivery_cost, include_vat, discount }
// customer: { name, location, phone }
export async function generateInvoicePDF(invoiceData, customer) {
  const {
    invoice_number,
    issued_date,
    items = [],
    delivery_cost = 0,
    include_vat = true,
    discount = 0,
    status = 'issued',
  } = invoiceData;

  // A draft is a quotation → render as a PROFORMA INVOICE. Issued/paid render
  // the normal INVOICE. Same generator, one branch on status.
  const isProforma = status === 'draft';

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W   = doc.internal.pageSize.getWidth();
  const ml  = 14;
  const mr  = W - 14;
  const mid = W / 2;
  const colW = (W - 28) / 2;

  // ── HEADER ────────────────────────────────────────────────────
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

  doc.setFont('helvetica', 'bold'); doc.setTextColor(245, 166, 35);
  doc.setFontSize(isProforma ? 15 : 22);
  doc.text(isProforma ? 'PROFORMA INVOICE' : 'INVOICE', mr, 15, { align: 'right' });

  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(40);
  doc.text(`No: ${String(invoice_number || '—')}`, mr, 21, { align: 'right' });
  doc.text(`Date: ${String(issued_date || new Date().toISOString().split('T')[0])}`, mr, 26, { align: 'right' });

  doc.setDrawColor(180); doc.setLineWidth(0.5); doc.line(ml, 30, mr, 30);

  // Proforma disclaimer — a quotation is not a demand for payment.
  if (isProforma) {
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(200, 50, 50);
    doc.text('This is a proforma invoice and is not a demand for payment.', W / 2, 34.5, { align: 'center' });
  }

  // ── BILL TO ───────────────────────────────────────────────────
  let leftY = 37;
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(140);
  doc.text('BILL TO:', ml, leftY); leftY += 5;

  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(20);
  doc.text(String(customer?.name || '—'), ml, leftY); leftY += 5;

  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(70);
  if (customer?.location) { doc.text(customer.location, ml, leftY); leftY += 5; }
  if (customer?.phone)    { doc.text(customer.phone,    ml, leftY); leftY += 5; }

  const supplyText  = 'FOR SUPPLY AND LOADING OF HOLLOW CONCRETE BLOCKS AND INTERLOCKS';
  const supplyLines = doc.splitTextToSize(supplyText, colW - 6);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(20);
  doc.text(supplyLines, mid + 5, 37);

  const billEndY = Math.max(leftY, 37 + supplyLines.length * 4.5) + 4;
  doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(ml, billEndY, mr, billEndY);

  // ── ITEMS TABLE ───────────────────────────────────────────────
  const deliveryCostNum = Number(delivery_cost) || 0;
  const discountAmt     = Number(discount) || 0;
  const itemSubtotal    = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);
  const subtotal        = itemSubtotal + deliveryCostNum;
  const discounted      = subtotal - discountAmt;
  const vatAmt          = include_vat ? discounted * 0.075 : 0;
  const grandTotal      = discounted + vatAmt;

  const N = (n) => `N${Math.round(Number(n) || 0).toLocaleString()}`;

  const tableRows = items.map(item => [
    String(item.description || ''),
    `${Number(item.quantity || 0).toLocaleString()}${item.unit ? ' ' + item.unit : ''}`,
    N(item.unit_price),
    N((Number(item.quantity) || 0) * (Number(item.unit_price) || 0)),
  ]);

  const spanRight = (label, value, bold, color) => ([
    { content: label, colSpan: 3, styles: { halign: 'right', fontStyle: bold ? 'bold' : 'normal', textColor: color || [40, 40, 40] } },
    { content: value, styles: { halign: 'right', fontStyle: bold ? 'bold' : 'normal', textColor: color || [40, 40, 40] } },
  ]);

  const summaryRows = [];
  if (deliveryCostNum > 0) summaryRows.push(spanRight('DELIVERY COST', N(deliveryCostNum)));
  summaryRows.push(spanRight('SUBTOTAL', N(subtotal)));
  if (discountAmt > 0)     summaryRows.push(spanRight('DISCOUNT', `-${N(discountAmt)}`, false, [200, 50, 50]));
  if (include_vat)         summaryRows.push(spanRight('VAT (7.5%)', N(vatAmt)));
  summaryRows.push(spanRight('GRAND TOTAL', N(grandTotal), true, [180, 100, 0]));

  autoTable(doc, {
    startY: billEndY + 3,
    head: [['DESCRIPTION', 'QTY / UNIT', 'UNIT PRICE (N)', 'AMOUNT (N)']],
    body: [...tableRows, ...summaryRows],
    margin: { left: ml, right: 14 },
    headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9, halign: 'center' },
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

  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(40);
  doc.text('IMPORTANT NOTICES:', ml, tableEndY + 5);

  let noticeY = tableEndY + 10;
  doc.setFont('helvetica', 'normal'); doc.setTextColor(55);
  notices.forEach((text, i) => {
    const lines = doc.splitTextToSize(`${i + 1}. ${text}`, colW - 4);
    doc.setFontSize(7.5);
    doc.text(lines, ml, noticeY);
    noticeY += lines.length * 3.8 + 1.5;
  });

  const authBoxY = tableEndY + 5;
  const authBoxH = noticeY - authBoxY + 2;
  const authX    = mid + 5;

  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(40);
  doc.text('AUTHORISED BY:', authX, tableEndY + 5);
  doc.setDrawColor(170); doc.setLineWidth(0.4);
  doc.rect(authX, authBoxY + 6, colW - 6, Math.max(authBoxH - 6, 28));
  doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(190);
  doc.text('Stamp & Signature', authX + (colW - 6) / 2, authBoxY + 6 + Math.max(authBoxH - 6, 28) / 2, { align: 'center' });

  const sectionEndY = noticeY + 4;

  // ── PAYMENT DETAILS ───────────────────────────────────────────
  doc.setDrawColor(180); doc.setLineWidth(0.4); doc.line(ml, sectionEndY, mr, sectionEndY);
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(40);
  doc.text('PAYMENT DETAILS', ml, sectionEndY + 6);

  let payY = sectionEndY + 12;
  [['Account Name:', 'ABUJA PRECAST CONCRETE LTD'], ['Bank:', 'TAJ BANK PLC'], ['Account No:', '0001732895']].forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal'); doc.setTextColor(80); doc.setFontSize(9);
    doc.text(label, ml, payY);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(20);
    doc.text(value, ml + 32, payY);
    payY += 5;
  });

  // ── FOOTER ────────────────────────────────────────────────────
  const footerY = payY + 6;
  doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(ml, footerY, mr, footerY);
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(245, 166, 35);
  doc.text('THANK YOU FOR YOUR PATRONAGE!', W / 2, footerY + 7, { align: 'center' });
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(90);
  doc.text('1, Dutse Alhaji, Behind Tipper Garage, Beside Istanbul Quarry, Off Bwari Expressway, Bmuko Village, Abuja, Nigeria.', W / 2, footerY + 13, { align: 'center' });
  doc.text('Tel: 09055541433, 07030647949   |   Email: iabujaprecast@gmail.com', W / 2, footerY + 18, { align: 'center' });

  doc.save(`${isProforma ? 'PROFORMA_' : ''}${invoice_number || 'invoice'}.pdf`);
}
