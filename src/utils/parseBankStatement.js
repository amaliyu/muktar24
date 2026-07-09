import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

function excelSerialToDate(serial) {
  const excelEpoch = new Date(1899, 11, 30); // Dec 30 1899 — Excel's day-0
  const date = new Date(excelEpoch);
  date.setDate(excelEpoch.getDate() + Math.floor(serial));
  return date.toISOString().split('T')[0];
}

function parseNgDate(str) {
  if (str === null || str === undefined || str === '') return null;

  // Excel serial as a raw JS number (from xlsx raw:true) — covers years 2009-2036
  if (typeof str === 'number') {
    if (str > 40000 && str < 50000) return excelSerialToDate(str);
    return null; // number outside date range — not a date
  }

  const s = String(str).trim();
  if (!s) return null;

  // Excel serial stringified (e.g. "46130.44667824074")
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 40000 && n < 50000) return excelSerialToDate(n);
  }
  // DD/MM/YYYY or D/M/YYYY
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const months = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  // DD-Mon-YYYY e.g. 15-Jan-2024
  const m2 = s.match(/^(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{4})$/);
  if (m2) {
    const mo = months[m2[2].toLowerCase()];
    if (mo) return `${m2[3]}-${String(mo).padStart(2,'0')}-${m2[1].padStart(2,'0')}`;
  }
  // DD-Mon-YY e.g. 06-JAN-26 (TAJ Bank — 2-digit year, assume 2000s)
  const m3 = s.match(/^(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{2})$/);
  if (m3) {
    const mo = months[m3[2].toLowerCase()];
    const yr = 2000 + parseInt(m3[3], 10);
    if (mo) return `${yr}-${String(mo).padStart(2,'0')}-${m3[1].padStart(2,'0')}`;
  }
  return null;
}

function parseAmount(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  return parseFloat(String(v).replace(/[,₦\s]/g, '')) || 0;
}

function isTAJMetaRow(row) {
  const joined = row.map(c => String(c || '').trim()).join(' ').toLowerCase();
  return (
    joined.includes('trans summary') ||
    joined.includes('transaction summary') ||
    (joined.includes('total') && (joined.includes('debit') || joined.includes('credit'))) ||
    (joined.includes('page') && joined.includes('of') && joined.length < 30)
  );
}

// Clean TAJ Bank interbank transfer descriptions — extract meaningful part
function cleanDescription(desc) {
  if (!desc) return '';
  const s = String(desc).trim();
  // TRFIFO/TRFIBK patterns: extract everything after the reference code
  const ifoMatch = s.match(/TRF(?:IFO|IBK|FRM)?[A-Z0-9\/]*[\s\/\-]+(.+)/i);
  if (ifoMatch) return ifoMatch[1].replace(/\s+/g, ' ').trim();
  // Generic TRF
  const trfMatch = s.match(/^TRF[A-Z0-9]*[\s\-]+(.+)/i);
  if (trfMatch) return trfMatch[1].replace(/\s+/g, ' ').trim();
  return s;
}

// Extract potential customer/company name from NIP/transfer bank descriptions
export function extractCustomerFromDesc(desc) {
  if (!desc) return null;
  const s = String(desc).toUpperCase().trim();
  // NIP/INWARD/123456789/CUSTOMERNAME/... or NIP/CUSTOMERNAME
  const nip = s.match(/NIP[\/\s]+(?:INWARD[\/\s]+)?(?:\d+[\/\s]+)?([A-Z][A-Z0-9&\-\. ]+?)(?:\/|\s{2,}|$)/);
  if (nip) return nip[1].trim();
  // TRF FROM CUSTOMERNAME or TRANSFER FROM
  const trfFrom = s.match(/(?:TRF|TRANSFER)\s+(?:FROM|FRM)\s+([A-Z][A-Z0-9&\-\. ]+?)(?:\/|\s{2,}|$)/);
  if (trfFrom) return trfFrom[1].trim();
  // B/O CUSTOMERNAME
  const bo = s.match(/B\/O\s+([A-Z][A-Z0-9&\-\. ]+?)(?:\/|\s{2,}|$)/);
  if (bo) return bo[1].trim();
  return null;
}

// Fuzzy-match an extracted name string against a customers array
function matchCustomerByName(extracted, customers) {
  if (!extracted || !customers?.length) return null;
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const en = norm(extracted);
  let best = null, bestScore = 0;
  for (const c of customers) {
    for (const raw of [c.name, c.company_name].filter(Boolean)) {
      const cn = norm(raw);
      if (!cn) continue;
      if (en.includes(cn) || cn.includes(en)) {
        const score = Math.min(en.length, cn.length) / Math.max(en.length, cn.length);
        if (score > bestScore) { best = c; bestScore = score; }
      }
    }
  }
  return bestScore >= 0.5 ? best : null;
}

// Detect auto-category from description + amount
export function detectCategory(desc, amount) {
  const d = String(desc || '').toLowerCase();
  // Inter-account transfers (APC to APC)
  if (
    (d.includes('abujaprecast') || d.includes('abuja precast')) ||
    (d.includes('b/o abuja') && (d.includes('trf') || d.includes('transfer')))
  ) return 'Inter-Account Transfer';
  if (d.includes('stamp') || d.includes('stampduty') || d.includes('sms alert') || (amount > 0 && amount <= 100)) return 'Bank Charges';
  if (d.includes('salary') || d.includes('payroll') || d.includes('wage')) return 'Staff Wages';
  if (d.includes('cement') || d.includes('stone dust') || d.includes('sharp sand') || d.includes('aggregate') || d.includes('quarry dust')) return 'Raw Materials';
  if (d.includes('diesel') || d.includes('fuel') || d.includes('petrol')) return 'Diesel & Fuel';
  if (d.includes('maintenance') || d.includes('repair') || d.includes('servic')) return 'Machine Maintenance';
  if (d.includes('delivery') || d.includes('transport') || d.includes('logistics')) return 'Delivery Costs';
  return null;
}

// Like parseAmount but returns null (not 0) when the value is absent or
// unparseable — needed so callers can distinguish "zero balance" from "no data".
function parseAmountNullable(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  const s = String(v).trim().replace(/[,₦\s]/g, '');
  if (!s || !/\d/.test(s)) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// Scan `rows` for a cell whose text includes any of `labelKeywords`; then
// return the first parseable number found to the right of that cell in the
// same row, or (if none) in the immediately following row.
function findValueNearLabel(rows, ...labelKeywords) {
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    for (let ci = 0; ci < row.length; ci++) {
      const cell = String(row[ci] || '').trim().toLowerCase();
      if (labelKeywords.some(kw => cell.includes(kw))) {
        // Same row — cells to the right
        for (let ni = ci + 1; ni < row.length; ni++) {
          const v = parseAmountNullable(row[ni]);
          if (v !== null) return v;
        }
        // Next row — first parseable cell
        if (ri + 1 < rows.length) {
          for (const nc of rows[ri + 1]) {
            const v = parseAmountNullable(nc);
            if (v !== null) return v;
          }
        }
        return null; // label found but no adjacent value
      }
    }
  }
  return null;
}

// Extract balance-check values from raw parsed rows.
//
// Primary path (TAJ Bank): looks for a TRANS SUMMARY block whose rows carry
// "Total Credit", "Total Debit", and "Available Balance" directly — those are
// the source of truth rather than a re-sum of every parsed row.
//
// Returns:
//   openingBalance  — from "Balance Brought Forward" / "Opening Balance" row
//   totalCredit     — from TRANS SUMMARY block, or null if not found
//   totalDebit      — from TRANS SUMMARY block, or null if not found
//   closingBalance  — "Available Balance" from TRANS SUMMARY, or null if not found
export function extractStatementSummary(rawRows, colMap) {
  // Opening balance — "Balance Brought Forward" / "Opening Balance" row
  let openingBalance = null;
  for (const row of rawRows) {
    const joined = row.map(c => String(c || '').trim()).join(' ').toLowerCase();
    if (
      joined.includes('balance brought forward') ||
      joined.includes('brought forward') ||
      joined.includes('opening balance')
    ) {
      // Prefer the balance column (most reliable)
      if (colMap && colMap.balance >= 0 && colMap.balance < row.length) {
        const v = parseAmountNullable(row[colMap.balance]);
        if (v !== null && v > 0) { openingBalance = v; break; }
      }
      // Fallback: scan non-date, non-description cells to avoid picking up
      // date serials or text that happen to parse as numbers
      const skipCols = new Set(
        [colMap?.date, colMap?.description].filter(i => typeof i === 'number' && i >= 0)
      );
      for (let ci = 0; ci < row.length; ci++) {
        if (skipCols.has(ci)) continue;
        const v = parseAmountNullable(row[ci]);
        if (v !== null && v > 0) { openingBalance = v; break; }
      }
      break;
    }
  }

  // TRANS SUMMARY block — search all rows for the header
  let summaryStart = -1;
  for (let i = 0; i < rawRows.length; i++) {
    const joined = rawRows[i].map(c => String(c || '').trim()).join(' ').toLowerCase();
    if (joined.includes('trans summary') || joined.includes('transaction summary')) {
      summaryStart = i;
      break;
    }
  }

  if (summaryStart < 0) {
    return { openingBalance, totalCredit: null, totalDebit: null, closingBalance: null };
  }

  const block = rawRows.slice(summaryStart, Math.min(summaryStart + 15, rawRows.length));
  return {
    openingBalance,
    totalCredit:    findValueNearLabel(block, 'total credit', 'total deposit'),
    totalDebit:     findValueNearLabel(block, 'total debit', 'total withdrawal'),
    closingBalance: findValueNearLabel(block, 'available balance', 'closing balance'),
  };
}

export function autoMapColumns(headers) {
  const h = headers.map(c => String(c || '').toLowerCase().trim());
  const find = (kws) => {
    for (const kw of kws) {
      const i = h.findIndex(c => c.includes(kw));
      if (i >= 0) return i;
    }
    return -1;
  };
  return {
    date: find(['trans date', 'tran date', 'transaction date', 'value date', 'date']),
    description: find(['transaction details', 'narration', 'description', 'details', 'particulars', 'remarks', 'trans details']),
    // TAJ Bank: "Withdrawal" = debit; Moniepoint: "Settlement Debit"
    debit: find(['withdrawal', 'settlement debit', 'debit amount', 'dr amount', 'debit', 'dr ']),
    // TAJ Bank: "Deposit" = credit; Moniepoint: "Settlement Credit"
    credit: find(['deposit', 'settlement credit', 'credit amount', 'cr amount', 'credit', 'cr ']),
    balance: find(['running balance', 'balance before', 'balance after', 'balance', 'bal']),
  };
}

function detectHeaderRow(rows) {
  const kws = ['date', 'debit', 'credit', 'balance', 'narration', 'description', 'amount', 'deposit', 'withdrawal', 'details'];
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const rowLow = (rows[i] || []).map(c => String(c || '').toLowerCase());
    if (kws.filter(k => rowLow.some(c => c.includes(k))).length >= 3) return i;
  }
  return 0;
}

export async function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      skipEmptyLines: true,
      complete: r => resolve(r.data),
      error: reject,
    });
  });
}

export async function parseExcel(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
}

export async function parsePDF(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const allRows = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const byY = {};
    for (const item of tc.items) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5] / 3) * 3;
      if (!byY[y]) byY[y] = [];
      byY[y].push({ x: item.transform[4], text: item.str.trim() });
    }
    Object.keys(byY).map(Number).sort((a, b) => b - a).forEach(y => {
      const items = byY[y].sort((a, b) => a.x - b.x);
      allRows.push(items.map(i => i.text));
    });
  }
  return allRows;
}

export async function parseFile(file) {
  const name = file.name.toLowerCase();
  const type = file.type;
  let fileType = 'csv';
  if (name.endsWith('.pdf') || type.includes('pdf')) fileType = 'pdf';
  else if (name.endsWith('.xlsx') || name.endsWith('.xls') || type.includes('sheet') || type.includes('excel')) fileType = 'excel';

  let rows;
  if (fileType === 'csv') rows = await parseCSV(file);
  else if (fileType === 'excel') rows = await parseExcel(file);
  else rows = await parsePDF(file);

  const headerIdx = detectHeaderRow(rows);
  const headers = rows[headerIdx] || [];
  const dataRows = rows.slice(headerIdx + 1);
  return { headers, dataRows, fileType };
}

export function mapRowsToTransactions(dataRows, mapping) {
  const { date: di, description: desi, debit: debi, credit: cri, balance: bali } = mapping;
  const txs = [];

  for (const row of dataRows) {
    if (!row?.length) continue;
    const joined = row.map(c => String(c || '').trim()).join(' ').toLowerCase();

    // Stop at END OF STATEMENT
    if (joined.includes('end of statement')) break;

    // Skip meta / summary rows
    if (isTAJMetaRow(row)) continue;

    // Skip opening balance / brought forward rows — not a transaction
    if (joined.includes('balance brought forward') || joined.includes('brought forward') || joined.includes('opening balance')) continue;

    const d = parseNgDate(di >= 0 ? row[di] : '');
    if (!d) continue;

    const rawDesc = desi >= 0 ? String(row[desi] || '').trim() : '';
    const debit = debi >= 0 ? parseAmount(row[debi]) : 0;
    const credit = cri >= 0 ? parseAmount(row[cri]) : 0;
    if (debit === 0 && credit === 0) continue;

    const desc = cleanDescription(rawDesc);
    const autoCategory = detectCategory(rawDesc, debit || credit);

    txs.push({
      transaction_date: d,
      value_date: d,
      description: desc || rawDesc,
      debit,
      credit,
      balance: bali >= 0 ? parseAmount(row[bali]) : 0,
      auto_category: autoCategory,
    });
  }
  return txs;
}

const EXPENSE_KEYWORDS = {
  'Staff Wages':        ['salary', 'payroll', 'staff', 'wage'],
  'Raw Materials':      ['cement', 'stone dust', 'quarry dust', 'sharp sand', 'aggregate', 'sand'],
  'Diesel & Fuel':      ['diesel', 'fuel', 'petrol'],
  'Machine Maintenance':['maintenance', 'repair', 'servic'],
  'Delivery Costs':     ['delivery', 'transport', 'logistics', 'waybill'],
  'Bank Charges':       ['stamp', 'stampduty', 'sms alert', 'commission', 'charge'],
};

export function autoMatchTransactions(transactions, payments, expenses, accountType, { invoices = [], customers = [] } = {}) {
  const daysDiff = (a, b) => Math.abs(new Date(a) - new Date(b)) / 86400000;

  return transactions.map(tx => {
    const desc = String(tx.description || '').toLowerCase();

    // Inter-account transfer — highest priority
    if (tx.auto_category === 'Inter-Account Transfer') {
      return { ...tx, autoMatch: { type: 'transfer', id: null, label: 'Inter-Account Transfer', confidence: 'high' } };
    }

    // Bank charge / stamp duty
    if (tx.auto_category === 'Bank Charges') {
      return { ...tx, autoMatch: { type: 'bank_charge', id: null, label: 'Bank Charge / Stamp Duty', confidence: 'high' } };
    }

    let best = null;

    // Income account: match credits to invoices / payment records
    if ((accountType === 'income' || accountType === 'both') && tx.credit > 0) {
      // Step 1: match against confirmed payment records (amount + date)
      for (const p of payments) {
        const pAmt = Number(p.amount_paid);
        const exactAmt = Math.abs(pAmt - tx.credit) < 0.01;
        const nearAmt = Math.abs(pAmt - tx.credit) <= 100;
        const days = daysDiff(p.payment_date, tx.transaction_date);
        const customerName = p.invoice?.order?.customer?.name || '';
        const invoiceNumber = p.invoice?.invoice_number || '';

        if (exactAmt && days <= 1) {
          best = { type: 'payment', id: p.id, label: `${customerName} · ${invoiceNumber}`, confidence: 'high', customerName, invoiceNumber };
          break;
        }
        if (exactAmt && days <= 5 && best?.confidence !== 'high') {
          best = { type: 'payment', id: p.id, label: `${customerName} · ${invoiceNumber}`, confidence: 'medium', customerName, invoiceNumber };
        }
        if (nearAmt && days <= 5 && !best) {
          best = { type: 'payment', id: p.id, label: `${customerName} · ${invoiceNumber} (±₦100)`, confidence: 'low', customerName, invoiceNumber };
        }
      }

      // Step 2: match against invoice totals (for un-recorded payments)
      if (!best && invoices.length) {
        for (const inv of invoices) {
          const totalPaid = (inv.payments || []).filter(p => p.status === 'confirmed').reduce((s, p) => s + Number(p.amount_paid), 0);
          const remaining = Number(inv.total_amount) - totalPaid;
          const customerName = inv.order?.customer?.name || '';
          const days = daysDiff(inv.issued_date, tx.transaction_date);
          // Exact match to outstanding balance
          if (Math.abs(remaining - tx.credit) < 0.01 && days <= 30) {
            best = { type: 'invoice', id: inv.id, label: `${customerName} · ${inv.invoice_number}`, confidence: remaining === Number(inv.total_amount) ? 'high' : 'medium', customerName, invoiceNumber: inv.invoice_number, invoiceId: inv.id, totalAmount: inv.total_amount, totalPaid, isFullPayment: totalPaid === 0 };
            break;
          }
          // Full invoice amount match (already partially paid)
          if (Math.abs(Number(inv.total_amount) - tx.credit) < 0.01 && days <= 30 && !best) {
            best = { type: 'invoice', id: inv.id, label: `${customerName} · ${inv.invoice_number} (full)`, confidence: 'medium', customerName, invoiceNumber: inv.invoice_number, invoiceId: inv.id, totalAmount: inv.total_amount, totalPaid, isFullPayment: true };
          }
        }
      }

      // Step 3: customer name extraction from description
      if (!best) {
        const extracted = extractCustomerFromDesc(tx.description);
        const customer = matchCustomerByName(extracted, customers);
        if (customer) {
          const custInvoices = invoices.filter(inv => inv.order?.customer?.id === customer.id);
          const openInvs = custInvoices.filter(inv => {
            const totalPaid = (inv.payments || []).filter(p => p.status === 'confirmed').reduce((s, p) => s + Number(p.amount_paid), 0);
            return totalPaid < Number(inv.total_amount);
          });
          return { ...tx, autoMatch: null, suggestedCustomer: { id: customer.id, name: customer.name, openInvoices: openInvs } };
        }
      }

      if (!best) return { ...tx, autoMatch: null };
    }

    // Expense account: match debits to recorded expenses
    if ((accountType === 'expense' || accountType === 'both') && tx.debit > 0 && !best) {
      // Detect keyword category hint from description
      let categoryHint = tx.auto_category || null;
      if (!categoryHint) {
        for (const [cat, kws] of Object.entries(EXPENSE_KEYWORDS)) {
          if (kws.some(kw => desc.includes(kw))) { categoryHint = cat; break; }
        }
      }

      for (const e of expenses) {
        const eAmt = Number(e.amount);
        const exactAmt = Math.abs(eAmt - tx.debit) < 0.01;
        const days = daysDiff(e.expense_date, tx.transaction_date);
        const catName = e.category?.name || '';
        const categoryMatch = categoryHint && catName.toLowerCase().includes(categoryHint.toLowerCase().split(' ')[0]);

        if (exactAmt && days <= 1) {
          best = { type: 'expense', id: e.id, label: `Expense · ${e.description}`, confidence: 'high' };
          break;
        }
        if (exactAmt && days <= 5 && best?.confidence !== 'high') {
          best = { type: 'expense', id: e.id, label: `Expense · ${e.description}`, confidence: 'medium' };
        }
        if (exactAmt && days <= 14 && best?.confidence === 'low') {
          best = { type: 'expense', id: e.id, label: `Expense · ${e.description}`, confidence: 'medium' };
        }
        if (categoryMatch && days <= 5 && !best) {
          best = { type: 'expense', id: e.id, label: `Expense · ${e.description} (keyword)`, confidence: 'low' };
        }
      }

      // If still no match, attach keyword category so UI can suggest it
      if (!best && categoryHint) {
        return { ...tx, autoMatch: null, suggestedCategory: categoryHint };
      }
    }

    return { ...tx, autoMatch: best };
  });
}
