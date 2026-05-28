import React, { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import SortTh from '../ui/SortTh'
import { COLORS } from '../../utils/constants'
import { sortArr, mkSort } from '../../utils/queryUtils'

const COLUMNS = [
  ['ts', 'Time'],
  ['ns', 'Namespace'],
  ['opType', 'Op'],
  ['dur', 'ms'],
  ['totalMs', 'Total ms'],
  ['reslen', 'Reslen'],
  ['plan', 'Plan'],
  ['docsEx', 'Docs'],
  ['keysEx', 'Keys'],
]

function durationColor(dur) {
  if (dur >= 1000) return 'bg-red-950/60 hover:bg-red-950/80'
  if (dur >= 500) return 'bg-amber-950/60 hover:bg-amber-950/80'
  return 'bg-yellow-950/40 hover:bg-yellow-950/60'
}

function fmtBytes(b) {
  if (!b) return '—'
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)}MB`
  if (b >= 1024) return `${(b / 1024).toFixed(1)}KB`
  return `${b}B`
}

export default function SlowOpsTab({ logData, mask }) {
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState({ key: 'dur', dir: 'desc' })
  const [expandedRow, setExpandedRow] = useState(null) // stores row identity key
  const [collscanOnly, setCollscanOnly] = useState(false)

  // Build pattern totals for "Total ms" column
  const patternTotals = useMemo(() => {
    if (!logData) return {}
    const map = {}
    logData.slowOps.forEach(r => {
      const key = `${r.ns}||${r.opType}`
      map[key] = (map[key] || 0) + (r.dur || 0)
    })
    return map
  }, [logData])

  const rows = useMemo(() => {
    if (!logData) return []
    const filtered = logData.slowOps.filter(x => {
      if (collscanOnly && !x.plan?.includes('COLLSCAN')) return false
      if (!filter) return true
      return x.ns?.includes(filter) || x.msg?.includes(filter) || x.opType?.includes(filter)
    }).map(r => ({
      ...r,
      totalMs: patternTotals[`${r.ns}||${r.opType}`] || 0,
    }))
    return sortArr(filtered, sort).slice(0, 50)
  }, [logData, filter, sort, collscanOnly, patternTotals])

  const collscanCount = useMemo(() =>
    logData?.slowOps.filter(r => r.plan?.includes('COLLSCAN')).length || 0,
    [logData])

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by namespace, operation…"
            className="w-full bg-elevated border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
          />
        </div>
        {/* COLLSCAN-only toggle */}
        <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all border ${collscanOnly ? 'bg-danger/15 text-danger border-danger/30' : 'bg-white/5 text-white/40 border-white/10 hover:text-white/70'}`}>
          <input type="checkbox" checked={collscanOnly} onChange={e => setCollscanOnly(e.target.checked)} className="accent-danger" />
          COLLSCAN only
          {collscanCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-danger/20 text-danger">{collscanCount}</span>}
        </label>
        <span className="text-xs text-white/30">{rows.length} rows</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full text-xs">
          <thead className="bg-elevated/50">
            <tr>
              {COLUMNS.map(([col, label]) => (
                <SortTh key={col} col={col} label={label} sortCfg={sort} onSort={mkSort(setSort)} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const rowKey = `${row.ts}|${row.ns}|${row.dur}|${i}`
              return (
              <React.Fragment key={rowKey}>
                <tr
                  className={`cursor-pointer border-t border-white/5 ${durationColor(row.dur)}`}
                  onClick={() => setExpandedRow(expandedRow === rowKey ? null : rowKey)}
                >
                  <td className="px-3 py-2 font-mono text-white/50 whitespace-nowrap">{row.ts?.slice(11, 23) || '—'}</td>
                  <td className="px-3 py-2 font-mono text-accent max-w-[120px] truncate">{mask(row.ns) || '—'}</td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                      style={{ background: `${COLORS[row.opType] || COLORS.other}22`, color: COLORS[row.opType] || COLORS.other }}>
                      {row.opType}
                    </span>
                  </td>
                  <td className={`px-3 py-2 font-mono font-bold ${row.dur >= 1000 ? 'text-danger' : row.dur >= 500 ? 'text-warning' : 'text-caution'}`}>
                    {row.dur?.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-mono text-white/40 text-right">{row.totalMs ? row.totalMs.toLocaleString() : '—'}</td>
                  <td className="px-3 py-2 font-mono text-white/40 text-right">{fmtBytes(row.reslen)}</td>
                  <td className={`px-3 py-2 text-[10px] font-mono max-w-[90px] truncate ${row.plan?.includes('COLLSCAN') ? 'text-danger font-bold' : 'text-white/40'}`}>
                    {row.plan || '—'}
                  </td>
                  <td className="px-3 py-2 text-white/50 text-right">{row.docsEx ?? '—'}</td>
                  <td className="px-3 py-2 text-white/50 text-right">{row.keysEx ?? '—'}</td>
                </tr>
                {expandedRow === rowKey && (
                  <tr className="bg-black/40">
                    <td colSpan={9} className="px-4 py-3 space-y-2">
                      <div className="flex gap-6 text-[10px] text-white/40 font-mono mb-2">
                        {row.appName && <span>App: <span className="text-accent">{mask(row.appName)}</span></span>}
                        {row.plan && <span>Plan: <span className={row.plan.includes('COLLSCAN') ? 'text-danger font-bold' : 'text-green-300'}>{row.plan}</span></span>}
                        {row.reslen != null && <span>Reslen: <span className="text-white">{fmtBytes(row.reslen)}</span></span>}
                      </div>
                      <div className="text-[10px] text-white/40 uppercase tracking-wider">Command</div>
                      <pre className="font-mono text-[11px] text-green-300 whitespace-pre-wrap break-all max-h-40 overflow-y-auto bg-black/30 rounded p-2">
                        {mask(JSON.stringify(row.cmd, null, 2))}
                      </pre>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )})}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-white/30 text-xs">
                  {collscanOnly ? 'No COLLSCAN operations found' : 'No slow operations found'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
