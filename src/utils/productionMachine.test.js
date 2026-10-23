import { describe, it, expect } from 'vitest'
import { defaultMachineId, resolveMachine } from './productionMachine'

const QTJ02 = { id: 'm-qtj02', code: 'QTJ-02' }
const QTJ03 = { id: 'm-qtj03', code: 'QTJ-03' }

describe('defaultMachineId', () => {
  it('preselects nothing when the site has no machine', () => {
    expect(defaultMachineId([])).toBe('')
  })
  it('preselects the only machine', () => {
    expect(defaultMachineId([QTJ02])).toBe('m-qtj02')
  })
  it('preselects nothing when the site has several machines', () => {
    expect(defaultMachineId([QTJ02, QTJ03])).toBe('')
  })
})

describe('resolveMachine', () => {
  it('0 machines: saves without a machine', () => {
    expect(resolveMachine({ machines: [], selectedId: '' })).toEqual({ assetId: null, error: null })
  })
  it('1 machine: uses it even if the form value was cleared', () => {
    expect(resolveMachine({ machines: [QTJ02], selectedId: '' })).toEqual({ assetId: 'm-qtj02', error: null })
  })
  it('many machines and none chosen: refuses to save', () => {
    const r = resolveMachine({ machines: [QTJ02, QTJ03], selectedId: '' })
    expect(r.assetId).toBeNull()
    expect(r.error).toMatch(/2 active machines/)
  })
  it('many machines and one chosen: uses the choice', () => {
    expect(resolveMachine({ machines: [QTJ02, QTJ03], selectedId: 'm-qtj03' })).toEqual({ assetId: 'm-qtj03', error: null })
  })
  it('never sends a machine from another site', () => {
    const r = resolveMachine({ machines: [QTJ02], selectedId: 'm-mach01' })
    expect(r.assetId).toBeNull()
    expect(r.error).toBeTruthy()
  })
  it('on edit, keeps the entry\'s original machine even if no longer active there', () => {
    expect(resolveMachine({ machines: [QTJ02], selectedId: 'm-old', originalId: 'm-old' })).toEqual({ assetId: 'm-old', error: null })
  })
})
