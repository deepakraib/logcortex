import { Download } from 'lucide-react'

export default function ExportBtn({ text, filename, className = '' }) {
  function handleExport() {
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      className={`flex items-center gap-1 px-2 py-1 rounded text-xs text-white/50 hover:text-accent hover:bg-white/5 transition-colors ${className}`}
      onClick={handleExport}
    >
      <Download size={12} />
      {filename}
    </button>
  )
}
