import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * payment       — { id, amount_paid, payment_date }
 * customer      — { name, phone?, location? }
 * invoiceNumber — string
 * invoiceTotal  — number|null  (if null → simple receipt, no balance breakdown)
 * totalPaidSoFar— number|null  (cumulative confirmed payments including this one)
 */
export async function generatePaymentReceiptPDF({ payment, customer, invoiceNumber, invoiceTotal = null, totalPaidSoFar = null }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W  = doc.internal.pageSize.getWidth();
  const ml = 14;
  const mr = W - 14;
  const mid = W / 2;

  const N = (n) => `N${Math.round(Number(n) || 0).toLocaleString()}`;

  const dateStr  = payment.payment_date ? payment.payment_date.replace(/-/g, '') : new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const shortId  = (payment.id || '').replace(/-/g, '').slice(0, 6).toUpperCase();
  const receiptNo = `RCT-${dateStr}-${shortId}`;

  // ── HEADER ──────────────────────────────────────────────────────
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
  doc.text('PAYMENT RECEIPT', mr, 15, { align: 'right' });

  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(40);
  doc.text(`No: ${receiptNo}`, mr, 21, { align: 'right' });
  doc.text(`Date: ${payment.payment_date || '—'}`, mr, 26, { align: 'right' });

  doc.setDrawColor(180); doc.setLineWidth(0.5); doc.line(ml, 30, mr, 30);

  // ── RECEIVED FROM / INVOICE REF ─────────────────────────────────
  let leftY = 37;
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(140);
  doc.text('RECEIVED FROM:', ml, leftY); leftY += 5;

  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(20);
  doc.text(String(customer?.name || '—'), ml, leftY); leftY += 5;

  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(70);
  if (customer?.location) { doc.text(customer.location, ml, leftY); leftY += 5; }
  if (customer?.phone)    { doc.text(customer.phone,    ml, leftY); leftY += 5; }

  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(140);
  doc.text('INVOICE REFERENCE:', mid + 5, 37);
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(20);
  doc.text(String(invoiceNumber || '—'), mid + 5, 43);

  const divY = Math.max(leftY, 50) + 2;
  doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(ml, divY, mr, divY);

  // ── AMOUNT BOX ──────────────────────────────────────────────────
  const boxY = divY + 8;
  const boxW = mr - ml;
  const boxH = 28;

  doc.setFillColor(30, 30, 30);
  doc.roundedRect(ml, boxY, boxW, boxH, 3, 3, 'F');

  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(200, 200, 200);
  doc.text('AMOUNT RECEIVED', mid, boxY + 8, { align: 'center' });

  doc.setFontSize(26); doc.setFont('helvetica', 'bold'); doc.setTextColor(245, 166, 35);
  doc.text(N(payment.amount_paid), mid, boxY + 21, { align: 'center' });

  // ── SUMMARY / STATUS ────────────────────────────────────────────
  const sumY = boxY + boxH + 10;

  if (invoiceTotal !== null && totalPaidSoFar !== null) {
    const balance      = Number(invoiceTotal) - Number(totalPaidSoFar);
    const isPaidInFull = balance <= 0.01;

    autoTable(doc, {
      startY: sumY,
      head: [['DESCRIPTION', 'AMOUNT (₦)']],
      body: [
        ['Invoice Total', N(invoiceTotal)],
        ['This Payment', N(payment.amount_paid)],
        ['Total Paid to Date', N(totalPaidSoFar)],
        [
          { content: isPaidInFull ? 'Balance Remaining' : 'Balance Outstanding', styles: { fontStyle: 'bold', textColor: isPaidInFull ? [34, 139, 34] : [180, 40, 40] } },
          { content: isPaidInFull ? 'NIL' : N(balance), styles: { halign: 'right', fontStyle: 'bold', textColor: isPaidInFull ? [34, 139, 34] : [180, 40, 40] } },
        ],
      ],
      margin: { left: ml, right: 14 },
      headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 11, textColor: [30, 30, 30] },
      columnStyles: {
        0: { cellWidth: 120 },
        1: { halign: 'right' },
      },
      tableLineColor: [210, 210, 210],
      tableLineWidth: 0.25,
    });

    const afterTableY = doc.lastAutoTable.finalY + 10;

    // Payment status stamp
    const stampText  = isPaidInFull ? '  PAID IN FULL  ' : '  PARTIAL PAYMENT  ';
    const stampColor = isPaidInFull ? [20, 140, 60] : [180, 100, 0];
    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(...stampColor);
    const stampW = doc.getTextWidth(stampText);
    doc.setDrawColor(...stampColor); doc.setLineWidth(1.2);
    doc.rect(mid - stampW / 2 - 3, afterTableY - 5, stampW + 6, 10);
    doc.text(stampText, mid, afterTableY + 2, { align: 'center' });

    addBottomSection(doc, ml, mr, W, afterTableY + 18);
  } else {
    // Simple receipt — no balance breakdown
    autoTable(doc, {
      startY: sumY,
      body: [
        ['Payment For Invoice:', String(invoiceNumber || '—')],
        ['Amount Received:', N(payment.amount_paid)],
        ['Payment Date:', String(payment.payment_date || '—')],
      ],
      margin: { left: ml, right: 14 },
      bodyStyles: { fontSize: 11, textColor: [30, 30, 30] },
      columnStyles: {
        0: { cellWidth: 80, fontStyle: 'bold', textColor: [100, 100, 100] },
        1: {},
      },
      theme: 'plain',
    });

    addBottomSection(doc, ml, mr, W, doc.lastAutoTable.finalY + 12);
  }

  doc.save(`${receiptNo}.pdf`);
}

function addBottomSection(doc, ml, mr, W, startY) {
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(40);
  doc.text('AUTHORISED BY:', ml, startY);
  doc.setDrawColor(170); doc.setLineWidth(0.4);
  doc.rect(ml, startY + 4, 80, 25);
  doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(190);
  doc.text('Stamp & Signature', ml + 40, startY + 16, { align: 'center' });

  const footerY = startY + 36;
  doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(ml, footerY, mr, footerY);
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(245, 166, 35);
  doc.text('THANK YOU FOR YOUR PAYMENT!', W / 2, footerY + 7, { align: 'center' });
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(90);
  doc.text('1, Dutse Alhaji, Behind Tipper Garage, Beside Istanbul Quarry, Off Bwari Expressway, Bmuko Village, Abuja, Nigeria.', W / 2, footerY + 13, { align: 'center' });
  doc.text('Tel: 09055541433, 07030647949   |   Email: iabujaprecast@gmail.com', W / 2, footerY + 18, { align: 'center' });
}
