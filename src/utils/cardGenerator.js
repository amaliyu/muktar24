import jsPDF from 'jspdf';
import JsBarcode from 'jsbarcode';

// ── Brand palette ────────────────────────────────────────────────
const NAVY  = [13, 27, 75];     // #0d1b4b — sidebar, headings
const CYAN  = [0, 188, 212];    // #00bcd4 — ID card company name & employee name
const BLUE  = [25, 82, 163];    // #1952a3 — business card job title & icons
const WHITE = [255, 255, 255];
const DARK  = [15, 22, 55];
const MID   = [80, 90, 130];
const GRID  = [228, 235, 248];

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
    fr.onload  = () => resolve({ dataUrl: fr.result, format });
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

// Fetch the pre-cropped icon-only logo (no text, no RC number).
// Returns null on any failure so callers skip the logo rather than abort.
async function fetchLogoIconAsDataUrl() {
  try {
    const { dataUrl } = await fetchAsDataUrl('/logo-icon.png');
    return dataUrl;
  } catch {
    return null;
  }
}

function makeBarcodeDataUrl(value) {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, value || 'APC', {
    format: 'CODE128',
    width: 2,
    height: 50,
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
  const SB = 11;       // sidebar width (right)
  const CW = W - SB;

  // Logo failure must never abort card generation — we draw without it if needed.
  let iconUrl = null;
  try { iconUrl = await fetchLogoIconAsDataUrl(); } catch { /* skip logo */ }

  let photoUrl = null, photoFmt = 'JPEG';
  if (photoSignedUrl) {
    try {
      const r = await fetchAsDataUrl(photoSignedUrl);
      photoUrl = r.dataUrl;
      photoFmt = r.format;
    } catch { /* draw placeholder */ }
  }

  const barcode = makeBarcodeDataUrl(staff.employee_number || 'APC');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [W, H] });

  drawIDFront(doc, staff, iconUrl, photoUrl, photoFmt, barcode, W, H, SB, CW);
  doc.addPage([W, H], 'portrait');
  drawIDBack(doc, iconUrl, W, H);

  const safe = (staff.employee_number || staff.full_name || 'ID').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`ID_Card_${safe}.pdf`);
}

function drawIDFront(doc, staff, iconUrl, photoUrl, photoFmt, barcode, W, H, SB, CW) {
  // White background
  doc.setFillColor(...WHITE);
  doc.rect(0, 0, W, H, 'F');

  // Faint grid (content area only)
  doc.setDrawColor(...GRID);
  doc.setLineWidth(0.08);
  for (let x = 2; x < CW; x += 4) doc.line(x, 0, x, H);
  for (let y = 2; y < H; y += 4) doc.line(0, y, CW, y);

  // Navy sidebar on right
  doc.setFillColor(...NAVY);
  doc.rect(CW, 0, SB, H, 'F');

  // Job title — vertical, centred in sidebar, reads bottom → top
  const jobTitle = (staff.job_title?.trim() || staff.role || 'STAFF').toUpperCase();
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  const jTW = doc.getTextWidth(jobTitle);
  doc.text(jobTitle, CW + SB / 2, H / 2 + jTW / 2, { angle: 90 });

  // Logo: icon mark only (no company text, no RC number from the PNG)
  if (iconUrl) doc.addImage(iconUrl, 'PNG', 2, 2, 9, 9);

  // Company name — muted blue/grey (MID), not bright cyan
  doc.setTextColor(...MID);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.text('Abuja Precast', 12.5, 5);
  doc.text('Concrete Ltd', 12.5, 8.5);

  // Photo with prominent CYAN border — extra top margin for breathing room
  const PW = 28, PH = 28;
  const PX = (CW - PW) / 2;
  const PY = 16;
  const B  = 1.2; // border thickness (mm)

  doc.setFillColor(...CYAN);
  doc.rect(PX - B, PY - B, PW + 2 * B, PH + 2 * B, 'F');

  if (photoUrl) {
    doc.addImage(photoUrl, photoFmt, PX, PY, PW, PH);
  } else {
    doc.setFillColor(235, 240, 250);
    doc.rect(PX, PY, PW, PH, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(170, 180, 205);
    doc.text('PHOTO', PX + PW / 2, PY + PH / 2 + 1, { align: 'center' });
  }

  // Employee name below photo — dark navy bold (CYAN was too light to read)
  const nameParts = (staff.full_name || '').trim().split(/\s+/);
  const nameY = PY + PH + 5;
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);

  const mid = Math.ceil(nameParts.length / 2);
  if (nameParts.length <= 2) {
    doc.text(staff.full_name || '', CW / 2, nameY, { align: 'center' });
  } else {
    doc.text(nameParts.slice(0, mid).join(' '), CW / 2, nameY,     { align: 'center' });
    doc.text(nameParts.slice(mid).join(' '),     CW / 2, nameY + 4, { align: 'center' });
  }

  // Detail block: ID No, Email (if present), Phone (if present)
  let dy = nameY + (nameParts.length > 2 ? 9 : 5);
  doc.setFontSize(5);

  const detailRow = (label, value) => {
    const v = value.length > 23 ? value.slice(0, 22) + '…' : value;
    doc.setFont('helvetica', 'bold');   doc.setTextColor(...DARK);
    doc.text(label, 3, dy);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(55, 60, 90);
    doc.text(`: ${v}`, 14, dy);
    dy += 3.5;
  };

  detailRow('ID No', staff.employee_number || '—');
  if (staff.email)          detailRow('Email', staff.email);
  if (staff.phone?.trim())  detailRow('Phone', staff.phone.trim());

  // Barcode — spans nearly full content width, raised clear of corner accent
  const BW = CW - 4, BH = 7;
  doc.addImage(barcode, 'PNG', 2, H - BH - 10, BW, BH);

  // Bottom-left corner: two stacked CYAN squares (decorative)
  doc.setFillColor(...CYAN);
  doc.rect(0, H - 9,  5, 4.5, 'F');  // upper square
  doc.rect(0, H - 4,  5, 4.5, 'F');  // lower square (partially outside bottom edge)
}

function drawIDBack(doc, iconUrl, W, H) {
  // White background + faint grid
  doc.setFillColor(...WHITE);
  doc.rect(0, 0, W, H, 'F');
  doc.setDrawColor(...GRID);
  doc.setLineWidth(0.08);
  for (let x = 2; x < W; x += 4) doc.line(x, 0, x, H);
  for (let y = 2; y < H; y += 4) doc.line(0, y, W, y);

  // Corner accent squares — staircase pattern
  doc.setFillColor(...CYAN);
  // Top-right staircase (two rectangles stepping into the card)
  doc.rect(W - 8,   0,  8, 4.5, 'F');
  doc.rect(W - 5.5, 4.5, 5.5, 4, 'F');
  // Bottom-right staircase
  doc.rect(W - 8,   H - 4.5, 8,   4.5, 'F');
  doc.rect(W - 5.5, H - 8.5, 5.5, 4,   'F');
  // Top-left small square
  doc.rect(0, 0, 4.5, 4.5, 'F');
  // Bottom-left small square
  doc.rect(0, H - 4.5, 4.5, 4.5, 'F');

  // Logo: icon mark + two-line company name as strong header
  if (iconUrl) doc.addImage(iconUrl, 'PNG', 3, 5, 10, 10);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text('ABUJA PRECAST', 15, 8.5);
  doc.setFontSize(7);
  doc.setTextColor(...MID);
  doc.text('CONCRETE LIMITED', 15, 13.5);

  // TERMS & CONDITIONS — left-aligned bold black heading
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text('TERMS & CONDITIONS', 4, 21);

  // Inline terms clauses: bold label + normal body on same line, wrapping to full width
  const FS      = 5.5;
  const LINE_H  = FS * 1.25 / 2.8346; // ≈ 2.44 mm per line

  let y = 26.5;

  const inlineClause = (title, body) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FS);
    doc.setTextColor(...DARK);
    const titleW = doc.getTextWidth(title + ' ');
    doc.text(title, 4, y);

    // First line: body text starts right after the title on the same baseline
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(50, 55, 80);
    const availFirst = W - 8 - titleW;
    const firstLine  = availFirst > 4 ? (doc.splitTextToSize(body, availFirst)[0] || '') : '';
    if (firstLine) doc.text(firstLine, 4 + titleW, y);

    // Remaining body text wraps at full margin width
    const remaining = body.slice(firstLine.length).trimStart();
    if (remaining) {
      const restLines = doc.splitTextToSize(remaining, W - 8);
      doc.text(restLines, 4, y + LINE_H);
      y += LINE_H * (1 + restLines.length) + 4;
    } else {
      y += LINE_H + 4;
    }
  };

  inlineClause('Identification:', TERMS_ID);
  inlineClause('Proper Use:', TERMS_USE);

  // Address block
  y += 3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(...DARK);
  const addrLines = doc.splitTextToSize(`Address: ${ADDRESS}`, W - 8);
  doc.text(addrLines, 4, y);
}

// ── BUSINESS CARD — Landscape 85 × 55 mm ─────────────────────────

export async function generateBusinessCardPDF(staff) {
  const W = 85, H = 55;

  let iconUrl = null;
  try { iconUrl = await fetchLogoIconAsDataUrl(); } catch { /* skip logo */ }
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [W, H] });

  drawBizFront(doc, staff, iconUrl, W, H);
  doc.addPage([W, H], 'landscape');
  drawBizBack(doc, iconUrl, W, H);

  const safe = (staff.full_name || 'Business_Card').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Business_Card_${safe}.pdf`);
}

function drawBizFront(doc, staff, iconUrl, W, H) {
  doc.setFillColor(...WHITE);
  doc.rect(0, 0, W, H, 'F');

  // Header: icon mark + company name text (drawn by code, not from PNG)
  if (iconUrl) doc.addImage(iconUrl, 'PNG', 4, 3, 12, 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text('ABUJA', 18, 8.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...MID);
  doc.text('PRECAST CONCRETE', 18, 13);

  // Single divider line: grey left half → brand blue right half
  const lnX1 = 35, lnX2 = W - 4, lnMid = (lnX1 + lnX2) / 2, lnY = 9.5;
  doc.setLineWidth(0.8);
  doc.setDrawColor(190, 195, 215);   // grey left segment
  doc.line(lnX1, lnY, lnMid, lnY);
  doc.setDrawColor(...BLUE);         // brand blue right segment
  doc.line(lnMid, lnY, lnX2, lnY);

  // Header divider
  doc.setDrawColor(225, 230, 245); doc.setLineWidth(0.3);
  doc.line(4, 17, W - 4, 17);

  // Staff name — largest text block on front face
  const name = (staff.full_name || '').toUpperCase();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  const nameLines = doc.splitTextToSize(name, W - 10);
  const nameY = 24;
  doc.text(nameLines, 5, nameY);
  const LINE_H_11 = 11 * 1.2 / 2.8346; // ≈ 4.66 mm
  const afterNameY = nameY + nameLines.length * LINE_H_11;

  // Job title — clearly smaller than the name
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...BLUE);
  doc.text(staff.job_title || staff.role || '', 5, afterNameY + 2);

  // Section divider
  doc.setDrawColor(225, 230, 245); doc.setLineWidth(0.3);
  doc.line(5, afterNameY + 6, W - 5, afterNameY + 6);

  // Contact details with icon circles
  let cy = afterNameY + 11;
  const R       = 2.0;  // circle radius (mm)
  const LINE_H  = 6.5 * 1.2 / 2.8346; // ≈ 2.76 mm

  const drawIconCircle = (x, y, type) => {
    // Background circle
    doc.setFillColor(...BLUE);
    doc.circle(x, y, R, 'F');

    // White icon drawn with primitives
    doc.setFillColor(...WHITE);
    doc.setDrawColor(...WHITE);

    if (type === 'phone') {
      // Simplified handset: diagonal bar with rounded ends
      doc.setLineWidth(0.5);
      doc.line(x - 1.0, y + 0.85, x + 1.0, y - 0.85);
      doc.circle(x - 0.85, y + 0.75, 0.32, 'F');
      doc.circle(x + 0.85, y - 0.75, 0.32, 'F');
    } else if (type === 'email') {
      // Simplified envelope: rectangle + V flap
      doc.setLineWidth(0.28);
      doc.rect(x - 1.1, y - 0.65, 2.2, 1.4);
      doc.line(x - 1.1, y - 0.65, x, y + 0.15);
      doc.line(x + 1.1, y - 0.65, x, y + 0.15);
    } else if (type === 'location') {
      // Simplified pin: filled circle + downward triangle
      doc.circle(x, y - 0.5, 0.75, 'F');
      doc.setLineWidth(0.4);
      doc.line(x - 0.55, y + 0.15, x,      y + 1.1);
      doc.line(x + 0.55, y + 0.15, x,      y + 1.1);
    }
  };

  const contactLine = (text, type) => {
    drawIconCircle(6.5, cy - 1.0, type);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(45, 50, 80);
    const lines = doc.splitTextToSize(text, W - 16);
    doc.text(lines, 11, cy);
    cy += lines.length * LINE_H + 1.5;
  };

  const phone = staff.phone?.trim();
  if (phone)       contactLine(phone, 'phone');
  if (staff.email) contactLine(staff.email, 'email');
  contactLine(ADDRESS, 'location');
}

function drawBizBack(doc, iconUrl, W, H) {
  doc.setFillColor(...WHITE);
  doc.rect(0, 0, W, H, 'F');

  // Centred logo block: icon mark + company name text
  const ICON_W = 14, ICON_H = 14;
  const lx = W / 2 - 20;

  if (iconUrl) doc.addImage(iconUrl, 'PNG', lx, 3, ICON_W, ICON_H);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...DARK);
  doc.text('ABUJA PRECAST', lx + 16, 9);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...MID);
  doc.text('CONCRETE LIMITED', lx + 16, 14.5);

  // OUR PRODUCTS heading (no divider line between logo and products)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text('OUR PRODUCTS', 5, 25);
  doc.setDrawColor(...DARK); doc.setLineWidth(0.4);
  doc.line(5, 26.5, 47, 26.5);

  // Products list
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(...DARK);
  let py = 32;
  const LINE_H_75 = 7.5 * 1.2 / 2.8346; // ≈ 3.18 mm
  for (const p of PRODUCTS) {
    const lines = doc.splitTextToSize(`¤  ${p}`, W - 12);
    doc.text(lines, 6, py);
    py += lines.length * LINE_H_75 + 1;
  }
}
