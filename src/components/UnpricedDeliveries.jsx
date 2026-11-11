import React from 'react'

export default function UnpricedDeliveries({ rows = [] }) {
  if (!rows.length) return null
  return <aside aria-label="Delivered but unpriced" style={{ overflowWrap: 'anywhere' }}>
    <p>Delivered but unpriced (excluded from revenue)</p>
    <ul>{rows.map((row, index) => <li key={row.waybill_id || row.id || index}>
      {row.waybill_date} · {row.block_type} · {row.quantity_received} blocks
    </li>)}</ul>
  </aside>
}
