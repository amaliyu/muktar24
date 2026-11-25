import { generatorWhatsApp } from './siteGenerator'
import { lineBadge, lineText } from './productionExceptions'

const number = (value, digits = 2) => Number(value).toLocaleString('en-NG', { maximumFractionDigits: digits })
const available = value => value != null
const money = value => `₦${number(value)}`

export function shiftScorecardDate(date, days) {
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() + days)
  return day.toISOString().slice(0, 10)
}

export const scorecardDate = date => date.split('-').reverse().join('/')

function warningMetric(lines, parameter, budget) {
  if (!lines || !available(budget)) return { chip: null }
  const line = lines.find(row => row.parameter === parameter && row.status !== 'resolved')
  return line ? { chip: lineBadge(line), hint: lineText(line) }
    : { chip: { label: 'Within limits', tone: 'green' } }
}

function againstBudget(actual, budget) {
  if (!available(actual) || !available(budget)) return null
  return actual <= budget ? { label: 'Within budget', tone: 'green' } : { label: 'Over budget', tone: 'red' }
}

const budgetText = (budget, format = number) => available(budget) ? ` (budget ${format(budget)})` : ''

export function scorecardMetrics(score, lines = []) {
  const { cement, diesel, breakage, costs } = score
  return {
    cement: {
      usage: available(cement?.bags) ? `${number(cement.bags)} bags` : null,
      rate: available(cement?.blocks_per_bag) ? `${number(cement.blocks_per_bag, 1)} per bag${budgetText(cement.budget_blocks_per_bag)}` : null,
      ...warningMetric(lines, 'cement', cement?.budget_blocks_per_bag),
    },
    diesel: {
      usage: available(diesel?.litres) ? `${number(diesel.litres)} L` : null,
      rate: available(diesel?.per_1000) ? `${number(diesel.per_1000, 1)} L per 1,000${budgetText(diesel.budget_per_1000)}` : null,
      ...warningMetric(lines, 'diesel', diesel?.budget_per_1000),
    },
    breakage: {
      usage: available(breakage?.blocks) ? `${number(breakage.blocks)} broken` : null,
      rate: available(breakage?.pct) ? `${number(breakage.pct)}%${available(breakage.allowed_pct) ? ` (allowed ${number(breakage.allowed_pct)}%)` : ''}` : null,
      ...warningMetric(lines, 'breakage', breakage?.allowed_pct),
    },
    materials: {
      rate: score.contract_model !== 'service_fee' && available(costs?.materials) && available(costs.materials_per_block)
        ? `${money(costs.materials_per_block)} per block${budgetText(costs.materials_budget_per_block, money)}` : null,
      chip: againstBudget(costs?.materials_per_block, costs?.materials_budget_per_block),
    },
  }
}

export function scorecardCostLines(costs) {
  return [['cement', costs.cement], ['dust', costs.dust], ['3/8', costs.chippings], ['diesel', costs.diesel]]
    .filter(([, amount]) => available(amount)).map(([material, amount]) => `${material} ${money(amount)}`)
}

export function scorecardLabour(costs, showMoney = true) {
  if (costs?.roster_recorded === false) return 'roster not recorded'
  if (!costs?.roster_recorded) return null
  return [
    available(costs.workers) ? `${number(costs.workers)} workers` : null,
    showMoney && available(costs.labour) ? money(costs.labour) : null,
  ].filter(Boolean).join(', ') || null
}

export function scorecardWhatsAppText(score, lines = [], generator) {
  const { date, site_name: site, blocks_total: total, blocks_9in: nine, blocks_6in: six, costs, dust_kg: dust } = score
  const { cement, diesel, breakage, materials } = scorecardMetrics(score, lines)
  const showCosts = score.contract_model !== 'service_fee'
  const metric = ({ usage, rate, chip }) => [usage, rate].filter(Boolean).join(' — ') + (chip ? ` ${chip.label.toLowerCase()}` : '')
  const labour = scorecardLabour(costs, showCosts)
  const costLines = showCosts && available(costs?.materials) ? scorecardCostLines(costs) : []
  return [
    `Production report ${scorecardDate(date)} — ${site}`,
    generatorWhatsApp(generator),
    available(total) && `Blocks: ${number(total)} (9": ${number(nine)}, 6": ${number(six)})`,
    (cement.usage || cement.rate) && `Cement: ${metric(cement)}`,
    (diesel.usage || diesel.rate) && `Diesel: ${metric(diesel)}`,
    available(dust) && `Dust: ${number(dust / 1000, 3)} t (calculated)`,
    breakage.usage && `Breakage: ${metric(breakage)}`,
    costLines.length > 0 && `Cost: ${costLines.join(' · ')}`,
    materials.rate && `Materials: ${materials.rate}`,
    labour && `Labour: ${labour}`,
    showCosts && available(costs?.total) && `Total: ${money(costs.total)}${available(costs.total_per_block) ? ` — ${money(costs.total_per_block)} per block` : ''}`,
  ].filter(Boolean).join('\n')
}
