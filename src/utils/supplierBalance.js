export function supplierTotals(transactions = []) {
  const sum = type => transactions.filter(t => t.transaction_type === type)
    .reduce((n, t) => n + Number(t.amount || 0), 0)
  const purchased = sum('purchase'), paid = sum('payment'), returned = sum('return')
  return { purchased, paid, returned, balance: purchased - paid - returned }
}
