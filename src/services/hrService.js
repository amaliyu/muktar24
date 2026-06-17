import { supabase } from '../lib/supabase'

export const rolesService = {
  async getAll() {
    const { data, error } = await supabase
      .from('staff_roles')
      .select(`
        *,
        staff_count:staff(count)
      `)
      .order('department')
      .order('role_name')
    if (error) throw error
    return data || []
  },

  async getActive() {
    const { data, error } = await supabase
      .from('staff_roles')
      .select('*')
      .eq('is_active', true)
      .order('department')
      .order('role_name')
    if (error) throw error
    return data || []
  },

  async create(role) {
    const { data, error } = await supabase
      .from('staff_roles')
      .insert(role)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('staff_roles')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },
}

export const documentsService = {
  async getByStaff(staffId) {
    const { data, error } = await supabase
      .from('staff_documents')
      .select('*')
      .eq('staff_id', staffId)
      .order('uploaded_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async upload(staffId, file, label, uploadedBy = '') {
    const ext = file.name.split('.').pop()
    const path = `${staffId}/${Date.now()}.${ext}`
    const { data: storageData, error: storageErr } = await supabase.storage
      .from('staff-documents')
      .upload(path, file, { upsert: false })
    if (storageErr) throw storageErr

    const { data: { publicUrl } } = supabase.storage
      .from('staff-documents')
      .getPublicUrl(storageData.path)

    const { data, error } = await supabase
      .from('staff_documents')
      .insert({
        staff_id: staffId,
        document_label: label,
        file_url: publicUrl,
        file_name: file.name,
        file_size: file.size,
        uploaded_by: uploadedBy,
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async delete(id, fileUrl) {
    // Extract storage path from public URL
    const match = fileUrl?.match(/staff-documents\/(.+)$/)
    if (match) {
      await supabase.storage.from('staff-documents').remove([match[1]])
    }
    const { error } = await supabase.from('staff_documents').delete().eq('id', id)
    if (error) throw error
  },
}

export const photoService = {
  async upload(staffId, file) {
    const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
    const path = `${staffId}/photo_${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage
      .from('staff-photos')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    const { error: upErr } = await supabase
      .from('staff')
      .update({ photo_path: data.path })
      .eq('id', staffId);
    if (upErr) throw upErr;
    return data.path;
  },

  async getSignedUrl(path, expiresIn = 3600) {
    const { data, error } = await supabase.storage
      .from('staff-photos')
      .createSignedUrl(path, expiresIn);
    if (error) throw error;
    return data.signedUrl;
  },

  async markChecklistPhotoComplete(staffId, completedBy) {
    const { data: existing } = await supabase
      .from('staff_onboarding_checklist')
      .select('id')
      .eq('staff_id', staffId)
      .eq('item_key', 'photo')
      .maybeSingle();
    const payload = {
      staff_id: staffId, item_key: 'photo', is_complete: true,
      completed_at: new Date().toISOString(), completed_by: completedBy,
    };
    if (existing) {
      await supabase.from('staff_onboarding_checklist').update(payload).eq('id', existing.id);
    } else {
      await supabase.from('staff_onboarding_checklist').insert(payload);
    }
  },
}

export const hrStaffService = {
  async getNextEmployeeNumber() {
    const { data } = await supabase
      .from('staff')
      .select('employee_number')
      .order('created_at', { ascending: false })
      .limit(50)
    if (!data?.length) return 'APC-EMP-001'
    const nums = data
      .map(s => s.employee_number?.match(/(\d+)$/)?.[1])
      .filter(Boolean)
      .map(Number)
    const max = nums.length > 0 ? Math.max(...nums) : 0
    return `APC-EMP-${String(max + 1).padStart(3, '0')}`
  },

  async getById(id) {
    const { data, error } = await supabase
      .from('staff')
      .select('*, staffRole:role_id(id, role_name, department)')
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },
}
