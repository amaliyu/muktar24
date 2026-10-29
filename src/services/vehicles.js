import { checkedWrite } from '../utils/checkedWrite'
import { supabase } from '../lib/supabase'
import { getSignedDocUrl, docStoragePath } from './storage'
import { deleteById, deleteWhere } from '../utils/checkedDelete'

const today = () => new Date().toISOString().split('T')[0]
const plusDays = (d) => { const dt = new Date(); dt.setDate(dt.getDate() + d); return dt.toISOString().split('T')[0] }

export const vehiclesService = {
  async getAll() {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .order('vehicle_number')
    if (error) throw error
    return data || []
  },

  async getActive() {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('status', 'active')
      .order('vehicle_number')
    if (error) throw error
    return data || []
  },

  async getById(id) {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
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
    await deleteById(supabase, 'vehicle_maintenance', id)
  },

  async uploadReceipt(file) {
    const ext = file.name.split('.').pop()
    const path = `receipts/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { data, error } = await supabase.storage.from('vehicle-documents').upload(path, file)
    if (error) throw error
    return data.path
  },

  getSignedUrl(value) {
    return getSignedDocUrl('vehicle-documents', value)
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
    await deleteById(supabase, 'vehicle_fuel_log', id)
  },

  async getByWaybill(waybillId) {
    const { data, error } = await supabase.from('vehicle_fuel_log').select('id').eq('waybill_id', waybillId)
    if (error) throw error
    return data || []
  },

  async deleteByWaybill(waybillId) {
    return deleteWhere(supabase, 'vehicle_fuel_log', 'waybill_id', waybillId)
  },

  async upsertForWaybill(vehicleId, waybillId, date, litres, dispensedBy) {
    await deleteWhere(supabase, 'vehicle_fuel_log', 'waybill_id', waybillId)
    if (!litres || litres <= 0) return
    checkedWrite(await supabase.from('vehicle_fuel_log').insert({
      vehicle_id: vehicleId, waybill_id: waybillId,
      date, litres_dispensed: litres,
      purpose: 'delivery', dispensed_by: dispensedBy || null,
    }).select('id'))
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
    const { data, error } = await supabase.from('vehicle_documents').insert({
      vehicle_id: vehicleId, document_label: label, file_url: sd.path,
      file_name: file.name, file_size: file.size,
      expiry_date: expiryDate || null, uploaded_by: uploadedBy || '',
    }).select().single()
    if (error) throw error
    return data
  },

  getSignedUrl(value) {
    return getSignedDocUrl('vehicle-documents', value)
  },

  // Row first, then the file: a blocked row delete leaves the file in place
  // instead of a record pointing at a missing file.
  async delete(id, fileUrl) {
    await deleteById(supabase, 'vehicle_documents', id)
    const path = docStoragePath('vehicle-documents', fileUrl)
    if (path) {
      const { error } = await supabase.storage.from('vehicle-documents').remove([path])
      if (error) throw new Error(`The document record was deleted, but its file could not be removed from storage: ${error.message}`)
    }
  },
}
