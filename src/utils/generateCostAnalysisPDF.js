import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${day}-${months[parseInt(m,10)-1]}-${y}`;
}

const N = (n) => `₦${Number(n || 0).toLocaleString()}`;
const pct = (n) => `${Number(n || 0).toFixed(1)}%`;

export async function generateCostAnalysisPDF({ fromDate, toDate, productTotals, totalExpenses, products }) {
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
  doc.text('COST PER UNIT ANALYSIS', mr, 13, { align: 'right' });

  const period = (fromDate || toDate)
    ? `${fromDate ? fmtDate(fromDate) : 'All time'} — ${toDate ? fmtDate(toDate) : 'Present'}`
    : 'All Time';
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
  doc.text(`Period: ${period}`, mr, 20, { align: 'right' });

  doc.setDrawColor(180); doc.setLineWidth(0.5); doc.line(ml, 27, mr, 27);

  const totalQty = Object.values(productTotals).reduce((s, v) => s + v, 0);
  const productMap = Object.fromEntries(products.map(p => [p.name, p]));

  const rows = Object.entries(productTotals).map(([name, qty]) => {
    const share = totalQty > 0 ? qty / totalQty : 0;
    const allocatedCost = totalExpenses * share;
    const costPerUnit = qty > 0 ? allocatedCost / qty : 0;
    const sellingPrice = productMap[name]?.unit_price || 0;
    const margin = sellingPrice > 0 ? ((sellingPrice - costPerUnit) / sellingPrice) * 100 : 0;
    const unit = productMap[name]?.unit || 'pcs';
    const isProfit = sellingPrice > costPerUnit;
    return [
      name,
      `${Number(qty).toLocaleString()} ${unit}`,
      { content: N(allocatedCost), styles: { halign: 'right' } },
      { content: N(costPerUnit), styles: { halign: 'right' } },
      { content: sellingPrice > 0 ? N(sellingPrice) : '—', styles: { halign: 'right' } },
      { content: sellingPrice > 0 ? N(sellingPrice - costPerUnit) : '—', styles: { halign: 'right', textColor: isProfit ? [34, 150, 100] : [200, 50, 50], fontStyle: 'bold' } },
      { content: sellingPrice > 0 ? pct(margin) : '—', styles: { halign: 'right', textColor: isProfit ? [34, 150, 100] : [200, 50, 50], fontStyle: 'bold' } },
    ];
  });

  autoTable(doc, {
    startY: 32,
    head: [['Product', 'Units Produced', 'Allocated Cost', 'Cost / Unit', 'Selling Price', 'Gross Profit / Unit', 'Margin %']],
    body: rows.length > 0 ? rows : [['No production data in selected period', '', '', '', '', '', '']],
    margin: { left: ml, right: 14 },
    headStyles: { fillColor: [25, 25, 25], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 38, halign: 'center' },
      2: { cellWidth: 38, halign: 'right' },
      3: { cellWidth: 35, halign: 'right' },
      4: { cellWidth: 35, halign: 'right' },
      5: { cellWidth: 42, halign: 'right' },
      6: { cellWidth: 25, halign: 'right' },
    },
    tableLineColor: [210, 210, 210], tableLineWidth: 0.25,
  });

  const y = doc.lastAutoTable.finalY + 8;

  const boxH = 24;
  doc.setFillColor(248, 248, 252);
  doc.setDrawColor(200, 200, 220);
  doc.setLineWidth(0.4);
  doc.roundedRect(ml, y, mr - ml, boxH, 2, 2, 'FD');

  const items = [
    { label: 'TOTAL UNITS PRODUCED', value: Number(totalQty).toLocaleString(), color: [30, 30, 30] },
    { label: 'TOTAL COST (PERIOD)', value: N(totalExpenses), color: [200, 50, 50] },
    { label: 'AVG COST / UNIT', value: totalQty > 0 ? N(totalExpenses / totalQty) : '—', color: [91, 141, 238] },
  ];

  const colW = (mr - ml - 8) / 3;
  items.forEach(({ label, value, color }, i) => {
    const cx = ml + 4 + i * colW;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120);
    doc.text(label, cx, y + 9);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...color);
    doc.text(value, cx, y + 18);
  });

  const footY = doc.internal.pageSize.getHeight() - 10;
  doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(ml, footY - 3, mr, footY - 3);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(130);
  doc.text('ABUJA PRECAST CONCRETE LIMITED  ·  Tel: 09055541433, 07030647949  ·  iabujaprecast@gmail.com', W / 2, footY + 1, { align: 'center' });

  doc.save(`CostAnalysis_${new Date().toISOString().split('T')[0]}.pdf`);
}
