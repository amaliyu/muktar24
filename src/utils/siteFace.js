const MODEL_PATH = 'https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.6/models/'
let enginePromise
let engineCheck
export const getFaceEngineCheck = () => engineCheck

export function loadFaceEngine() {
  if (!enginePromise) enginePromise = (async () => {
    const { default: Human } = await import('@vladmandic/human')
    const config = {
      modelBasePath: MODEL_PATH, cacheSensitivity: 0, skipAllowed: false,
      face: { enabled: true, detector: { enabled: true, maxDetected: 3 }, mesh: { enabled: true },
        description: { enabled: true }, antispoof: { enabled: true }, liveness: { enabled: true },
        iris: { enabled: false }, emotion: { enabled: false } },
      body: { enabled: false }, hand: { enabled: false }, object: { enabled: false }, gesture: { enabled: false },
    }
    const human = new Human({ ...config, backend: 'wasm', wasmPath: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.22.0/dist/' })
    await human.load()
    await human.warmup()
    if (human.tf.getBackend() !== 'wasm') throw new Error('Could not start the face engine on this phone.')
    engineCheck = await selfTestFaceEngine(human)
    return human
  })().catch(error => { enginePromise = null; throw error })
  return enginePromise
}

export function cosine(a, b) {
  if (!a?.length || a.length !== b?.length) return 0
  let dot = 0, aa = 0, bb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2 }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0
}

export async function selfTestFaceEngine(human) {
  const ref = await (await fetch(import.meta.env.BASE_URL + 'face-selftest.json')).json()
  const model = human.models.models.faceres
  const [, h, w] = model.inputs[0].shape
  const data = new Float32Array(h * w * 3)
  for (let i = 0; i < data.length; i++) {
    const p = Math.floor(i / 3), c = i % 3, y = Math.floor(p / w), x = p % w
    data[i] = 255 * (0.5 + 0.2 * Math.sin(x / 7 + c) + 0.2 * Math.cos(y / 11 - c * 2)) + (((i * 1103515245 + 12345) >>> 16) % 51) - 25
  }
  const input = human.tf.tensor4d(data, [1, h, w, 3])
  const out = model.execute(input)
  const list = Array.isArray(out) ? out : [out]
  try {
    const desc = list.find(t => t.shape[1] === 1024)
    const vec = desc ? Array.from(await desc.data()) : []
    return { backend: human.tf.getBackend(), score: cosine(vec, ref.vector), min: ref.minCosine }
  } finally { human.tf.dispose([input, ...list]) }
}

export function isPlausibleFace(embedding) {
  return embedding?.length === 1024 && Array.from(embedding).every(v => Number.isFinite(v) && v <= 4) && Array.from(embedding).filter(v => v >= .02).length >= 380
}

// Count only otherwise usable faces as implausible, separately from framing failures.
export function implausibleFace(result, width) {
  const face = result.face?.length === 1 ? result.face[0] : null
  return Boolean(face && width && face.score >= .8 && face.box?.[2] >= width * .3 && !isPlausibleFace(face.embedding))
}

export const wrongFacePattern = 'The face pattern from this phone looks wrong. Use “Check in without face” and tell the MD.'

export function validFace(result, width) {
  if (result.face?.length !== 1) return null
  const face = result.face[0]
  if (!width || !(face.score >= .8) || !(face.box?.[2] >= width * .3) || !isPlausibleFace(face.embedding)) return null
  return { embedding: Array.from(face.embedding), liveness: Math.min(face.real ?? 0, face.live ?? 0) }
}

export const averageFaces = frames => frames[0].map((_, i) => frames.reduce((sum, frame) => sum + frame[i], 0) / frames.length)

export function captureJpeg(source, width, height) {
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 640 / Math.max(width, height))
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob)
    else reject(new Error('Could not take the photo. Try again.'))
  }, 'image/jpeg', .8))
}
