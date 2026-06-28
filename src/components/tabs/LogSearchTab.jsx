import { useState, useMemo, useEffect } from 'react'
import { Filter, Download, Search } from 'lucide-react'
import SortTh from '../ui/SortTh'
import { SEV_COLORS } from '../../utils/constants'
import { sortArr, mkSort } from '../../utils/queryUtils'

const DEFAULT_CONFIG = {
  start: '', end: '', severities: [], components: [], namespace: '', msgRegex: '',
}

const COLUMNS = [
  ['ts', 'Time'], ['s', 'Sev'], ['c', 'Component'], ['ns', 'Namespace'], ['msg', 'Message'],
]

export default function LogSearchTab({ logData, mask }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [sort, setSort] = useState({ key: 'ts', dir: 'desc' })
  const [regexError, setRegexError] = useState(false)
  const [compiledRegex, setCompiledRegex] = useState(null)
  const rawLines = Array.isArray(logData?.rawLines) ? logData.rawLines : null

  // Compile regex in an effect to avoid setState inside useMemo
  useEffect(() => {
    if (!config.msgRegex) {
      setCompiledRegex(null)
      setRegexError(false)
      return
    }
    if (config.msgRegex.length > 200) {
      setCompiledRegex(null)
      setRegexError(true)
      return
    }
    try {
      setCompiledRegex(new RegExp(config.msgRegex, 'i'))
      setRegexError(false)
    } catch {
      setCompiledRegex(null)
      setRegexError(true)
    }
  }, [config.msgRegex])

  const filteredLines = useMemo(() => {
    if (!rawLines) return []
    return rawLines.filter((row) => {
      if (config.start && row.ts < config.start) return false
      if (config.end && row.ts > config.end) return false
      if (config.severities.length && !config.severities.includes(row.s)) return false
      if (config.components.length && !config.components.includes(row.c)) return false
      if (config.namespace && !row.ns?.includes(config.namespace)) return false
      if (compiledRegex && !compiledRegex.test(row.msg)) return false
      return true
    })
  }, [rawLines, config, compiledRegex])

  const sortedRows = useMemo(() => sortArr(filteredLines, sort), [filteredLines, sort])

  if (!logData) return null

  if (!rawLines) {
    return (
      <div className="flex flex-col items-center py-16 text-white/30">
        <Search size={40} className="mb-3 text-white/20" />
        <p className="text-sm font-medium text-white/50">Log Search unavailable for this session</p>
        <p className="text-xs text-white/30 mt-2 max-w-md text-center leading-relaxed">
          Restored sessions omit raw log lines to save browser storage.
          Re-upload the log file to search, filter, and download lines.
        </p>
      </div>
    )
  }

  function toggleSeverity(s) {
    setConfig((f) => ({
      ...f,
      severities: f.severities.includes(s) ? f.severities.filter((x) => x !== s) : [...f.severities, s],
    }))
  }

  function toggleComponent(c) {
    setConfig((f) => ({
      ...f,
      components: f.components.includes(c) ? f.components.filter((x) => x !== c) : [...f.components, c],
    }))
  }

  function handleDownload() {
    const blob = new Blob([filteredLines.map((r) => JSON.stringify(r.raw)).join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `logcortex-filtered-${logData.metadata.filename || 'log'}`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-3">
      <div className="bg-surface rounded-xl p-4 border border-white/5 space-y-3">
        <h3 className="text-xs text-accent font-mono uppercase tracking-wider flex items-center gap-1.5">
          <Filter size={12} />Log Search
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-white/40 uppercase tracking-wider">Start Time</label>
            <input
              type="datetime-local"
              value={config.start}
              onChange={(e) => setConfig((f) => ({ ...f, start: e.target.value }))}
              className="w-full mt-1 bg-elevated border border-white/10 rounded px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-accent/50"
            />
          </div>
          <div>
            <label className="text-[10px] text-white/40 uppercase tracking-wider">End Time</label>
            <input
              type="datetime-local"
              value={config.end}
              onChange={(e) => setConfig((f) => ({ ...f, end: e.target.value }))}
              className="w-full mt-1 bg-elevated border border-white/10 rounded px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-accent/50"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] text-white/40 uppercase tracking-wider">Severity</label>
          <div className="flex gap-1.5 mt-1">
            {['I', 'W', 'E', 'F', 'D'].map((s) => (
              <button
                key={s}
                onClick={() => toggleSeverity(s)}
                className="px-2.5 py-1 rounded text-xs font-mono font-bold transition-colors"
                style={
                  config.severities.includes(s)
                    ? { background: `${SEV_COLORS[s]}33`, color: SEV_COLORS[s], border: `1px solid ${SEV_COLORS[s]}44` }
                    : { background: '#ffffff0a', border: '1px solid #ffffff10', color: 'rgba(255,255,255,0.3)' }
                }
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] text-white/40 uppercase tracking-wider">Component</label>
          <div className="flex gap-1.5 mt-1 flex-wrap">
            {(logData.componentList || []).map((c) => (
              <button
                key={c}
                onClick={() => toggleComponent(c)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                  config.components.includes(c)
                    ? 'bg-accent/20 text-accent border border-accent/30'
                    : 'bg-white/5 text-white/30 border border-white/10 hover:text-white/60'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-white/40 uppercase tracking-wider">Namespace</label>
            <input
              value={config.namespace}
              onChange={(e) => setConfig((f) => ({ ...f, namespace: e.target.value }))}
              placeholder="db.collection"
              className="w-full mt-1 bg-elevated border border-white/10 rounded px-2 py-1.5 text-xs text-white font-mono placeholder-white/20 focus:outline-none focus:border-accent/50"
            />
          </div>
          <div>
            <label className="text-[10px] text-white/40 uppercase tracking-wider">Message Regex</label>
            <input
              value={config.msgRegex}
              onChange={(e) => setConfig((f) => ({ ...f, msgRegex: e.target.value }))}
              placeholder="e.g. COLLSCAN|timeout"
              className={`w-full mt-1 bg-elevated border rounded px-2 py-1.5 text-xs text-white font-mono placeholder-white/20 focus:outline-none ${
                regexError ? 'border-danger' : 'border-white/10 focus:border-accent/50'
              }`}
            />
            {regexError && <p className="text-[10px] text-danger mt-0.5">Invalid regex</p>}
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-white/40">{filteredLines.length.toLocaleString()} lines matched</span>
          <div className="flex gap-2">
            <button
              onClick={() => setConfig(DEFAULT_CONFIG)}
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Clear filters
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 px-3 py-1.5 bg-accent/20 text-accent border border-accent/30 rounded text-xs hover:bg-accent/30 transition-colors"
            >
              <Download size={11} />Download filtered .log
            </button>
          </div>
        </div>
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
            {sortedRows.slice(0, 200).map((row, i) => (
              <tr key={i} className="border-t border-white/5 hover:bg-white/2">
                <td className="px-3 py-1.5 font-mono text-white/40 whitespace-nowrap">{row.ts?.slice(11, 23)}</td>
                <td className="px-3 py-1.5">
                  <span className="font-mono font-bold text-[10px]" style={{ color: SEV_COLORS[row.s] }}>
                    {row.s}
                  </span>
                </td>
                <td className="px-3 py-1.5 font-mono text-white/40">{row.c}</td>
                <td className="px-3 py-1.5 font-mono text-accent max-w-[100px] truncate">{mask(row.ns) || '—'}</td>
                <td className="px-3 py-1.5 text-white/60 max-w-xs truncate">{mask(row.msg)}</td>
              </tr>
            ))}
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-white/30">
                  No lines match the current filters
                </td>
              </tr>
            )}
            {sortedRows.length > 200 && (
              <tr>
                <td colSpan={5} className="px-4 py-2 text-center text-white/20 text-[10px]">
                  Showing 200 of {sortedRows.length.toLocaleString()} — download to see all
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
