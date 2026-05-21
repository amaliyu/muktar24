import { supabase } from '../lib/supabase'

const today = () => new Date().toISOString().split('T')[0]
const plusDays = (d) => { const dt = new Date(); dt.setDate(dt.getDate() + d); return dt.toISOString().split('T')[0] }

export const vehiclesService = {
  async getAll() {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*, driver:assigned_driver_id(id, full_name)')
      .order('vehicle_number')
    if (error) throw error
    return data || []
  },

  async getActive() {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*, driver:assigned_driver_id(id, full_name)')
      .eq('status', 'active')
      .order('vehicle_number')
    if (error) throw error
    return data || []
  },

  async getById(id) {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*, driver:assigned_driver_id(id, full_name)')
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  async create(vehicle) {
    const { data, error } = await supabase
      .from('vehicles').insert(vehicle).select().single()
    if (error) throw error
    return data
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('vehicles').update(updates).eq('id', id).select().single()
    if (error) throw error
    return data
  },

  async getExpiringOrExpired(days = 30) {
    const cutoff = plusDays(days)
    const { data } = await supabase
      .from('vehicles')
      .select('id, vehicle_number, vehicle_name, insurance_expiry_date, road_worthiness_expiry_date, status')
      .eq('status', 'active')
    return (data || []).filter(v =>
      (v.insurance_expiry_date && v.insurance_expiry_date <= cutoff) ||
      (v.road_worthiness_expiry_date && v.road_worthiness_expiry_date <= cutoff)
    )
  },
}

export const maintenanceService = {
  async getByVehicle(vehicleId) {
    const { data, error } = await supabase
      .from('vehicle_maintenance')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('maintenance_date', { ascending: false })
    if (error) throw error
    return data || []
  },

  async create(record) {
    const { data, error } = await supabase
      .from('vehicle_maintenance').insert(record).select().single()
    if (error) throw error
    return data
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('vehicle_maintenance').update(updates).eq('id', id).select().single()
    if (error) throw error
    return data
  },

  async delete(id) {
    const { error } = await supabase.from('vehicle_maintenance').delete().eq('id', id)
    if (error) throw error
  },

  async uploadReceipt(file) {
    const ext = file.name.split('.').pop()
    const path = `receipts/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { data, error } = await supabase.storage.from('vehicle-documents').upload(path, file)
    if (error) throw error
    const { data: { publicUrl } } = supabase.storage.from('vehicle-documents').getPublicUrl(data.path)
    return publicUrl
  },
}

export const fuelLogService = {
  async getByVehicle(vehicleId) {
    const { data, error } = await supabase
      .from('vehicle_fuel_log')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('date', { ascending: false })
    if (error) throw error
    return data || []
  },

  async create(entry) {
    const { data, error } = await supabase
      .from('vehicle_fuel_log').insert(entry).select().single()
    if (error) throw error
    return data
  },

  async delete(id) {
    const { error } = await supabase.from('vehicle_fuel_log').delete().eq('id', id)
    if (error) throw error
  },
}

export const vehicleDocumentsService = {
  async getByVehicle(vehicleId) {
    const { data, error } = await supabase
      .from('vehicle_documents')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('uploaded_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async upload(vehicleId, file, label, expiryDate, uploadedBy) {
    const ext = file.name.split('.').pop()
    const path = `${vehicleId}/${Date.now()}.${ext}`
    const { data: sd, error: se } = await supabase.storage.from('vehicle-documents').upload(path, file)
    if (se) throw se
    const { data: { publicUrl } } = supabase.storage.from('vehicle-documents').getPublicUrl(sd.path)
    const { data, error } = await supabase.from('vehicle_documents').insert({
      vehicle_id: vehicleId, document_label: label, file_url: publicUrl,
      file_name: file.name, file_size: file.size,
      expiry_date: expiryDate || null, uploaded_by: uploadedBy || '',
    }).select().single()
    if (error) throw error
    return data
  },

  async delete(id, fileUrl) {
    const match = fileUrl?.match(/vehicle-documents\/(.+)$/)
    if (match) await supabase.storage.from('vehicle-documents').remove([match[1]])
    const { error } = await supabase.from('vehicle_documents').delete().eq('id', id)
    if (error) throw error
  },
}
