import { supabase } from '../lib/supabase'
import { shiftDate } from '../utils/lagosDate'

export const FACE_MODEL = 'human-faceres'
const bucket = () => supabase.storage.from('site-attendance')
const checked = ({ data, error }) => { if (error) throw error; return data }
const rpc = async (name, args) => checked(await supabase.rpc(name, args))
const geo = fix => ({ p_lat: fix.lat, p_lng: fix.lng, p_accuracy_m: fix.accuracy })

export const siteAttendance = {
  register: (site, date) => rpc('site_crew_register', { p_site_id: site, p_date: date }),
  propose: (site, fix) => rpc('propose_site_location', { p_site_id: site, ...geo(fix) }),
  review: (site, approve, radius) => rpc('approve_site_location', { p_site_id: site, p_approve: approve, p_radius_m: approve ? radius : null }),
  clock: (type, fix, device) => rpc('site_manager_clock', { p_punch_type: type, ...geo(fix), p_device_id: device }),
  async location(site) {
    return checked(await supabase.from('production_sites')
      .select('geo_lat, geo_lng, geo_radius_m, geo_status, geo_set_by_name, geo_approved_by_name')
      .eq('id', site).single())
  },
  async workers() {
    return checked(await supabase.from('labour_pool').select('id, full_name').eq('is_active', true).order('full_name'))
  },
  async registered(site) {
    return checked(await supabase.from('labour_face_profiles').select('labour_id').eq('site_id', site).eq('active', true))
  },
  async settings() {
    return checked(await supabase.from('face_match_settings').select('min_similarity, min_liveness, duplicate_similarity').eq('model', FACE_MODEL).single())
  },
  async enrol(site, worker, descriptor, photo, consent) {
    if (!consent) throw new Error('The worker must agree before their face is registered.')
    const path = site + '/enrol/' + worker + '.jpg'
    checked(await bucket().upload(path, photo, { upsert: true, contentType: 'image/jpeg' }))
    return rpc('enroll_worker_face', { p_labour_id: worker, p_site_id: site, p_descriptor: descriptor, p_model: FACE_MODEL, p_photo_path: path, p_consent: consent })
  },
  checkIn: (site, frame, fix, device) => rpc('crew_check_in', {
    p_site_id: site, p_descriptor: frame.embedding, p_model: FACE_MODEL, p_liveness: frame.liveness, ...geo(fix), p_device_id: device,
  }),
  async manual(site, date, worker, reason, photo, fix, device) {
    if (reason.trim().length < 10 || !photo) throw new Error('Enter a reason of at least 10 characters and take a photo.')
    const path = site + '/manual/' + date + '/' + worker + '.jpg'
    checked(await bucket().upload(path, photo, { upsert: true, contentType: 'image/jpeg' }))
    return rpc('crew_check_in_manual', { p_site_id: site, p_labour_id: worker, p_reason: reason.trim(), p_photo_path: path, ...geo(fix), p_device_id: device })
  },
  async photo(path) {
    return checked(await bucket().createSignedUrl(path, 300)).signedUrl
  },
  async punches(staff, date) {
    return checked(await supabase.from('attendance_punches').select('id, punch_type, punch_time, distance_m').eq('staff_id', staff)
      .gte('punch_time', date + 'T00:00:00+01:00').lt('punch_time', shiftDate(date, 1) + 'T00:00:00+01:00').order('punch_time'))
  },
}
