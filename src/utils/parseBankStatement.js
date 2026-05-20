import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

function parseNgDate(str) {
  if (!str && str !== 0) return null;
  const s = String(str).trim();
  // Excel serial (integer or with decimal time component e.g. 46130.4466...)
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    return new Date((Math.floor(Number(s)) - 25569) * 86400000).toISOString().split('T')[0];
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
  // DD-Mon-YY e.g. 06-JAN-26 (TAJ Bank format — 2-digit year, assume 2000s)
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

export function autoMatchTransactions(transactions, payments, expenses, accountType) {
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

    // Income account: match credits to customer payments
    if ((accountType === 'income' || accountType === 'both') && tx.credit > 0) {
      for (const p of payments) {
        const pAmt = Number(p.amount_paid);
        const exactAmt = Math.abs(pAmt - tx.credit) < 0.01;
        const nearAmt = Math.abs(pAmt - tx.credit) <= 100;
        const days = daysDiff(p.payment_date, tx.transaction_date);
        const customerName = p.invoice?.order?.customer?.name || '';

        if (exactAmt && days <= 1) {
          best = { type: 'payment', id: p.id, label: `Payment · ${customerName}`, confidence: 'high' };
          break;
        }
        if (exactAmt && days <= 5 && best?.confidence !== 'high') {
          best = { type: 'payment', id: p.id, label: `Payment · ${customerName}`, confidence: 'medium' };
        }
        if (nearAmt && days <= 5 && !best) {
          best = { type: 'payment', id: p.id, label: `Payment · ${customerName} (±₦100)`, confidence: 'low' };
        }
      }
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
