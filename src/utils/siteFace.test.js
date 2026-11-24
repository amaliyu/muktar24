import { afterEach, expect, it, vi } from 'vitest'
import { cosine, isPlausibleFace, selfTestFaceEngine, validFace } from './siteFace'

afterEach(() => vi.unstubAllGlobals())
it('computes cosine and handles empty, zero and different vectors', () => {
  expect(cosine([1, 2], [2, 4])).toBeCloseTo(1)
  expect(cosine([1, 0], [0, 1])).toBe(0)
  expect(cosine([], [])).toBe(0)
  expect(cosine([0], [1])).toBe(0)
})
it('rejects sparse, oversized and wrong-length patterns', () => {
  const dense = Array(1024).fill(0); dense.fill(.3, 0, 600); dense[0] = 2.5
  expect(isPlausibleFace(dense)).toBe(true)
  const wrong = Array(1024).fill(0); wrong.fill(.3, 0, 320); wrong[0] = 4.5
  expect(isPlausibleFace(wrong)).toBe(false)
  expect(isPlausibleFace(dense.slice(1))).toBe(false)
  expect(validFace({ face: [{ score: .9, box: [0, 0, 100], embedding: wrong }] }, 320)).toBeNull()
})
it.each([true, false])('builds fixed input, selects 1024 output and disposes tensors (array=%s)', async multiple => {
  const vector = Array(1024).fill(.3)
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ vector, minCosine: .98 }) })))
  const input = {}, desc = { shape: [1, 1024], data: vi.fn(async () => vector) }, other = { shape: [1, 1] }
  const tf = { tensor4d: vi.fn(() => input), dispose: vi.fn(), getBackend: () => 'wasm' }
  const model = { inputs: [{ shape: [1, 2, 3, 3] }], execute: vi.fn(() => multiple ? [other, desc] : desc) }
  expect(await selfTestFaceEngine({ tf, models: { models: { faceres: model } } })).toEqual({ backend: 'wasm', score: expect.closeTo(1), min: .98 })
  expect(tf.tensor4d).toHaveBeenCalledWith(expect.any(Float32Array), [1, 2, 3, 3])
  expect(tf.tensor4d.mock.calls[0][0]).toHaveLength(18)
  expect(tf.tensor4d.mock.calls[0][0][0]).toBeCloseTo(153.5)
  expect(model.execute).toHaveBeenCalledWith(input)
  expect(tf.dispose).toHaveBeenCalledWith(multiple ? [input, other, desc] : [input, desc])
})

it('loads only wasm, self-tests once and caches the check and instance', async () => {
  vi.resetModules()
  const vector = Array(1024).fill(.3)
  const construct = vi.fn()
  vi.doMock('@vladmandic/human', () => ({ default: class {
    constructor(config) {
      construct(config)
      this.tf = { getBackend: () => 'wasm', tensor4d: () => ({}), dispose: vi.fn() }
      this.models = { models: { faceres: { inputs: [{ shape: [1, 2, 2, 3] }], execute: () => ({ shape: [1, 1024], data: async () => vector }) } } }
    }
    load() {}
    warmup() {}
  } }))
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ vector, minCosine: .98 }) })))
  const { loadFaceEngine, getFaceEngineCheck } = await import('./siteFace')
  const engine = await loadFaceEngine()
  expect(await loadFaceEngine()).toBe(engine)
  expect(construct).toHaveBeenCalledTimes(1)
  expect(construct).toHaveBeenCalledWith(expect.objectContaining({ backend: 'wasm', wasmPath: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.22.0/dist/' }))
  expect(getFaceEngineCheck()).toEqual({ backend: 'wasm', score: expect.closeTo(1), min: .98 })
  expect(fetch).toHaveBeenCalledTimes(1)
})
