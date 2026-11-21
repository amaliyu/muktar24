export async function shareText(text, title) {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text })
      return 'shared'
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled'
      throw error
    }
  }
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer')
  return 'opened'
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch { /* Try the older browser copy action. */ }
  }
  const input = document.createElement('textarea')
  input.value = text
  input.readOnly = true
  Object.assign(input.style, { position: 'fixed', left: '0', top: '0', opacity: '0' })
  const previous = document.activeElement
  try {
    document.body.append(input)
    input.select()
    return document.execCommand?.('copy') === true
  } catch {
    return false
  } finally {
    input.remove()
    previous?.focus()
  }
}
