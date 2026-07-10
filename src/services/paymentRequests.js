import { supabase } from '../lib/supabase';

export const paymentRequestsService = {
  async list() {
    const { data, error } = await supabase
      .from('payment_requests')
      .select('*, supplier:supplier_id(company_name, bank_name, bank_account_number, bank_account_name)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const rows = data || [];
    const ids = [...new Set(rows.map(r => r.requested_by).filter(Boolean))];
    if (ids.length) {
      const { data: profiles, error: profilesErr } = await supabase
        .from('user_profiles_directory')
        .select('id, full_name')
        .in('id', ids);
      if (profilesErr) console.error('paymentRequests.list: requester lookup failed', profilesErr);
      const map = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name]));
      for (const row of rows) row.requester = { full_name: map[row.requested_by] || null };
    }
    return rows;
  },

  async listMine(userId) {
    const { data, error } = await supabase
      .from('payment_requests')
      .select('*, supplier:supplier_id(company_name, bank_name, bank_account_number, bank_account_name)')
      .eq('requested_by', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create({ amount, purpose, expense_category_id, disbursement_method, supplier_id, payee_name, payee_bank_name, payee_account_number, payee_account_name, category_other_note, order_item_id }) {
    const { data: ref, error: refErr } = await supabase.rpc('get_next_payment_request_reference');
    if (refErr) throw refErr;
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('payment_requests')
      .insert({
        reference: ref,
        requested_by: user.id,
        amount,
        purpose: purpose || null,
        expense_category_id: expense_category_id || null,
        disbursement_method: disbursement_method || 'bank_transfer',
        supplier_id: supplier_id || null,
        payee_name: payee_name || null,
        payee_bank_name: payee_bank_name || null,
        payee_account_number: payee_account_number || null,
        payee_account_name: payee_account_name || null,
        category_other_note: category_other_note || null,
        order_item_id: order_item_id || null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, fields) {
    const { error } = await supabase
      .from('payment_requests')
      .update(fields)
      .eq('id', id);
    if (error) throw error;
  },

  async advance(id, action, reason = null, bankAccountId = null) {
    const { data, error } = await supabase.rpc('advance_payment_request', {
      p_request_id: id,
      p_action: action,
      p_reason: reason,
      p_bank_account_id: bankAccountId,
    });
    if (error) throw error;
    return data;
  },

  async getActiveSuppliers() {
    const { data, error } = await supabase
      .from('suppliers')
      .select('id, company_name, bank_name, bank_account_number, bank_account_name')
      .eq('status', 'active')
      .order('company_name');
    if (error) throw error;
    return data || [];
  },

  async getPendingVendors() {
    const { data, error } = await supabase
      .from('suppliers')
      .select('id, company_name, bank_name, bank_account_number, bank_account_name, created_at')
      .eq('status', 'pending_verification')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async approveVendor(id) {
    const { error } = await supabase.rpc('approve_vendor', { p_supplier_id: id });
    if (error) throw error;
  },

  async uploadAttachment(paymentRequestId, file, uploadedBy, note) {
    const ext = file.name.split('.').pop();
    const path = `${paymentRequestId}/${Date.now()}.${ext}`;
    const { data: storageData, error: upErr } = await supabase.storage
      .from('payment-request-attachments')
      .upload(path, file);
    if (upErr) throw upErr;
    const { error } = await supabase
      .from('payment_request_attachments')
      .insert({
        payment_request_id: paymentRequestId,
        file_path: storageData.path,
        uploaded_by: uploadedBy,
        note: note || null,
      });
    if (error) throw error;
  },

  async listDisbursed() {
    const { data, error } = await supabase
      .from('payment_requests')
      .select('id, reference, amount, purpose, payee_name, payee_bank_name, payee_account_number, status, supplier:supplier_id(company_name)')
      .in('status', ['disbursed', 'closed'])
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async createSupplierFromPaymentRequest({ company_name, bank_name, bank_account_number, bank_account_name, contact_person, phone }) {
    const { data, error } = await supabase.rpc('create_supplier_from_payment_request', {
      p_company_name: company_name,
      p_bank_name: bank_name || null,
      p_bank_account_number: bank_account_number || null,
      p_bank_account_name: bank_account_name || null,
      p_contact_person: contact_person || null,
      p_phone: phone || null,
    });
    if (error) throw error;
    return data;
  },
};
