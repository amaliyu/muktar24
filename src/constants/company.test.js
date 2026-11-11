import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  COMPANY_EMAIL,
  COMPANY_PHONE_OFFICE,
  COMPANY_PHONE_OFFICE_INTL,
  COMPANY_PHONE_MOBILE,
} from './company'

describe('company contact constants', () => {
  it('has the exact company email', () => {
    expect(COMPANY_EMAIL).toBe('info@abujaprecast.com')
  })
  it('has the exact office number', () => {
    expect(COMPANY_PHONE_OFFICE).toBe('0905 554 4433')
    expect(COMPANY_PHONE_OFFICE_INTL).toBe('+234 905 554 4433')
  })
  it('has the exact mobile number', () => {
    expect(COMPANY_PHONE_MOBILE).toBe('0703 064 7949')
  })
})

describe('no hardcoded company contact details in src', () => {
  const files = []
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(jsx?|tsx?)$/.test(name) && !/\.test\./.test(name) && !p.endsWith(join('constants', 'company.js'))) files.push(p)
    }
  }
  walk(join(process.cwd(), 'src'))

  it.each([
    ['gmail address', /@gmail\.com/],
    ['wrong office number', /554 ?1433/],
    ['office number', /0?905 ?554 ?4433/],
    ['mobile number', /0?703 ?064 ?7949/],
    ['company email', /info@abujaprecast\.com/],
  ])('%s', (_label, re) => {
    const hits = files.filter(f => re.test(readFileSync(f, 'utf8')))
    expect(hits).toEqual([])
  })
})
