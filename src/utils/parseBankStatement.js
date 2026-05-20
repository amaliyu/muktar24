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
  // DD-Mon-YYYY e.g. 15-Jan-2024
  const months = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  const m2 = s.match(/^(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{4})$/);
  if (m2) {
    const mo = months[m2[2].toLowerCase()];
    if (mo) return `${m2[3]}-${String(mo).padStart(2,'0')}-${m2[1].padStart(2,'0')}`;
  }
  return null;
}

function parseAmount(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  return parseFloat(String(v).replace(/[,₦\s₦]/g, '')) || 0;
}

export function autoMapColumns(headers) {
  const h = headers.map(c => String(c || '').toLowerCase().trim());
  const find = (kws) => { for (const kw of kws) { const i = h.findIndex(c => c.includes(kw)); if (i >= 0) return i; } return -1; };
  return {
    date: find(['trans date','tran date','value date','date']),
    description: find(['narration','description','details','particulars','remarks','trans details']),
    debit: find(['debit','withdrawal','dr ','debit amount','dr amount']),
    credit: find(['credit','deposit','cr ','credit amount','cr amount']),
    balance: find(['running balance','balance','bal']),
  };
}

function detectHeaderRow(rows) {
  const kws = ['date','debit','credit','balance','narration','description','amount'];
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
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
    const d = parseNgDate(di >= 0 ? row[di] : '');
    if (!d) continue;
    const debit = debi >= 0 ? parseAmount(row[debi]) : 0;
    const credit = cri >= 0 ? parseAmount(row[cri]) : 0;
    if (debit === 0 && credit === 0) continue;
    txs.push({
      transaction_date: d,
      value_date: d,
      description: desi >= 0 ? String(row[desi] || '').trim() : '',
      debit,
      credit,
      balance: bali >= 0 ? parseAmount(row[bali]) : 0,
    });
  }
  return txs;
}

export function autoMatchTransactions(transactions, payments, expenses, accountType) {
  const daysDiff = (a, b) => Math.abs(new Date(a) - new Date(b)) / 86400000;
  return transactions.map(tx => {
    let best = null;
    if ((accountType === 'income' || accountType === 'both') && tx.credit > 0) {
      for (const p of payments) {
        const amtMatch = Math.abs(Number(p.amount_paid) - tx.credit) < 0.01;
        const dateClose = daysDiff(p.payment_date, tx.transaction_date) <= 2;
        if (amtMatch && dateClose) { best = { type: 'payment', id: p.id, label: `Payment · ${p.invoice?.order?.customer?.name || ''}`, confidence: 'high' }; break; }
        if (amtMatch && !best) best = { type: 'payment', id: p.id, label: `Payment · ${p.invoice?.order?.customer?.name || ''}`, confidence: 'medium' };
      }
    }
    if ((accountType === 'expense' || accountType === 'both') && tx.debit > 0 && !best) {
      for (const e of expenses) {
        const amtMatch = Math.abs(Number(e.amount) - tx.debit) < 0.01;
        const dateClose = daysDiff(e.expense_date, tx.transaction_date) <= 2;
        if (amtMatch && dateClose) { best = { type: 'expense', id: e.id, label: `Expense · ${e.description}`, confidence: 'high' }; break; }
        if (amtMatch && !best) best = { type: 'expense', id: e.id, label: `Expense · ${e.description}`, confidence: 'medium' };
      }
    }
    return { ...tx, autoMatch: best };
  });
}
