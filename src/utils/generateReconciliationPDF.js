import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = String(d).split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${day}-${months[parseInt(m,10)-1]}-${y}`;
}

const N = (n) => `₦${Number(n || 0).toLocaleString()}`;

export async function generateReconciliationPDF({ account, period, system, bank, reconcilingItems, difference, reconciledBy, notes }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
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
  doc.text('BANK RECONCILIATION STATEMENT', mr, 13, { align: 'right' });
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
  doc.text(`${account.bank_name} — ${account.account_number}`, mr, 19, { align: 'right' });
  doc.text(`Period: ${fmtDate(period.from)} — ${fmtDate(period.to)}`, mr, 24, { align: 'right' });

  doc.setDrawColor(180); doc.setLineWidth(0.5); doc.line(ml, 29, mr, 29);

  let y = 35;

  // ── SIDE-BY-SIDE COMPARISON ──
  const halfW = (mr - ml - 6) / 2;

  // System side
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(91, 141, 238);
  doc.text('SYSTEM RECORDS', ml, y);
  autoTable(doc, {
    startY: y + 3,
    body: [
      ['Opening Balance', { content: N(system.openingBalance), styles: { halign: 'right' } }],
      ['Total Credits (Receipts)', { content: N(system.totalCredits), styles: { halign: 'right', textColor: [34, 150, 100] } }],
      ['Total Debits (Expenses)', { content: `(${N(system.totalDebits)})`, styles: { halign: 'right', textColor: [200, 50, 50] } }],
      [{ content: 'Closing Balance', styles: { fontStyle: 'bold' } }, { content: N(system.closingBalance), styles: { halign: 'right', fontStyle: 'bold' } }],
    ],
    margin: { left: ml, right: ml + halfW + 6 },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: { 0: { cellWidth: halfW * 0.6 }, 1: { cellWidth: halfW * 0.4, halign: 'right' } },
    tableLineColor: [210, 210, 210], tableLineWidth: 0.2,
  });
  const leftEndY = doc.lastAutoTable.finalY;

  // Bank side
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(245, 166, 35);
  doc.text('BANK STATEMENT', ml + halfW + 6, y);
  autoTable(doc, {
    startY: y + 3,
    body: [
      ['Opening Balance', { content: N(bank.openingBalance), styles: { halign: 'right' } }],
      ['Total Credits', { content: N(bank.totalCredits), styles: { halign: 'right', textColor: [34, 150, 100] } }],
      ['Total Debits', { content: `(${N(bank.totalDebits)})`, styles: { halign: 'right', textColor: [200, 50, 50] } }],
      [{ content: 'Closing Balance', styles: { fontStyle: 'bold' } }, { content: N(bank.closingBalance), styles: { halign: 'right', fontStyle: 'bold' } }],
    ],
    margin: { left: ml + halfW + 6, right: 14 },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: { 0: { cellWidth: halfW * 0.6 }, 1: { cellWidth: halfW * 0.4, halign: 'right' } },
    tableLineColor: [210, 210, 210], tableLineWidth: 0.2,
  });

  y = Math.max(leftEndY, doc.lastAutoTable.finalY) + 10;

  // ── RECONCILING ITEMS ──
  if (reconcilingItems?.length > 0) {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(80);
    doc.text('RECONCILING ITEMS', ml, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [['Description', 'Type', 'Amount']],
      body: reconcilingItems.map(item => [
        item.description,
        item.type,
        { content: N(item.amount), styles: { halign: 'right' } },
      ]),
      margin: { left: ml, right: 14 },
      headStyles: { fillColor: [25, 25, 25], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 8.5 },
      tableLineColor: [210, 210, 210], tableLineWidth: 0.2,
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // ── DIFFERENCE BOX ──
  const isZero = Math.abs(difference) < 0.01;
  doc.setFillColor(isZero ? 230 : 255, isZero ? 255 : 235, isZero ? 240 : 235);
  doc.setDrawColor(isZero ? 34 : 200, isZero ? 150 : 50, isZero ? 100 : 50);
  doc.setLineWidth(0.5);
  doc.roundedRect(ml, y, mr - ml, 18, 2, 2, 'FD');
  doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.setTextColor(isZero ? 34 : 200, isZero ? 150 : 50, isZero ? 100 : 50);
  doc.text(isZero ? 'RECONCILED — DIFFERENCE IS ₦0' : `UNRECONCILED DIFFERENCE`, ml + 6, y + 7);
  doc.setFontSize(14);
  doc.text(N(Math.abs(difference)), mr - 6, y + 11, { align: 'right' });

  y += 26;

  // ── SIGN-OFF ──
  if (reconciledBy) {
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
    doc.text(`Reconciled by: ${reconciledBy}`, ml, y);
    doc.text(`Date: ${fmtDate(new Date().toISOString().split('T')[0])}`, mr, y, { align: 'right' });
    if (notes) { y += 6; doc.setTextColor(120); doc.text(`Notes: ${notes}`, ml, y); }
  }

  const footY = doc.internal.pageSize.getHeight() - 10;
  doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(ml, footY - 3, mr, footY - 3);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(130);
  doc.text('ABUJA PRECAST CONCRETE LIMITED  ·  Tel: 09055541433, 07030647949  ·  iabujaprecast@gmail.com', W / 2, footY + 1, { align: 'center' });

  doc.save(`Reconciliation_${account.bank_name.replace(/\s+/g,'_')}_${new Date().toISOString().split('T')[0]}.pdf`);
}
