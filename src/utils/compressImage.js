// Shrink a photo before upload (site cameras produce 3–8 MB images; sites run
// on mobile data). Non-images (e.g. a PDF waybill) pass through unchanged, and
// any decode failure falls back to the original file.
export async function compressImage(file, { maxSide = 1600, quality = 0.75 } = {}) {
  if (!file || !file.type?.startsWith('image/') || typeof document === 'undefined') return file
  try {
    const url = URL.createObjectURL(file)
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    URL.revokeObjectURL(url)
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}
