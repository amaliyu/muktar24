// XLSX numeric cells must remain numbers, never display-formatted strings.
export function buildProductionExcelRows(rows) {
  return rows.map(r => [
    r.date, r.block_type, r.quantity_produced,
    r.cement_bags || 0, Number(r.granite_dust_kg || 0),
    r.diesel_litres || 0, r.recorder?.full_name || '—',
  ])
}
