import { supabase } from '../lib/supabase';

export const bankAccountsService = {
  async getAll() {
    const { data, error } = await supabase.from('bank_accounts').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },
  async create(account) {
    const { data, error } = await supabase.from('bank_accounts').insert(account).select().single();
    if (error) throw error;
    return data;
  },
  async update(id, updates) {
    const { error } = await supabase.from('bank_accounts').update(updates).eq('id', id);
    if (error) throw error;
  },
};

export const bankTransactionsService = {
  async getByAccount(accountId, from, to) {
    let q = supabase
      .from('bank_transactions')
      .select('*')
      .eq('bank_account_id', accountId)
      .order('transaction_date', { ascending: false });
    if (from) q = q.gte('transaction_date', from);
    if (to)   q = q.lte('transaction_date', to);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async checkDuplicates(accountId, transactions) {
    const { data, error } = await supabase
      .from('bank_transactions')
      .select('transaction_date, debit, credit')
      .eq('bank_account_id', accountId);
    if (error) throw error;
    const existing = data || [];
    return transactions.map(tx => ({
      ...tx,
      isDuplicate: existing.some(e =>
        e.transaction_date === tx.transaction_date &&
        Math.abs((e.debit || 0) - (tx.debit || 0)) < 0.01 &&
        Math.abs((e.credit || 0) - (tx.credit || 0)) < 0.01
      ),
    }));
  },

  async insertBatch(accountId, transactions, batchId) {
    const rows = transactions.map(tx => ({
      bank_account_id: accountId,
      transaction_date: tx.transaction_date,
      value_date: tx.value_date || tx.transaction_date,
      description: tx.description || '',
      debit: tx.debit || 0,
      credit: tx.credit || 0,
      balance: tx.balance || 0,
      reference: tx.reference || '',
      match_status: tx.matchedTo ? 'matched' : 'unmatched',
      matched_to_type: tx.matchedTo?.type || null,
      matched_to_id: tx.matchedTo?.id || null,
      import_batch_id: batchId,
    }));
    const { error } = await supabase.from('bank_transactions').insert(rows);
    if (error) throw error;
  },

  async updateMatch(id, matchStatus, matchedToType, matchedToId, notes) {
    const { error } = await supabase
      .from('bank_transactions')
      .update({ match_status: matchStatus, matched_to_type: matchedToType, matched_to_id: matchedToId, notes: notes || null })
      .eq('id', id);
    if (error) throw error;
  },

  async suggestMatch(id, matchedToType, matchedToId) {
    const { data, error } = await supabase.rpc('suggest_bank_match', {
      bank_transaction_id: id,
      matched_to_type: matchedToType,
      matched_to_id: matchedToId,
    });
    if (error) throw error;
    return data;
  },

  async confirmMatch(id, action, reason) {
    const { data, error } = await supabase.rpc('confirm_bank_match', {
      bank_transaction_id: id,
      action,
      reason: reason || null,
    });
    if (error) throw error;
    return data;
  },

  async getSuggested(accountId) {
    const { data, error } = await supabase
      .from('bank_transactions')
      .select('*')
      .eq('bank_account_id', accountId)
      .eq('match_status', 'suggested')
      .order('transaction_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },
};

export const bankImportBatchesService = {
  async create(batch) {
    const { data, error } = await supabase.from('bank_import_batches').insert(batch).select().single();
    if (error) throw error;
    return data;
  },
};

export const bankReconciliationsService = {
  async getByAccount(accountId) {
    const { data, error } = await supabase
      .from('bank_reconciliations')
      .select('*')
      .eq('bank_account_id', accountId)
      .order('reconciliation_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async create(recon) {
    const { data, error } = await supabase.from('bank_reconciliations').insert(recon).select().single();
    if (error) throw error;
    return data;
  },
  async complete(id, updates) {
    const { error } = await supabase
      .from('bank_reconciliations')
      .update({ ...updates, status: 'completed', reconciled_date: new Date().toISOString().split('T')[0] })
      .eq('id', id);
    if (error) throw error;
  },
};

// Resolve the storage path from a stored file_url value.
// New rows store the bare storage path; legacy rows stored the full public URL.
function receiptStoragePath(fileUrl) {
  if (!fileUrl) return null;
  return fileUrl.startsWith('http') ? (fileUrl.split('/receipts/')[1] || null) : fileUrl;
}

export const receiptsService = {
  async getAll(from, to, search) {
    let q = supabase
      .from('receipts')
      .select('*')
      .order('uploaded_at', { ascending: false });
    if (from) q = q.gte('receipt_date', from);
    if (to)   q = q.lte('receipt_date', to);
    if (search) q = q.ilike('vendor_name', `%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async getNextNumber() {
    const { data, error } = await supabase
      .from('receipts')
      .select('receipt_number')
      .order('uploaded_at', { ascending: false })
      .limit(1);
    if (error || !data?.length) return 'APC-RCT-001';
    const match = data[0].receipt_number?.match(/(\d+)$/);
    const next = match ? parseInt(match[1], 10) + 1 : 1;
    return `APC-RCT-${String(next).padStart(3, '0')}`;
  },

  async upload(file, metadata) {
    const ext = file.name.split('.').pop().toLowerCase();
    const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from('receipts').upload(path, file);
    if (uploadErr) throw uploadErr;
    const basePayload = {
      expense_id: metadata.expense_id || null,
      receipt_date: metadata.receipt_date,
      vendor_name: metadata.vendor_name || '',
      amount: Number(metadata.amount) || 0,
      receipt_type: ext === 'pdf' ? 'pdf' : 'photo',
      file_url: path,
      file_name: file.name,
      uploaded_by: metadata.uploaded_by || 'Admin',
      uploaded_at: new Date().toISOString(),
      tax_category: metadata.tax_category || '',
      notes: metadata.notes || '',
    };
    let receiptNumber = await receiptsService.getNextNumber();
    let { data, error } = await supabase.from('receipts')
      .insert({ ...basePayload, receipt_number: receiptNumber }).select('*').single();
    if (error?.code === '23505') {
      receiptNumber = await receiptsService.getNextNumber();
      ({ data, error } = await supabase.from('receipts')
        .insert({ ...basePayload, receipt_number: receiptNumber }).select('*').single());
    }
    if (error) throw error;
    return data;
  },

  // Returns a 1-hour signed URL for a receipt's stored file_url (path or legacy
  // public URL). Callers use this instead of rendering file_url directly, so
  // the bucket can be flipped to private without breaking receipt viewing.
  async getSignedUrl(fileUrl) {
    const path = receiptStoragePath(fileUrl);
    if (!path) return null;
    const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 3600);
    if (error) throw error;
    return data?.signedUrl || null;
  },

  async delete(id, fileUrl) {
    const path = receiptStoragePath(fileUrl);
    if (path) await supabase.storage.from('receipts').remove([path]);
    const { error } = await supabase.from('receipts').delete().eq('id', id);
    if (error) throw error;
  },

  async getMissingReceiptExpenses() {
    const [{ data: linked }, { data: allExp }] = await Promise.all([
      supabase.from('receipts').select('expense_id').not('expense_id', 'is', null),
      supabase.from('expenses').select('id').eq('status', 'approved'),
    ]);
    const linkedSet = new Set((linked || []).map(r => r.expense_id).filter(Boolean));
    return (allExp || []).filter(e => !linkedSet.has(e.id)).length;
  },
};
