import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const N = (n) => `₦${Number(n || 0).toLocaleString()}`;

function changeLabel(curr, prev) {
  if (!prev) return '—';
  const diff = curr - prev;
  const pct = ((diff / prev) * 100).toFixed(1);
  return `${diff >= 0 ? '+' : ''}${pct}%`;
}

function changeColor(curr, prev) {
  if (!prev) return [120, 120, 120];
  return curr >= prev ? [34, 150, 100] : [200, 50, 50];
}

export async function generateManagementAccountsPDF({ monthLabel, prevMonthLabel, current, previous }) {
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
  doc.text('MANAGEMENT ACCOUNTS', mr, 13, { align: 'right' });
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
  doc.text(`${monthLabel} vs ${prevMonthLabel}`, mr, 20, { align: 'right' });

  doc.setDrawColor(180); doc.setLineWidth(0.5); doc.line(ml, 27, mr, 27);

  let y = 33;

  // ── KPI COMPARISON ──
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(80);
  doc.text('KEY PERFORMANCE INDICATORS', ml, y);
  y += 5;

  const kpis = [
    ['Total Revenue', N(current.revenue), N(previous.revenue), changeLabel(current.revenue, previous.revenue), changeColor(current.revenue, previous.revenue)],
    ['Total Expenses', N(current.expenses), N(previous.expenses), changeLabel(current.expenses, previous.expenses), changeColor(previous.expenses, current.expenses)],
    ['Net Profit', N(current.revenue - current.expenses), N(previous.revenue - previous.expenses),
      changeLabel(current.revenue - current.expenses, previous.revenue - previous.expenses),
      changeColor(current.revenue - current.expenses, previous.revenue - previous.expenses)],
    ['No. of Transactions', String(current.transactions), String(previous.transactions),
      changeLabel(current.transactions, previous.transactions), changeColor(current.transactions, previous.transactions)],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Metric', monthLabel, prevMonthLabel, 'Change']],
    body: kpis.map(([metric, curr, prev, change, color]) => [
      metric,
      { content: curr, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: prev, styles: { halign: 'right', textColor: [120, 120, 120] } },
      { content: change, styles: { halign: 'center', fontStyle: 'bold', textColor: color } },
    ]),
    margin: { left: ml, right: 14 },
    headStyles: { fillColor: [25, 25, 25], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 35, halign: 'right' }, 2: { cellWidth: 35, halign: 'right' }, 3: { cellWidth: 30, halign: 'center' } },
    tableLineColor: [210, 210, 210], tableLineWidth: 0.2,
  });

  y = doc.lastAutoTable.finalY + 10;

  // ── TOP 5 CUSTOMERS ──
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(80);
  doc.text(`TOP 5 CUSTOMERS BY REVENUE — ${monthLabel}`, ml, y);
  y += 5;

  const customerRows = (current.topCustomers || []).map((c, i) => [
    String(i + 1),
    c.name,
    { content: N(c.amount), styles: { halign: 'right', fontStyle: 'bold', textColor: [34, 150, 100] } },
  ]);

  autoTable(doc, {
    startY: y,
    head: [['#', 'Customer', 'Revenue']],
    body: customerRows.length > 0 ? customerRows : [['', 'No data for this month', '']],
    margin: { left: ml, right: 14 },
    headStyles: { fillColor: [34, 60, 40], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: { 0: { cellWidth: 12, halign: 'center' }, 1: { cellWidth: 100 }, 2: { cellWidth: 48, halign: 'right' } },
    tableLineColor: [210, 210, 210], tableLineWidth: 0.2,
  });

  y = doc.lastAutoTable.finalY + 10;

  // ── TOP 5 EXPENSES ──
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(80);
  doc.text(`TOP 5 EXPENSE CATEGORIES — ${monthLabel}`, ml, y);
  y += 5;

  const expenseRows = (current.topExpenses || []).map((e, i) => [
    String(i + 1),
    e.name,
    { content: N(e.amount), styles: { halign: 'right', fontStyle: 'bold', textColor: [200, 50, 50] } },
  ]);

  autoTable(doc, {
    startY: y,
    head: [['#', 'Category', 'Amount']],
    body: expenseRows.length > 0 ? expenseRows : [['', 'No expenses for this month', '']],
    margin: { left: ml, right: 14 },
    headStyles: { fillColor: [60, 20, 20], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: { 0: { cellWidth: 12, halign: 'center' }, 1: { cellWidth: 100 }, 2: { cellWidth: 48, halign: 'right' } },
    tableLineColor: [210, 210, 210], tableLineWidth: 0.2,
  });

  const footY = doc.internal.pageSize.getHeight() - 10;
  doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(ml, footY - 3, mr, footY - 3);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(130);
  doc.text('ABUJA PRECAST CONCRETE LIMITED  ·  Tel: 09055541433, 07030647949  ·  iabujaprecast@gmail.com', W / 2, footY + 1, { align: 'center' });

  doc.save(`ManagementAccounts_${new Date().toISOString().split('T')[0]}.pdf`);
}
