import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d}-${months[parseInt(m, 10) - 1]}-${y}`;
}

function buildRows(orders, fromDate, toDate, productMap = {}) {
  const rows = [];

  for (const order of orders) {
    const items = order.order_items || [];
    const totalQty = items.reduce((s, i) => s + i.quantity, 0);
    const uniqueTypes = [...new Set(items.map(i => i.block_type).filter(Boolean))];
    const description = uniqueTypes.map(t => t.toUpperCase()).join(' & ') || 'SUPPLY OF CONCRETE PRODUCTS';
    const unitLabel = uniqueTypes.length === 1 && productMap[uniqueTypes[0]] ? productMap[uniqueTypes[0]] : '';

    for (const invoice of order.invoices || []) {
      const d = invoice.issued_date;
      if (!d) continue;
      if (fromDate && d < fromDate) continue;
      if (toDate   && d > toDate)   continue;

      rows.push({
        type: 'debit',
        date: d,
        qty: totalQty,
        unitLabel,
        description,
        ref: invoice.invoice_number || '',
        debit: Number(invoice.total_amount || 0),
        credit: 0,
        balance: 0,
      });
    }

    for (const invoice of order.invoices || []) {
      for (const pay of invoice.payments || []) {
        if (pay.status !== 'confirmed') continue;
        const d = pay.payment_date;
        if (!d) continue;
        if (fromDate && d < fromDate) continue;
        if (toDate   && d > toDate)   continue;

        rows.push({
          type: 'credit',
          date: d,
          qty: 0,
          unitLabel: '',
          description: 'PAYMENT',
          ref: '',
          debit: 0,
          credit: Number(pay.amount_paid),
          balance: 0,
        });
      }
    }
  }

  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.type === 'debit' ? -1 : 1;
  });

  let running = 0;
  for (const r of rows) {
    running += r.debit - r.credit;
    r.balance = running;
  }

  return rows;
}

const N = (n) => `N${Number(n || 0).toLocaleString()}`;
const qty = (n) => Number(n || 0).toLocaleString();

export async function generateStatementPDF(customer, orders, fromDate, toDate, products = [], site = null) {
  const productMap = Object.fromEntries(products.map(p => [p.name, p.unit]));
  const rows = buildRows(orders, fromDate, toDate, productMap);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W  = doc.internal.pageSize.getWidth();
  const H  = doc.internal.pageSize.getHeight();
  const ml = 14;
  const mr = W - 14;

  // ── HEADER ─────────────────────────────────────────────────────
  try {
    const res  = await fetch('/logo.png');
    const blob = await res.blob();
    const b64  = await new Promise(resolve => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(blob);
    });
    doc.addImage(b64, 'PNG', ml, 8, 30, 15);
  } catch { /* no logo */ }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20);
  doc.text('ABUJA PRECAST CONCRETE LIMITED', ml + 33, 13);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text('RC: 1838184', ml + 33, 18);
  doc.text('1, Dutse Alhaji, Behind Tipper Garage, Off Bwari Expressway, Abuja.', ml + 33, 22);

  // Right: title
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(245, 166, 35);
  doc.text('CUSTOMER STATEMENT', mr, 13, { align: 'right' });

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  const period = (fromDate || toDate)
    ? `${fromDate ? fmtDate(fromDate) : 'All time'} — ${toDate ? fmtDate(toDate) : 'Present'}`
    : 'All Time';
  doc.text(`Period: ${period}`, mr, 20, { align: 'right' });

  // Rule
  doc.setDrawColor(180);
  doc.setLineWidth(0.5);
  doc.line(ml, 28, mr, 28);

  // Customer name (large)
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20);
  doc.text((customer.name || '—').toUpperCase(), ml, 37);

  if (customer.company_name) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(customer.company_name, ml, 42);
  }

  // Site (right)
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  const siteLabel = site ? site.site_name : (customer.location || '—');
  const siteAddr = site?.site_address || '';
  doc.text('SITE:', mr - 4, 33, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20);
  doc.text(siteLabel.toUpperCase(), mr, 33, { align: 'right' });
  if (siteAddr) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(siteAddr, mr, 38, { align: 'right' });
  }

  if (customer.phone) {
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(customer.phone, mr, 39, { align: 'right' });
  }

  doc.setDrawColor(210);
  doc.setLineWidth(0.3);
  doc.line(ml, 46, mr, 46);

  // ── TABLE ───────────────────────────────────────────────────────
  const emptyMsg = rows.length === 0
    ? [['—', '—', 'No transactions in selected period', '—', '—', '—', '—']]
    : [];

  const tableBody = rows.length > 0
    ? rows.map(row => [
        fmtDate(row.date),
        row.qty > 0 ? (row.unitLabel ? `${qty(row.qty)} ${row.unitLabel}` : qty(row.qty)) : '—',
        row.description,
        row.ref || '—',
        row.debit  > 0 ? N(row.debit)  : '—',
        row.credit > 0 ? N(row.credit) : '—',
        N(row.balance),
      ])
    : emptyMsg;

  // Totals row
  const totalQty    = rows.reduce((s, r) => s + r.qty, 0);
  const totalDebit  = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const finalBal    = rows.length > 0 ? rows[rows.length - 1].balance : 0;

  const totalsRow = [
    { content: 'TOTALS',       styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
    { content: qty(totalQty),  styles: { fontStyle: 'bold', halign: 'right', fillColor: [240, 240, 240] } },
    { content: '',             styles: { fillColor: [240, 240, 240] } },
    { content: '',             styles: { fillColor: [240, 240, 240] } },
    { content: N(totalDebit),  styles: { fontStyle: 'bold', halign: 'right', fillColor: [240, 240, 240] } },
    { content: N(totalCredit), styles: { fontStyle: 'bold', halign: 'right', fillColor: [240, 240, 240], textColor: [34, 150, 100] } },
    { content: N(finalBal),    styles: { fontStyle: 'bold', halign: 'right', fillColor: [240, 240, 240], textColor: finalBal > 0 ? [200, 50, 50] : [34, 150, 100] } },
  ];

  autoTable(doc, {
    startY: 49,
    head: [['DATE', 'QTY', 'DESCRIPTION', 'WAYBILL NO.', 'DEBIT (N)', 'CREDIT (N)', 'BALANCE (N)']],
    body: [...tableBody, totalsRow],
    margin: { left: ml, right: 14 },
    headStyles: {
      fillColor: [25, 25, 25],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    bodyStyles: { fontSize: 8.5, textColor: [25, 25, 25] },
    columnStyles: {
      0: { cellWidth: 20, halign: 'center' },
      1: { cellWidth: 14, halign: 'right' },
      2: { cellWidth: 50 },
      3: { cellWidth: 28, halign: 'center' },
      4: { cellWidth: 23, halign: 'right' },
      5: { cellWidth: 23, halign: 'right' },
      6: { cellWidth: 24, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body' || data.row.index >= rows.length) return;
      const row = rows[data.row.index];
      // Credit rows: green credit column
      if (row.type === 'credit' && data.column.index === 5) {
        data.cell.styles.textColor  = [34, 150, 100];
        data.cell.styles.fontStyle  = 'bold';
      }
      // Balance column: red if customer owes, green if paid up
      if (data.column.index === 6) {
        data.cell.styles.textColor = row.balance > 0 ? [200, 50, 50] : [34, 150, 100];
      }
      // Stripe credit rows lightly
      if (row.type === 'credit') {
        data.cell.styles.fillColor = [245, 255, 250];
      }
    },
    tableLineColor: [210, 210, 210],
    tableLineWidth: 0.25,
  });

  const tableEndY = doc.lastAutoTable.finalY + 8;

  // ── SUMMARY BOX ─────────────────────────────────────────────────
  const boxH = 38;
  doc.setFillColor(248, 248, 252);
  doc.setDrawColor(200, 200, 220);
  doc.setLineWidth(0.4);
  doc.roundedRect(ml, tableEndY, mr - ml, boxH, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(80);
  doc.text('STATEMENT SUMMARY', ml + 4, tableEndY + 7);

  const sumRows = [
    { label: 'TOTAL AMOUNT PAID:', value: N(totalCredit), color: [34, 150, 100] },
    { label: 'TOTAL BLOCKS DELIVERED:', value: qty(totalQty) + ' blocks', color: [30, 30, 30] },
    { label: 'WORTH OF BLOCKS NOT PAID FOR:', value: N(Math.max(finalBal, 0)), color: finalBal > 0 ? [200, 50, 50] : [34, 150, 100] },
  ];

  const colW = (mr - ml - 8) / 3;
  sumRows.forEach(({ label, value, color }, i) => {
    const cx = ml + 4 + i * colW;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100);
    doc.text(label, cx, tableEndY + 16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...color);
    doc.text(value, cx, tableEndY + 25);
  });

  // ── FOOTER ─────────────────────────────────────────────────────
  const footerY = H - 16;
  doc.setDrawColor(200);
  doc.setLineWidth(0.3);
  doc.line(ml, footerY - 3, mr, footerY - 3);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(140);
  doc.text(
    '1, Dutse Alhaji, Behind Tipper Garage, Beside Istanbul Quarry, Off Bwari Expressway, Bmuko Village, Abuja, Nigeria.',
    W / 2, footerY + 1, { align: 'center' }
  );
  doc.text(
    'Tel: 09055541433, 07030647949   |   Email: iabujaprecast@gmail.com',
    W / 2, footerY + 6, { align: 'center' }
  );

  const siteSuffix = site ? `_${site.site_name.replace(/\s+/g, '_')}` : '';
  const fname = `Statement_${(customer.name || 'customer').replace(/\s+/g, '_')}${siteSuffix}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fname);
}
