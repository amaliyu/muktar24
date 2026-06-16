import jsPDF from 'jspdf';
import JsBarcode from 'jsbarcode';

// ── Brand palette ────────────────────────────────────────────────
const NAVY = [13, 27, 75];       // #0d1b4b — sidebar, headings
const CYAN = [74, 184, 212];     // #4ab8d4 — accents, company name
const WHITE = [255, 255, 255];
const DARK = [20, 25, 55];       // near-black for body text
const GRID = [228, 235, 248];    // faint background grid

const ADDRESS = 'No 1 Dutse, Off Bwari Expressway, Bmuko Village, Abuja, Nigeria';

const TERMS_ID =
  'Employees are required to keep their ID badge visible or easily ' +
  'accessible during working hours to confirm identity when needed.';

const TERMS_USE =
  'The ID badge is issued solely for company-related activities. It may ' +
  'not be lent, duplicated, or used for any non-official purpose.';

const PRODUCTS = [
  'High Quality Turkish Designed Blocks',
  'Paving Stones (Interlocks)',
  'Kerb Stones',
  'Quarry Materials (Chippings, Stone Base, Stone dust, hard core)',
];

// ── Helpers ──────────────────────────────────────────────────────

async function fetchAsDataUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching image`);
  const blob = await res.blob();
  const format = blob.type.includes('png') ? 'PNG' : 'JPEG';
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve({ dataUrl: fr.result, format });
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

function makeBarcodeDataUrl(value) {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, value || 'APC', {
    format: 'CODE128',
    width: 2,
    height: 56,
    displayValue: false,
    margin: 4,
    background: '#ffffff',
    lineColor: '#000000',
  });
  return canvas.toDataURL('image/png');
}

// ── ID CARD — Portrait 54 × 86 mm ────────────────────────────────

export async function generateIDCardPDF(staff, photoSignedUrl) {
  const W = 54, H = 86;
  const SB = 11;    // sidebar width (right side)
  const CW = W - SB;

  const { dataUrl: logoUrl } = await fetchAsDataUrl('/logo.png');

  let photoUrl = null, photoFmt = 'JPEG';
  if (photoSignedUrl) {
    try {
      const r = await fetchAsDataUrl(photoSignedUrl);
      photoUrl = r.dataUrl;
      photoFmt = r.format;
    } catch { /* draw placeholder instead */ }
  }

  const barcode = makeBarcodeDataUrl(staff.employee_number || 'APC');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [W, H] });

  drawIDFront(doc, staff, logoUrl, photoUrl, photoFmt, barcode, W, H, SB, CW);

  doc.addPage([W, H], 'portrait');
  drawIDBack(doc, logoUrl, W, H);

  const safe = (staff.employee_number || staff.full_name || 'ID').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`ID_Card_${safe}.pdf`);
}

function drawIDFront(doc, staff, logoUrl, photoUrl, photoFmt, barcode, W, H, SB, CW) {
  // Background
  doc.setFillColor(...WHITE);
  doc.rect(0, 0, W, H, 'F');

  // Faint grid
  doc.setDrawColor(...GRID);
  doc.setLineWidth(0.08);
  for (let x = 2; x < CW; x += 4) doc.line(x, 0, x, H);
  for (let y = 2; y < H; y += 4) doc.line(0, y, CW, y);

  // Right sidebar
  doc.setFillColor(...NAVY);
  doc.rect(CW, 0, SB, H, 'F');

  // Sidebar: job title rotated (reads bottom → top)
  const jobTitle = (staff.job_title || 'STAFF').toUpperCase();
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text(jobTitle, CW + SB / 2, H - 8, { angle: 90, align: 'right' });

  // Logo
  doc.addImage(logoUrl, 'PNG', 2, 2, 11, 6);

  // Company name beside logo
  doc.setTextColor(...CYAN);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.text('Abuja Precast', 14.5, 4.5);
  doc.text('Concrete Ltd', 14.5, 7.5);

  // Photo with cyan border
  const PW = 27, PH = 27, PX = (CW - PW) / 2, PY = 12, B = 0.8;
  doc.setFillColor(...CYAN);
  doc.rect(PX - B, PY - B, PW + 2 * B, PH + 2 * B, 'F');

  if (photoUrl) {
    doc.addImage(photoUrl, photoFmt, PX, PY, PW, PH);
  } else {
    doc.setFillColor(235, 240, 250);
    doc.rect(PX, PY, PW, PH, 'F');
    doc.setTextColor(170, 180, 205);
    doc.setFontSize(6);
    doc.text('PHOTO', PX + PW / 2, PY + PH / 2 + 1, { align: 'center' });
  }

  // Name
  const nameParts = (staff.full_name || '').trim().split(/\s+/);
  const nameY = PY + PH + 5;
  doc.setTextColor(...CYAN);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);

  const mid = Math.ceil(nameParts.length / 2);
  if (nameParts.length <= 2) {
    doc.text(staff.full_name || '', CW / 2, nameY, { align: 'center' });
  } else {
    doc.text(nameParts.slice(0, mid).join(' '), CW / 2, nameY, { align: 'center' });
    doc.text(nameParts.slice(mid).join(' '), CW / 2, nameY + 4, { align: 'center' });
  }

  // Details block
  let dy = nameY + (nameParts.length > 2 ? 9 : 5);
  doc.setFontSize(5);

  const detailRow = (label, value) => {
    const v = value.length > 23 ? value.slice(0, 22) + '…' : value;
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK);
    doc.text(label, 3, dy);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(55, 60, 90);
    doc.text(`: ${v}`, 14, dy);
    dy += 3.5;
  };

  detailRow('ID No', staff.employee_number || '—');
  if (staff.email)          detailRow('Email', staff.email);
  if (staff.phone?.trim())  detailRow('Phone', staff.phone.trim());

  // Barcode
  const BW = 33, BH = 8;
  doc.addImage(barcode, 'PNG', (CW - BW) / 2, H - BH - 2, BW, BH);
}

function drawIDBack(doc, logoUrl, W, H) {
  // Background + grid
  doc.setFillColor(...WHITE);
  doc.rect(0, 0, W, H, 'F');
  doc.setDrawColor(...GRID);
  doc.setLineWidth(0.08);
  for (let x = 2; x < W; x += 4) doc.line(x, 0, x, H);
  for (let y = 2; y < H; y += 4) doc.line(0, y, W, y);

  // Corner L-shaped accents (cyan)
  doc.setFillColor(...CYAN);
  const corners = [
    [0, 0],         // top-left
    [W - 6, 0],     // top-right (horizontal arm goes left, start = W-6)
    [0, H - 2.5],   // bottom-left
    [W - 6, H - 2.5], // bottom-right
  ];
  // Horizontal bars
  for (const [cx, cy] of corners) doc.rect(cx, cy, 6, 2.5, 'F');
  // Vertical bars
  const vCorners = [[0, 0], [W - 2.5, 0], [0, H - 6], [W - 2.5, H - 6]];
  for (const [cx, cy] of vCorners) doc.rect(cx, cy, 2.5, 6, 'F');

  // Logo + company name
  doc.addImage(logoUrl, 'PNG', 3, 5, 11, 6);
  doc.setTextColor(...CYAN);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.text('Abuja Precast Concrete Limited', 16, 7);

  // Heading
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...DARK);
  doc.text('TERMS & CONDITIONS', W / 2, 18, { align: 'center' });

  // Clause helper
  let y = 23;
  const LINE_H = 5 * 1.15 / 2.8346; // 5pt line height in mm ≈ 2.03mm

  const clause = (title, body) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(5.5); doc.setTextColor(...DARK);
    doc.text(title, 4, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5); doc.setTextColor(50, 55, 80);
    const lines = doc.splitTextToSize(body, W - 8);
    doc.text(lines, 4, y + 3.5);
    y += 3.5 + lines.length * LINE_H + 3;
  };

  clause('Identification:', TERMS_ID);
  clause('Proper Use:', TERMS_USE);

  // Address
  y += 2;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(5.5); doc.setTextColor(...DARK);
  const addrLines = doc.splitTextToSize(`Address: ${ADDRESS}`, W - 8);
  doc.text(addrLines, 4, y);
}

// ── BUSINESS CARD — Landscape 85 × 55 mm ─────────────────────────

export async function generateBusinessCardPDF(staff) {
  const W = 85, H = 55;

  const { dataUrl: logoUrl } = await fetchAsDataUrl('/logo.png');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [W, H] });

  drawBizFront(doc, staff, logoUrl, W, H);

  doc.addPage([W, H], 'landscape');
  drawBizBack(doc, logoUrl, W, H);

  const safe = (staff.full_name || 'Business_Card').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Business_Card_${safe}.pdf`);
}

function drawBizFront(doc, staff, logoUrl, W, H) {
  doc.setFillColor(...WHITE);
  doc.rect(0, 0, W, H, 'F');

  // Logo + company header
  doc.addImage(logoUrl, 'PNG', 4, 3, 13, 7);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text('ABUJA', 19, 7.5);

  doc.setFont('helvetica', 'normal'); doc.setFontSize(6);
  doc.setTextColor(80, 90, 130);
  doc.text('PRECAST CONCRETE', 19, 11.5);

  // Decorative lines
  doc.setDrawColor(185, 190, 210); doc.setLineWidth(0.4);
  doc.line(50, 5.5, W - 4, 5.5);
  doc.setDrawColor(...CYAN); doc.setLineWidth(0.8);
  doc.line(50, 8.5, W - 4, 8.5);

  // Header divider
  doc.setDrawColor(230, 235, 245); doc.setLineWidth(0.3);
  doc.line(4, 15.5, W - 4, 15.5);

  // Staff name
  const name = (staff.full_name || '').toUpperCase();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.setTextColor(...DARK);
  const nameLines = doc.splitTextToSize(name, W - 8);
  const nameY = 22;
  doc.text(nameLines, 5, nameY);

  const LINE_H_10 = 10 * 1.15 / 2.8346; // ~4.06mm
  const afterNameY = nameY + nameLines.length * LINE_H_10;

  // Job title
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.setTextColor(...CYAN);
  doc.text(staff.job_title || '', 5, afterNameY + 1.5);

  // Section divider
  doc.setDrawColor(230, 235, 245); doc.setLineWidth(0.3);
  doc.line(5, afterNameY + 5.5, W - 5, afterNameY + 5.5);

  // Contact details
  let cy = afterNameY + 9.5;
  const LINE_H_65 = 6.5 * 1.15 / 2.8346; // ~2.64mm

  const contactLine = (text) => {
    doc.setFillColor(...CYAN);
    doc.circle(6.5, cy - 1.2, 1.3, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
    doc.setTextColor(45, 50, 80);
    const lines = doc.splitTextToSize(text, W - 16);
    doc.text(lines, 10, cy);
    cy += lines.length * LINE_H_65 + 1.5;
  };

  const phone = staff.phone?.trim();
  if (phone)       contactLine(phone);
  if (staff.email) contactLine(staff.email);
  contactLine(ADDRESS);
}

function drawBizBack(doc, logoUrl, W, H) {
  doc.setFillColor(...WHITE);
  doc.rect(0, 0, W, H, 'F');

  // Centered logo + company name
  const lx = W / 2 - 22;
  doc.addImage(logoUrl, 'PNG', lx, 4, 13, 7);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text('ABUJA', lx + 15, 8.5);

  doc.setFont('helvetica', 'normal'); doc.setFontSize(6);
  doc.setTextColor(80, 90, 130);
  doc.text('PRECAST CONCRETE', lx + 15, 12.5);

  // Divider
  doc.setDrawColor(220, 228, 242); doc.setLineWidth(0.35);
  doc.line(5, 17, W - 5, 17);

  // Products heading
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text('OUR PRODUCTS', 5, 24);
  doc.setDrawColor(...DARK); doc.setLineWidth(0.4);
  doc.line(5, 25.5, 42, 25.5);

  // Products list
  doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5);
  doc.setTextColor(...DARK);
  let py = 31;
  const LINE_H_75 = 7.5 * 1.15 / 2.8346;
  for (const p of PRODUCTS) {
    const lines = doc.splitTextToSize(`¤  ${p}`, W - 12);
    doc.text(lines, 6, py);
    py += lines.length * LINE_H_75 + 1;
  }
}
