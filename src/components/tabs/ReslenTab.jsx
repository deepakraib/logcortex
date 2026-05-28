import { useState } from 'react'
import { TrendingUp, Search } from 'lucide-react'
import SortTh from '../ui/SortTh'
import { mkSort, sortArr } from '../../utils/queryUtils'

function fmtBytes(b) {
  if (b >= 1024 * 1024 * 1024) return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(2)} MB`
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${b} B`
}

export default function ReslenTab({ logData, mask }) {
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState({ key: 'reslen', dir: 'desc' })

  if (!logData) return null
  const { topReslen = [] } = logData

  if (!topReslen.length) {
    return (
      <div className="flex flex-col items-center py-16 text-white/30">
        <TrendingUp size={40} className="mb-3" />
        <p className="text-sm text-white/50">No large result sets detected</p>
        <p className="text-xs mt-1">Operations with response size &gt; 16 MB will appear here.</p>
      </div>
    )
  }

  const filtered = topReslen.filter(r =>
    !filter || r.ns?.includes(filter) || r.op?.includes(filter) || r.appName?.includes(filter)
  )
  const rows = sortArr(filtered, sort)
  const totalBytes = topReslen.reduce((a, r) => a + r.reslen, 0)
  const maxBytes = topReslen[0]?.reslen || 0

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-surface border border-white/5 rounded-xl p-3">
          <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Large Result Ops</div>
          <div className="text-xl font-bold text-danger">{topReslen.length}</div>
          <div className="text-[10px] text-white/30 mt-0.5">&gt;16 MB responses</div>
        </div>
        <div className="bg-surface border border-white/5 rounded-xl p-3">
          <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Largest Response</div>
          <div className="text-xl font-bold text-warning">{fmtBytes(maxBytes)}</div>
        </div>
        <div className="bg-surface border border-white/5 rounded-xl p-3">
          <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Total Bytes</div>
          <div className="text-xl font-bold text-accent">{fmtBytes(totalBytes)}</div>
        </div>
      </div>

      <div className="bg-surface rounded-xl p-3 border border-amber-500/10 text-xs text-white/50 leading-relaxed">
        <span className="text-warning font-medium">Why this matters: </span>
        Large responses indicate queries without projections, unbounded finds, or missing pagination.
        Add <code className="font-mono text-green-300">projection</code>, <code className="font-mono text-green-300">limit()</code>,
        or paginate with <code className="font-mono text-green-300">skip()</code> / range queries.
      </div>

      {/* Filter + table */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
            <input value={filter} onChange={e => setFilter(e.target.value)}
              placeholder="Filter by namespace, operation, app…"
              className="w-full bg-elevated border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-accent/50" />
          </div>
          <span className="text-xs text-white/30">{rows.length} ops</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table className="w-full text-xs">
            <thead className="bg-elevated/50">
              <tr>
                {[['ts','Time'],['ns','Namespace'],['op','Op'],['reslen','Response Size'],['dur','Duration ms'],['appName','App']].map(([col, label]) => (
                  <SortTh key={col} col={col} label={label} sortCfg={sort} onSort={mkSort(setSort)} />
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-white/5 hover:bg-white/2">
                  <td className="px-3 py-2 font-mono text-white/40 whitespace-nowrap">{r.ts?.slice(11, 23)}</td>
                  <td className="px-3 py-2 font-mono text-accent max-w-[140px] truncate">{mask(r.ns) || '—'}</td>
                  <td className="px-3 py-2 text-white/60">{r.op}</td>
                  <td className="px-3 py-2 font-mono font-bold text-danger">{fmtBytes(r.reslen)}</td>
                  <td className="px-3 py-2 font-mono text-warning text-right">{r.dur != null ? r.dur.toLocaleString() : '—'}</td>
                  <td className="px-3 py-2 font-mono text-white/40 truncate max-w-[100px]">{mask(r.appName) || '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-white/30">No results match the filter</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
