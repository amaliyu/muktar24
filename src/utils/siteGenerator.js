const definitions = [['Litres per hour', 'litres_per_hour', 1, true, 'L/h'], ['Blocks per hour', 'blocks_per_hour', 0, false, 'blocks/h'], ['Blocks per litre', 'blocks_per_litre', 0, false, 'blocks/L']]
export function measures(day = {}) {
  return definitions.map(([label, key, dp, lower, unit]) => {
    const value = day[key], target = day['target_' + key]
    const good = value == null || target == null ? null : lower ? value <= target * 1.05 : value >= target * .95
    return { label, value: value == null ? null : Number(value).toFixed(dp), target: target == null ? null : Number(target).toFixed(dp), good, unit,
      pill: good == null ? null : good ? 'On target' : lower ? 'Above target' : 'Below target' }
  })
}
export function reading(day) {
  const [diesel, output, efficiency] = measures(day)
  if (diesel.good === false) return 'More diesel per hour than the generator should burn — check for leaks, overloading or missing diesel.'
  if (diesel.good === true && output.good === false) return 'Diesel use was normal; output per hour was low.'
  if ([diesel, output, efficiency].every(row => row.good === true)) return 'On target.'
  return ''
}
export const generatorLine = d => d?.recorded ? `On ${d.started_at} · Off ${d.stopped_at} · off for ${d.break_minutes} min · ran ${d.running_hours} h` : 'Generator times not recorded'
export const generatorWhatsApp = d => !d?.recorded ? 'Generator times not recorded' : `Generator ${d.started_at}–${d.stopped_at} (${d.running_hours} h): ` + measures(d).filter(r => r.value != null).map(r => `${r.value} ${r.unit}${r.target == null ? '' : ` (target ${r.target})`}`).join(', ')
