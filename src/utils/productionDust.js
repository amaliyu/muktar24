// Production quantities are gross (including blocks broken during production).
export const dustStandard = (standards, siteId, blockType) =>
  standards.find(s => s.site_id === siteId && s.block_type === blockType) || null

export const calculatedDustKg = (produced, standard) =>
  Number(produced || 0) * Number(standard || 0)

export const formatDust = (kg) => {
  const amount = Number(kg || 0)
  const formatted = amount.toLocaleString('en-NG', { maximumFractionDigits: 3 })
  return amount >= 1000
    ? `${formatted} kg (${(amount / 1000).toLocaleString('en-NG', { maximumFractionDigits: 3 })} t)`
    : `${formatted} kg`
}

export const missingProductionItems = (items, entry) => [
  ['cement', entry.cement_bags],
  ['dust', entry.granite_dust_kg],
  ['chippings', entry.chippings_kg],
  ['diesel', entry.diesel_litres],
].filter(([material, qty]) => Number(qty) > 0
  && !items.find(i => i.site_id === entry.site_id && i.material === material))
  .map(([material]) => material)
