import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const N = (n) => `N${Number(n || 0).toLocaleString()}`;
function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${day}-${months[parseInt(m,10)-1]}-${y}`;
}

export async function generatePayrollPDF(run, lines) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const ml = 14, mr = W - 14;

  // Logo
  try {
    const res = await fetch('/logo.png');
    const blob = await res.blob();
    const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
    doc.addImage(b64, 'PNG', ml, 8, 28, 14);
  } catch {}

  // Header
  doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(20);
  doc.text('ABUJA PRECAST CONCRETE LIMITED', ml + 32, 13);
  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
  doc.text('RC: 1838184  |  1, Dutse Alhaji, Off Bwari Expressway, Abuja', ml + 32, 18);

  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(245, 166, 35);
  doc.text('PAYROLL REPORT', mr, 13, { align: 'right' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
  doc.text(`Period: ${fmtDate(run.period_from)} — ${fmtDate(run.period_to)}`, mr, 20, { align: 'right' });

  doc.setDrawColor(180); doc.setLineWidth(0.5); doc.line(ml, 26, mr, 26);

  // Meta
  doc.setFontSize(8.5); doc.setTextColor(80);
  doc.text(`Run Date: ${fmtDate(run.run_date)}`, ml, 33);
  doc.text(`Prepared by: ${run.prepared_by || '—'}`, ml + 60, 33);
  doc.text(`Status: ${(run.status || 'draft').toUpperCase()}`, ml + 130, 33);
  if (run.approved_by) doc.text(`Approved by: ${run.approved_by}`, ml + 60, 38);

  // Main table
  const daily = lines.filter(l => l.staff_type === 'daily');
  const perm  = lines.filter(l => l.staff_type === 'permanent');
  const allLines = [...daily, ...perm];

  const tableBody = allLines.map((l, i) => [
    String(i + 1),
    l.staff?.full_name || '—',
    l.staff?.role || '—',
    l.staff_type === 'daily' ? 'Daily' : 'Permanent',
    l.staff_type === 'daily' ? String(l.days_present || 0) + ' days' : '1 month',
    l.staff_type === 'daily' ? N(l.daily_rate) + '/day' : N(l.monthly_salary) + '/mo',
    N(l.amount_due),
    l.amount_paid != null ? N(l.amount_paid) : '—',
    l.amount_due - (l.amount_paid || 0) > 0 ? N(l.amount_due - (l.amount_paid || 0)) : '—',
    '',
  ]);

  autoTable(doc, {
    startY: 42,
    head: [['S/N', 'Staff Name', 'Role', 'Type', 'Days/Period', 'Rate', 'Amount Due', 'Amount Paid', 'Balance', 'Signature']],
    body: tableBody,
    margin: { left: ml, right: 14 },
    headStyles: { fillColor: [25,25,25], textColor: [255,255,255], fontStyle: 'bold', fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: [25,25,25] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 32 },
      2: { cellWidth: 20 },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 18, halign: 'center' },
      5: { cellWidth: 20, halign: 'right' },
      6: { cellWidth: 22, halign: 'right' },
      7: { cellWidth: 22, halign: 'right' },
      8: { cellWidth: 18, halign: 'right' },
      9: { cellWidth: 22 },
    },
    didParseCell: (d) => {
      if (d.section === 'body') {
        const line = allLines[d.row.index];
        if (line?.staff_type === 'permanent') d.cell.styles.fillColor = [245, 248, 255];
      }
    },
    tableLineColor: [200,200,200], tableLineWidth: 0.25,
  });

  const endY = doc.lastAutoTable.finalY + 8;

  // Summary box
  const dailyTotal = daily.reduce((s, l) => s + Number(l.amount_due || 0), 0);
  const permTotal  = perm.reduce((s,  l) => s + Number(l.amount_due || 0), 0);
  const grand = dailyTotal + permTotal;

  const bh = 38;
  doc.setFillColor(248, 248, 252); doc.setDrawColor(200, 200, 220); doc.setLineWidth(0.4);
  doc.roundedRect(ml, endY, mr - ml, bh, 2, 2, 'FD');

  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(60);
  doc.text('PAYROLL SUMMARY', ml + 4, endY + 7);

  const cols = [
    [`Daily Workers (${daily.length} staff)`, N(dailyTotal), [245, 166, 35]],
    [`Permanent Staff (${perm.length} staff)`, N(permTotal), [91, 141, 238]],
    ['Grand Total', N(grand), [30, 180, 130]],
  ];
  const cw = (mr - ml - 8) / 3;
  cols.forEach(([label, val, color], i) => {
    const cx = ml + 4 + i * cw;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(100);
    doc.text(label, cx, endY + 16);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...color);
    doc.text(val, cx, endY + 26);
  });

  // Signatures
  const sigY = endY + bh + 12;
  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(60);
  doc.text('Prepared by: ______________________________', ml, sigY);
  doc.text('Approved by (MD): ______________________________', ml + 100, sigY);
  doc.text('Date: ______________', ml, sigY + 8);
  doc.text('Date: ______________', ml + 100, sigY + 8);

  // Footer
  const H = doc.internal.pageSize.getHeight();
  doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(ml, H - 14, mr, H - 14);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(140);
  doc.text('CONFIDENTIAL — Abuja Precast Concrete Limited Payroll Document', W / 2, H - 9, { align: 'center' });

  const fname = `Payroll_${run.period_from}_to_${run.period_to}.pdf`;
  doc.save(fname);
}
