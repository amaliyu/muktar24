import { useEffect, useRef, useState } from 'react'
import { Share2 } from 'lucide-react'
import { copyText, shareText } from '../utils/share'
import { ErrorBox, ui } from './site/siteUi'

export default function ShareActions({ text, title, label = 'Share', onShared, disabled, ...buttonProps }) {
  const [sharing, setSharing] = useState(false)
  const [copy, setCopy] = useState(null)
  const [error, setError] = useState(null)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const handleShare = async () => {
    setSharing(true)
    setError(null)
    try {
      const status = await shareText(text, title)
      if (status !== 'cancelled') await onShared?.(text)
    } catch (error) { setError(error) }
    finally { setSharing(false) }
  }

  const handleCopy = async () => {
    clearTimeout(timer.current)
    const copied = await copyText(text)
    setCopy(copied ? 'copied' : 'failed')
    if (copied) timer.current = setTimeout(() => setCopy(null), 3000)
  }

  return <div style={{ minWidth: 0, maxWidth: '100%' }}>
    <ErrorBox error={error} />
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <button type="button" {...buttonProps} style={{ ...ui.btn(), minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 8 }}
        disabled={disabled || sharing} onClick={handleShare}>
        <Share2 size={16} aria-hidden="true" />{typeof navigator.share === 'function' ? label : 'Send to WhatsApp'}
      </button>
      <button type="button" {...buttonProps} style={{ ...ui.btn(), minHeight: 44 }} disabled={disabled} onClick={handleCopy}>
        {copy === 'copied' ? 'Copied' : 'Copy text'}
      </button>
    </div>
    {copy === 'failed' && <label style={{ ...ui.label, marginTop: 8 }}>Could not copy — select the text
      <textarea style={ui.textarea} readOnly value={text} onFocus={event => event.currentTarget.select()} />
    </label>}
  </div>
}
