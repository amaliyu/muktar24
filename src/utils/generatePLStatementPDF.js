import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${day}-${months[parseInt(m,10)-1]}-${y}`;
}

const N = (n) => `₦${Number(n || 0).toLocaleString()}`;

export async function generatePLStatementPDF({ fromDate, toDate, payments, incomeRecords, expenses }) {
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
  doc.text('PROFIT & LOSS STATEMENT', mr, 13, { align: 'right' });

  const period = (fromDate || toDate)
    ? `${fromDate ? fmtDate(fromDate) : 'All time'} — ${toDate ? fmtDate(toDate) : 'Present'}`
    : 'All Time';
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
  doc.text(`Period: ${period}`, mr, 20, { align: 'right' });

  doc.setDrawColor(180); doc.setLineWidth(0.5); doc.line(ml, 27, mr, 27);

  let y = 33;

  // ── REVENUE ──
  const totalPayments = payments.reduce((s, p) => s + Number(p.amount_paid || 0), 0);
  const totalOtherIncome = incomeRecords.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalRevenue = totalPayments + totalOtherIncome;

  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(34, 150, 100);
  doc.text('REVENUE', ml, y);
  y += 5;

  const revenueRows = [
    ['Customer Payments (Confirmed)', N(totalPayments)],
    ['Other Income', N(totalOtherIncome)],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Source', 'Amount']],
    body: [
      ...revenueRows,
      [{ content: 'TOTAL REVENUE', styles: { fontStyle: 'bold', fillColor: [230, 255, 240] } },
       { content: N(totalRevenue), styles: { fontStyle: 'bold', textColor: [34, 150, 100], halign: 'right', fillColor: [230, 255, 240] } }],
    ],
    margin: { left: ml, right: 14 },
    headStyles: { fillColor: [34, 100, 60], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: { 0: { cellWidth: 120 }, 1: { halign: 'right' } },
    tableLineColor: [210, 210, 210], tableLineWidth: 0.2,
  });

  y = doc.lastAutoTable.finalY + 10;

  // ── EXPENSES ──
  const expensesByGroup = {};
  for (const e of expenses) {
    if (e.status === 'rejected') continue;
    const group = e.category?.parent_category || 'General';
    const cat = e.category?.name || 'Uncategorised';
    if (!expensesByGroup[group]) expensesByGroup[group] = {};
    expensesByGroup[group][cat] = (expensesByGroup[group][cat] || 0) + Number(e.amount || 0);
  }

  const totalExpenses = Object.values(expensesByGroup).reduce((s, cats) =>
    s + Object.values(cats).reduce((a, v) => a + v, 0), 0);

  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(200, 50, 50);
  doc.text('EXPENSES', ml, y);
  y += 5;

  const expenseRows = [];
  for (const [group, cats] of Object.entries(expensesByGroup)) {
    const groupTotal = Object.values(cats).reduce((a, v) => a + v, 0);
    expenseRows.push([
      { content: group.toUpperCase(), styles: { fontStyle: 'bold', fillColor: [245, 245, 250] } },
      { content: N(groupTotal), styles: { fontStyle: 'bold', halign: 'right', fillColor: [245, 245, 250] } },
    ]);
    for (const [cat, amt] of Object.entries(cats)) {
      expenseRows.push([`  ${cat}`, { content: N(amt), styles: { halign: 'right' } }]);
    }
  }

  autoTable(doc, {
    startY: y,
    head: [['Category', 'Amount']],
    body: [
      ...expenseRows,
      [{ content: 'TOTAL EXPENSES', styles: { fontStyle: 'bold', fillColor: [255, 235, 235] } },
       { content: N(totalExpenses), styles: { fontStyle: 'bold', textColor: [200, 50, 50], halign: 'right', fillColor: [255, 235, 235] } }],
    ],
    margin: { left: ml, right: 14 },
    headStyles: { fillColor: [80, 20, 20], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: { 0: { cellWidth: 120 }, 1: { halign: 'right' } },
    tableLineColor: [210, 210, 210], tableLineWidth: 0.2,
  });

  y = doc.lastAutoTable.finalY + 10;

  // ── NET PROFIT BOX ──
  const netProfit = totalRevenue - totalExpenses;
  const isProfit = netProfit >= 0;
  const boxColor = isProfit ? [230, 255, 240] : [255, 235, 235];
  const textColor = isProfit ? [34, 150, 100] : [200, 50, 50];

  doc.setFillColor(...boxColor);
  doc.setDrawColor(...textColor);
  doc.setLineWidth(0.5);
  doc.roundedRect(ml, y, mr - ml, 22, 2, 2, 'FD');
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(80);
  doc.text(isProfit ? 'NET PROFIT' : 'NET LOSS', ml + 6, y + 8);
  doc.setFontSize(16); doc.setTextColor(...textColor);
  doc.text(N(Math.abs(netProfit)), mr - 6, y + 14, { align: 'right' });

  const footY = doc.internal.pageSize.getHeight() - 10;
  doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(ml, footY - 3, mr, footY - 3);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(130);
  doc.text('ABUJA PRECAST CONCRETE LIMITED  ·  Tel: 09055541433, 07030647949  ·  iabujaprecast@gmail.com', W / 2, footY + 1, { align: 'center' });

  const d = new Date().toISOString().split('T')[0];
  doc.save(`PL_Statement_${d}.pdf`);
}
