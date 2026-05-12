import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export async function generateInvoicePDF(invoice, order) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;

  // ── HEADER ──────────────────────────────────────────────────
  // Logo (left)
  try {
    const res = await fetch('/logo.png');
    const blob = await res.blob();
    const b64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
    doc.addImage(b64, 'PNG', margin, 12, 44, 22);
  } catch {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40);
    doc.text('ABUJA PRECAST CONCRETE LTD', margin, 22);
  }

  // Company info (right)
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text('Abuja Precast Concrete Limited', pageWidth - margin, 14, { align: 'right' });
  doc.text('RC: 1838184', pageWidth - margin, 19, { align: 'right' });
  doc.text('No. 1, Off Bwari Road, Abuja, Nigeria', pageWidth - margin, 24, { align: 'right' });
  doc.text('+234 905 554 4433', pageWidth - margin, 29, { align: 'right' });
  doc.text('abujaprecastconcreteltd@gmail.com', pageWidth - margin, 34, { align: 'right' });

  // Header divider
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.4);
  doc.line(margin, 40, pageWidth - margin, 40);

  // ── INVOICE TITLE + META ─────────────────────────────────────
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(245, 166, 35);
  doc.text('INVOICE', margin, 51);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60);
  doc.text(`Invoice No:`, pageWidth - margin - 50, 45);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text(String(invoice.invoice_number || '—'), pageWidth - margin, 45, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60);
  doc.text(`Issue Date:`, pageWidth - margin - 50, 51);
  doc.text(`Due Date:`, pageWidth - margin - 50, 57);
  doc.setTextColor(0);
  doc.text(String(invoice.issued_date || '—'), pageWidth - margin, 51, { align: 'right' });
  doc.text(String(invoice.due_date || '—'), pageWidth - margin, 57, { align: 'right' });

  // ── BILL TO ───────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(150);
  doc.text('BILL TO', margin, 63);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20);
  doc.text(String(order.customer?.name || '—'), margin, 69);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  let billY = 75;
  if (order.customer?.phone) { doc.text(order.customer.phone, margin, billY); billY += 5; }
  if (order.customer?.location) { doc.text(`Site: ${order.customer.location}`, margin, billY); billY += 5; }
  if (order.marketer?.full_name) { doc.text(`Marketer: ${order.marketer.full_name}`, margin, billY); }

  // ── ITEMS TABLE ───────────────────────────────────────────────
  const items = order.order_items || [];
  const tableBody = items.map((item, i) => [
    i + 1,
    `${item.block_type} Blocks`,
    Number(item.quantity).toLocaleString(),
    `₦${Number(item.unit_price).toLocaleString()}`,
    `₦${Number(item.subtotal ?? item.quantity * item.unit_price).toLocaleString()}`,
  ]);

  autoTable(doc, {
    startY: billY + 8,
    head: [['#', 'DESCRIPTION', 'QTY', 'UNIT PRICE', 'AMOUNT']],
    body: tableBody,
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: [245, 166, 35],
      textColor: [20, 20, 20],
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'center',
    },
    bodyStyles: { fontSize: 10, textColor: [30, 30, 30] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 72 },
      2: { cellWidth: 22, halign: 'right' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
    },
    alternateRowStyles: { fillColor: [252, 252, 252] },
    tableLineColor: [220, 220, 220],
    tableLineWidth: 0.3,
  });

  // ── TOTALS ─────────────────────────────────────────────────────
  const tableEndY = doc.lastAutoTable.finalY;
  const grandTotal = items.reduce((s, i) => s + Number(i.subtotal ?? i.quantity * i.unit_price), 0);
  const paid = (order.invoices?.[0]?.payments || [])
    .filter(p => p.status === 'confirmed')
    .reduce((s, p) => s + Number(p.amount_paid), 0);
  const balance = grandTotal - paid;

  const rightCol = pageWidth - margin;
  const labelCol = rightCol - 52;
  let ty = tableEndY + 7;

  const drawTotalRow = (label, value, bold, color) => {
    doc.setFontSize(10);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(...(color || [60, 60, 60]));
    doc.text(label, labelCol, ty, { align: 'right' });
    doc.text(value, rightCol, ty, { align: 'right' });
    ty += 7;
  };

  drawTotalRow('Subtotal:', `₦${grandTotal.toLocaleString()}`);
  doc.setDrawColor(220);
  doc.line(labelCol - 30, ty - 3, rightCol, ty - 3);
  drawTotalRow('GRAND TOTAL:', `₦${grandTotal.toLocaleString()}`, true, [245, 166, 35]);

  if (paid > 0) {
    drawTotalRow('Amount Paid:', `₦${paid.toLocaleString()}`, false, [34, 180, 120]);
    doc.setDrawColor(220);
    doc.line(labelCol - 30, ty - 3, rightCol, ty - 3);
    drawTotalRow('BALANCE DUE:', `₦${balance.toLocaleString()}`, true, [220, 60, 60]);
  }

  // ── BANK DETAILS ──────────────────────────────────────────────
  const bankY = ty + 6;
  doc.setFillColor(248, 248, 248);
  doc.roundedRect(margin, bankY, 90, 30, 2, 2, 'F');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100);
  doc.text('PAYMENT DETAILS', margin + 4, bankY + 6);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(20);
  doc.text('Bank:', margin + 4, bankY + 13);
  doc.text('Account Name:', margin + 4, bankY + 19);
  doc.text('Account Number:', margin + 4, bankY + 25);

  doc.setFont('helvetica', 'bold');
  doc.text('TAJ BANK NIG', margin + 28, bankY + 13);
  doc.text('ABUJA PRECAST CONCRETE LTD', margin + 36, bankY + 19);
  doc.text('0001732895', margin + 40, bankY + 25);

  // ── FOOTER ────────────────────────────────────────────────────
  doc.setDrawColor(220);
  doc.line(margin, pageHeight - 18, pageWidth - margin, pageHeight - 18);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(160);
  doc.text(
    'Thank you for choosing Abuja Precast Concrete Limited. Payment due within 30 days of invoice date.',
    pageWidth / 2, pageHeight - 12, { align: 'center' }
  );
  doc.text(
    'RC: 1838184 | No. 1, Off Bwari Road, Abuja, Nigeria | +234 905 554 4433',
    pageWidth / 2, pageHeight - 7, { align: 'center' }
  );

  doc.save(`${invoice.invoice_number}.pdf`);
}
