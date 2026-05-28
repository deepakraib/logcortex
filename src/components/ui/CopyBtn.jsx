import { useState } from 'react'
import { Copy, CheckCircle } from 'lucide-react'

export default function CopyBtn({ text, className = '' }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      className={`flex items-center gap-1 px-2 py-1 rounded text-xs text-white/50 hover:text-accent hover:bg-white/5 transition-colors ${className}`}
      onClick={handleCopy}
    >
      {copied
        ? <CheckCircle size={12} className="text-success" />
        : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}
