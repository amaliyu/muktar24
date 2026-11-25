import { useEffect, useState } from 'react'
import { siteContractsService } from '../../services/siteContracts'
import { ui, ErrorBox } from './siteUi'
export const emptyTransport = () => ({ vehicle_id: '', vehicle_plate: '', driver_staff_id: '', driver_name: '', loader_ids: [] })
export function transportProblem(value, options, note = '') {
  if (!value.vehicle_id && !value.vehicle_plate.trim()) return 'Choose a truck or type its plate.'
  if (!value.driver_staff_id && !value.driver_name.trim()) return 'Choose a driver or type their name.'
  if (options?.loaders?.length && !value.loader_ids.length) return 'Choose at least one loader.'
  return null
}
export function useTransportOptions(site, date) {
  const [state, setState] = useState({})
  useEffect(() => {
    let active = true; setState({})
    if (site && date) siteContractsService.transportOptions(site, date).then(data => { if (active) setState({ data }) }).catch(error => { if (active) setState({ error }) })
    return () => { active = false }
  }, [site, date])
  return state
}
export function TransportFields({ value: v, onChange, options, error }) {
  const set = (key, val) => onChange({ ...v, [key]: val })
  return <fieldset style={{ border: 0, padding: 0, minWidth: 0 }}><legend>Truck, driver and loaders</legend><ErrorBox error={error} />
    {!options ? <p>Loading transport options…</p> : <>
      <label>Truck<select style={ui.input} required value={v.vehicle_id || (v.otherTruck ? 'other' : '')} onChange={e => {
        const vehicle = options.vehicles?.find(x => x.id === e.target.value)
        onChange({ ...v, vehicle_id: vehicle?.id || '', vehicle_plate: '', otherTruck: e.target.value === 'other', ...(vehicle?.driver_id ? { driver_staff_id: vehicle.driver_id, driver_name: '', otherDriver: false } : {}) })
      }}><option value="">Choose a truck</option>{options.vehicles?.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}<option value="other">Other truck (type plate)</option></select></label>
      {v.otherTruck && <label>Truck plate<input style={ui.input} required value={v.vehicle_plate} onChange={e => set('vehicle_plate', e.target.value)} /></label>}
      <label>Driver<select style={ui.input} required value={v.driver_staff_id || (v.otherDriver ? 'other' : '')} onChange={e => onChange({ ...v, driver_staff_id: e.target.value === 'other' ? '' : e.target.value, driver_name: '', otherDriver: e.target.value === 'other' })}><option value="">Choose a driver</option>{options.drivers?.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}<option value="other">Other driver (type name)</option></select></label>
      {v.otherDriver && <label>Driver name<input style={ui.input} required value={v.driver_name} onChange={e => set('driver_name', e.target.value)} /></label>}
      <p>Loaders</p><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{options.loaders?.map(x => <button type="button" key={x.id} style={ui.btn()} aria-pressed={v.loader_ids.includes(x.id)} onClick={() => set('loader_ids', v.loader_ids.includes(x.id) ? v.loader_ids.filter(id => id !== x.id) : [...v.loader_ids, x.id])}>{x.name}</button>)}</div>
      {!options.loaders?.length && <p>No crew recorded for this day — record the register or roster first, or add a note</p>}
    </>}
  </fieldset>
}
export function TransportLabel({ row, vehicles }) {
  const [open, setOpen] = useState(false)
  const options = useTransportOptions(open || row.vehicle_id ? row.site_id : null, row.handover_date)
  return <><button data-ico-allow data-board-allow style={ui.btn()} type="button" onClick={() => setOpen(!open)}>{row.vehicle_plate || (options.data?.vehicles || vehicles)?.find(v => v.id === row.vehicle_id)?.label || 'Fleet truck'} · {row.driver_name || 'Driver'} · {row.loader_ids?.length || 0} loaders</button>
    {open && <><ErrorBox error={options.error} /><p>{row.loader_ids?.map(id => options.data?.loaders?.find(x => x.id === id)?.name || id).join(', ')}</p></>}
  </>
}
