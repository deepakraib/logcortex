import { useState, useMemo } from 'react'
import { CheckCircle, Search, Database } from 'lucide-react'
import CopyBtn from '../ui/CopyBtn'
import { buildIndexSuggestion, INDEX_VERIFY_NOTE } from '../../utils/indexSuggestion.js'

function patternsForNamespace(ns, collscanEntry, queryPatterns) {
  if (collscanEntry?.queryPatterns?.length) return collscanEntry.queryPatterns
  return (queryPatterns || [])
    .filter((q) => q.ns === ns)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((q) => ({ pattern: q.pattern, count: q.count, op: q.op }))
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

  const suggestions = useMemo(() => {
    if (!logData) return {}
    const out = {}
    for (const [ns, v] of Object.entries(logData.indexWarnings || {})) {
      const patterns = patternsForNamespace(ns, v, logData.queryPatterns)
      out[ns] = buildIndexSuggestion(ns, v.examples, patterns)
    }
    return out
  }, [logData])

  const totalCollscans = Object.values(logData?.indexWarnings || {}).reduce((a, v) => a + v.count, 0)

  if (!Object.keys(logData?.indexWarnings || {}).length) {
    return (
      <div className="flex flex-col items-center py-10 text-white/30">
        <CheckCircle size={32} className="text-success mb-2" />
        <p className="text-sm">No COLLSCAN operations detected — indexes look healthy!</p>
      </div>
    )
  }

  const allCmds = entries
    .map(([ns]) => suggestions[ns]?.cmd)
    .filter(Boolean)
    .join('\n\n')

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 p-3 bg-danger/8 rounded-xl border border-danger/20">
        <Database size={16} className="text-danger flex-shrink-0" />
        <div className="flex-1">
          <span className="text-sm font-semibold text-danger">{totalCollscans.toLocaleString()} COLLSCAN operations</span>
          <span className="text-xs text-white/40 ml-2">across {Object.keys(logData.indexWarnings).length} collection{Object.keys(logData.indexWarnings).length > 1 ? 's' : ''}</span>
        </div>
        {allCmds && <CopyBtn text={allCmds} className="!text-accent" />}
      </div>

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
        const suggestion = suggestions[ns]
        const copyText = suggestion?.cmd || ''
        return (
          <div key={ns} className="bg-surface rounded-xl p-4 border border-white/5 hover:border-danger/20 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <Database size={13} className="text-danger flex-shrink-0" />
                <span className="font-mono text-accent text-sm font-medium truncate">{mask(ns)}</span>
                <span className="text-[10px] text-danger bg-danger/10 px-2 py-0.5 rounded-full font-bold flex-shrink-0">
                  {v.count} COLLSCAN{v.count > 1 ? 's' : ''}
                </span>
              </div>
            </div>

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

            {suggestion?.queryPattern && (
              <div className="mb-3 bg-elevated/50 rounded-lg px-3 py-2 border border-white/5">
                <span className="text-[10px] text-white/30 uppercase tracking-wider">Query pattern</span>
                <pre className="font-mono text-[11px] text-white/60 mt-1 whitespace-pre-wrap break-all">{suggestion.queryPattern}</pre>
                {suggestion.source === 'pattern' && (
                  <span className="text-[10px] text-white/30">Fields derived from aggregated slow-query patterns for this namespace.</span>
                )}
              </div>
            )}

            {suggestion?.hasFields ? (
              <>
                <div className="bg-black/40 rounded-lg p-3 border border-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-[10px] text-white/30 uppercase tracking-wider">Suggested Index</span>
                      <span className="ml-2 text-[10px] text-white/20">({suggestion.fields.join(', ')})</span>
                    </div>
                    {copyText && <CopyBtn text={copyText} />}
                  </div>
                  <pre className="font-mono text-xs text-green-300 whitespace-pre-wrap break-all">{suggestion.cmd}</pre>
                </div>

                <div className="mt-2 px-3 py-2 bg-amber-950/30 border border-amber-500/20 rounded-lg text-[11px] text-amber-200/80 leading-relaxed">
                  {INDEX_VERIFY_NOTE}
                </div>

                <details className="mt-2">
                  <summary className="text-[10px] text-white/30 cursor-pointer hover:text-white/50 select-none">
                    How to verify this index helps ▾
                  </summary>
                  <div className="mt-2 text-[11px] text-white/50 space-y-1 pl-2 border-l border-white/10">
                    <p>1. Create the index in a lower environment: run the command above in <code className="font-mono text-green-300/70">mongosh</code></p>
                    <p>2. Verify with: <code className="font-mono text-green-300/70">{`db.getSiblingDB("${ns.split('.')[0]}").getCollection("${ns.slice(ns.indexOf('.')+1)}").explain("executionStats").find({...})`}</code></p>
                    <p>3. Check that <code className="font-mono text-green-300/70">executionStats.executionStages.stage</code> (or <code className="font-mono text-green-300/70">winningPlan.stage</code>) is <code className="font-mono text-green-300/70">IXSCAN</code>, not COLLSCAN</p>
                    <p>4. Compare <code className="font-mono text-green-300/70">totalDocsExamined</code> before and after — it should drop sharply</p>
                    <p>5. Monitor slow-query logs after deployment</p>
                  </div>
                </details>
              </>
            ) : (
              <p className="text-[11px] text-white/30 italic">
                No index suggestion — the log did not include the query filter for this COLLSCAN (typical for getMore-only lines or full collection scans).
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
