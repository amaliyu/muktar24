const MODEL_PATH = 'https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.6/models/'
let enginePromise

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
    for (const backend of ['webgl', 'wasm']) {
      const human = new Human({ ...config, backend })
      try {
        await human.load()
        await human.warmup()
        if (human.tf.getBackend() !== backend) throw new Error('Could not start the ' + backend + ' face engine.')
        return human
      } catch (error) {
        if (backend === 'wasm') throw error
      }
    }
  })().catch(error => { enginePromise = null; throw error })
  return enginePromise
}

export function validFace(result, width) {
  if (result.face?.length !== 1) return null
  const face = result.face[0]
  if (!width || !(face.score >= .8) || !(face.box?.[2] >= width * .3) || !face.embedding?.length) return null
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
