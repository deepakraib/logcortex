import { useState, useMemo } from 'react'
import { CheckCircle, Search, Database } from 'lucide-react'
import CopyBtn from '../ui/CopyBtn'

function generateIndexCmd(ns, examples) {
  const dotIdx = ns.indexOf('.')
  if (dotIdx === -1) return `// Could not parse namespace: ${ns}`
  const db = ns.slice(0, dotIdx)
  const coll = ns.slice(dotIdx + 1)
  if (!coll) return `// Could not parse namespace: ${ns}`

  // Extract query fields from example commands
  const fields = {}
  examples.forEach((ex) => {
    try {
      const cmd = typeof ex.cmd === 'string' ? JSON.parse(ex.cmd) : ex.cmd
      const q = cmd?.filter || cmd?.query || cmd?.q || cmd
      if (q && typeof q === 'object') {
        Object.keys(q).forEach((k) => {
          if (!k.startsWith('$') && k !== '_id') fields[k] = 1
        })
      }
    } catch { /* ignore */ }
  })
  const fStr = Object.keys(fields).length ? JSON.stringify(fields) : '{ /* add your query fields */ }'
  return `db.getSiblingDB("${db}").getCollection("${coll}").createIndex(${fStr})`
}

export default function IndexesTab({ logData, mask }) {
  const [search, setSearch] = useState('')

  const entries = useMemo(() => {
    if (!logData) return []
    const s = search.toLowerCase()
    return Object.entries(logData.indexWarnings)
      .filter(([ns]) => !s || ns.toLowerCase().includes(s))
      .sort(([, a], [, b]) => b.count - a.count)
  }, [logData, search])

  const totalCollscans = Object.values(logData?.indexWarnings || {}).reduce((a, v) => a + v.count, 0)

  if (!Object.keys(logData?.indexWarnings || {}).length) {
    return (
      <div className="flex flex-col items-center py-10 text-white/30">
        <CheckCircle size={32} className="text-success mb-2" />
        <p className="text-sm">No COLLSCAN operations detected — indexes look healthy!</p>
      </div>
    )
  }

  // All suggested commands (for bulk copy)
  const allCmds = entries.map(([ns, v]) => generateIndexCmd(ns, v.examples)).join('\n\n')

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center gap-3 p-3 bg-danger/8 rounded-xl border border-danger/20">
        <Database size={16} className="text-danger flex-shrink-0" />
        <div className="flex-1">
          <span className="text-sm font-semibold text-danger">{totalCollscans.toLocaleString()} COLLSCAN operations</span>
          <span className="text-xs text-white/40 ml-2">across {Object.keys(logData.indexWarnings).length} collection{Object.keys(logData.indexWarnings).length > 1 ? 's' : ''}</span>
        </div>
        <CopyBtn text={allCmds} className="!text-accent" />
      </div>

      {/* Search/filter */}
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter by namespace (e.g. mydb.users)…"
          className="w-full bg-elevated border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
        />
      </div>

      {entries.length === 0 && (
        <div className="text-xs text-white/30 text-center py-6">No namespaces match the filter</div>
      )}

      {entries.map(([ns, v]) => {
        const cmd = generateIndexCmd(ns, v.examples)
        return (
          <div key={ns} className="bg-surface rounded-xl p-4 border border-white/5 hover:border-danger/20 transition-colors">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <Database size={13} className="text-danger flex-shrink-0" />
                <span className="font-mono text-accent text-sm font-medium truncate">{mask(ns)}</span>
                <span className="text-[10px] text-danger bg-danger/10 px-2 py-0.5 rounded-full font-bold flex-shrink-0">
                  {v.count} COLLSCAN{v.count > 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Example durations */}
            <div className="flex gap-2 mb-3">
              {v.examples.slice(0, 3).map((ex, ei) => (
                <div key={ei} className="flex items-center gap-1.5 px-2 py-1 bg-elevated rounded border border-white/5">
                  <span className="text-[10px] text-white/30">{ex.ts?.slice(11, 19)}</span>
                  {ex.dur != null && (
                    <span className={`text-[10px] font-mono font-bold ${ex.dur >= 1000 ? 'text-danger' : ex.dur >= 500 ? 'text-warning' : 'text-caution'}`}>
                      {ex.dur.toLocaleString()}ms
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Suggested index */}
            <div className="bg-black/40 rounded-lg p-3 border border-white/5">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-[10px] text-white/30 uppercase tracking-wider">Suggested Index</span>
                  <span className="ml-2 text-[10px] text-white/20">(review field order and selectivity)</span>
                </div>
                <CopyBtn text={cmd} />
              </div>
              <pre className="font-mono text-xs text-green-300 whitespace-pre-wrap break-all">{cmd}</pre>
            </div>

            {/* How to verify */}
            <details className="mt-2">
              <summary className="text-[10px] text-white/30 cursor-pointer hover:text-white/50 select-none">
                How to verify this index helps ▾
              </summary>
              <div className="mt-2 text-[11px] text-white/50 space-y-1 pl-2 border-l border-white/10">
                <p>1. Create the index: run the command above in <code className="font-mono text-green-300/70">mongosh</code></p>
                <p>2. Verify with: <code className="font-mono text-green-300/70">{`db.getSiblingDB("${ns.split('.')[0]}").getCollection("${ns.slice(ns.indexOf('.')+1)}").explain("executionStats").find({...})`}</code></p>
                <p>3. Check that <code className="font-mono text-green-300/70">winningPlan.stage</code> is <code className="font-mono text-green-300/70">IXSCAN</code> (not COLLSCAN)</p>
                <p>4. Monitor <code className="font-mono text-green-300/70">db.currentOp()</code> after deployment</p>
              </div>
            </details>
          </div>
        )
      })}
    </div>
  )
}
