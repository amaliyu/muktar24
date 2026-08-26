import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const N = (n) => `₦${Number(n || 0).toLocaleString()}`;

function ageBucket(issuedDate) {
  if (!issuedDate) return '90+';
  const days = Math.floor((Date.now() - new Date(issuedDate).getTime()) / 86400000);
  if (days <= 30) return '0–30';
  if (days <= 60) return '31–60';
  if (days <= 90) return '61–90';
  return '90+';
}

function daysSince(issuedDate) {
  if (!issuedDate) return 999;
  return Math.floor((Date.now() - new Date(issuedDate).getTime()) / 86400000);
}

export async function generateReceivablesPDF(receivables) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const ml = 14, mr = W - 14;

  try {
    const res = await fetch('/logo.png');
    const blob = await res.blob();
    const b64 = await new Promise(resolve => {
      const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob);
    });
    doc.addImage(b64, 'PNG', ml, 8, 28, 14);
  } catch { /* no logo */ }

  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(20);
  doc.text('ABUJA PRECAST CONCRETE LIMITED', ml + 31, 13);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
  doc.text('RC: 1838184  ·  1, Dutse Alhaji, Off Bwari Expressway, Abuja', ml + 31, 18);

  doc.setFontSize(15); doc.setFont('helvetica', 'bold'); doc.setTextColor(245, 166, 35);
  doc.text('ACCOUNTS RECEIVABLE', mr, 13, { align: 'right' });
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`, mr, 20, { align: 'right' });

  doc.setDrawColor(180); doc.setLineWidth(0.5); doc.line(ml, 27, mr, 27);

  const rows = [];
  const bucketTotals = { '0–30': 0, '31–60': 0, '61–90': 0, '90+': 0 };
  let grandTotal = 0;

  for (const order of receivables) {
    const customerName = order.customer?.name || '—';
    for (const inv of order.invoices || []) {
      // Drafts (quotations) and cancelled invoices are not receivables.
      if (inv.status === 'draft' || inv.status === 'cancelled') continue;
      const invoiced = Number(inv.total_amount || 0);
      const paid = (inv.payments || [])
        .filter(p => p.status === 'confirmed')
        .reduce((s, p) => s + Number(p.amount_paid || 0), 0);
      const outstanding = invoiced - paid;
      if (outstanding <= 0) continue;

      const days = daysSince(inv.issued_date);
      const bucket = ageBucket(inv.issued_date);
      bucketTotals[bucket] += outstanding;
      grandTotal += outstanding;

      const bucketColor = bucket === '0–30' ? [34, 150, 100] : bucket === '31–60' ? [180, 130, 0] : bucket === '61–90' ? [200, 100, 0] : [200, 50, 50];
      rows.push([
        customerName,
        inv.invoice_number || '—',
        inv.issued_date ? new Date(inv.issued_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
        `${days} days`,
        { content: bucket, styles: { textColor: bucketColor, fontStyle: 'bold', halign: 'center' } },
        { content: N(invoiced), styles: { halign: 'right' } },
        { content: N(paid), styles: { halign: 'right', textColor: [34, 150, 100] } },
        { content: N(outstanding), styles: { halign: 'right', fontStyle: 'bold', textColor: outstanding > 0 ? [200, 50, 50] : [34, 150, 100] } },
      ]);
    }
  }

  autoTable(doc, {
    startY: 32,
    head: [['Customer', 'Invoice No.', 'Invoice Date', 'Age', 'Bucket', 'Invoiced', 'Paid', 'Outstanding']],
    body: rows.length > 0 ? rows : [['—', '—', '—', '—', '—', '—', '—', 'No outstanding balances']],
    margin: { left: ml, right: 14 },
    headStyles: { fillColor: [25, 25, 25], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 28, halign: 'center' },
      2: { cellWidth: 28, halign: 'center' },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 20, halign: 'center' },
      5: { cellWidth: 32, halign: 'right' },
      6: { cellWidth: 30, halign: 'right' },
      7: { cellWidth: 35, halign: 'right' },
    },
    tableLineColor: [210, 210, 210], tableLineWidth: 0.25,
  });

  const y = doc.lastAutoTable.finalY + 8;

  // Aging summary box
  const boxH = 28;
  doc.setFillColor(248, 248, 252);
  doc.setDrawColor(200, 200, 220);
  doc.setLineWidth(0.4);
  doc.roundedRect(ml, y, mr - ml, boxH, 2, 2, 'FD');

  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(80);
  doc.text('AGING SUMMARY', ml + 4, y + 7);

  const buckets = [
    { label: '0–30 DAYS', value: bucketTotals['0–30'], color: [34, 150, 100] },
    { label: '31–60 DAYS', value: bucketTotals['31–60'], color: [180, 130, 0] },
    { label: '61–90 DAYS', value: bucketTotals['61–90'], color: [200, 100, 0] },
    { label: '90+ DAYS', value: bucketTotals['90+'], color: [200, 50, 50] },
    { label: 'TOTAL OUTSTANDING', value: grandTotal, color: [20, 20, 20] },
  ];

  const colW = (mr - ml - 8) / 5;
  buckets.forEach(({ label, value, color }, i) => {
    const cx = ml + 4 + i * colW;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120);
    doc.text(label, cx, y + 14);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...color);
    doc.text(N(value), cx, y + 22);
  });

  const footY = doc.internal.pageSize.getHeight() - 10;
  doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(ml, footY - 3, mr, footY - 3);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(130);
  doc.text('ABUJA PRECAST CONCRETE LIMITED  ·  Tel: 09055541433, 07030647949  ·  iabujaprecast@gmail.com', W / 2, footY + 1, { align: 'center' });

  doc.save(`Receivables_${new Date().toISOString().split('T')[0]}.pdf`);
}
