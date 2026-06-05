import { useState, useMemo } from 'react'
import { RefreshCw } from 'lucide-react'
import CopyBtn from '../ui/CopyBtn'
import ExportBtn from '../ui/ExportBtn'
import SortTh from '../ui/SortTh'
import { sortArr, mkSort } from '../../utils/queryUtils'
import {
  DEFAULT_SHORT_CONNECTION_THRESHOLD_MS,
  statsOverviewText,
  statsQueriesText,
  statsConnectionsText,
  statsRestartsText,
  statsRsText,
  statsDistinctText,
  statsStorageText,
} from '../../utils/statisticsText'

const SUB_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'queries', label: 'Queries' },
  { id: 'connections', label: 'Connections' },
  { id: 'restarts', label: 'Restarts' },
  { id: 'rsstate', label: 'RS State' },
  { id: 'distinct', label: 'Distinct' },
  { id: 'storage', label: 'Storage' },
]

const QUERY_COLUMNS = [
  ['ns', 'Namespace'], ['op', 'Op'], ['pattern', 'Pattern'],
  ['count', 'Count'], ['min', 'Min ms'], ['max', 'Max ms'],
  ['mean', 'Mean ms'], ['p95', '95th ms'], ['sum', 'Sum ms'],
]

function terminalHeader(cmd) {
  return <span className="text-xs text-accent font-mono">$ {cmd}</span>
}

function TerminalBlock({ cmd, header, text, filename }) {
  return (
    <div className="bg-black/50 rounded-xl border border-white/5 p-4">
      <div className="flex justify-between gap-3 mb-2">
        <div className="min-w-0">{header || terminalHeader(cmd)}</div>
        <div className="flex gap-1 shrink-0">
          <CopyBtn text={text} />
          <ExportBtn text={text} filename={filename} />
        </div>
      </div>
      <pre className="font-mono text-xs text-green-300 whitespace-pre-wrap leading-relaxed">{text}</pre>
    </div>
  )
}

export default function StatisticsTab({ logData, mask }) {
  const [subTab, setSubTab] = useState('overview')
  const [qpSort, setQpSort] = useState({ key: 'sum', dir: 'desc' })
  const [shortThresholdDraft, setShortThresholdDraft] = useState(String(DEFAULT_SHORT_CONNECTION_THRESHOLD_MS))
  const [shortThresholdMs, setShortThresholdMs] = useState(DEFAULT_SHORT_CONNECTION_THRESHOLD_MS)

  const qpRows = useMemo(
    () => sortArr(logData.queryPatterns, qpSort),
    [logData, qpSort]
  )

  const connectionsText = useMemo(
    () => statsConnectionsText(logData, mask, shortThresholdMs),
    [logData, mask, shortThresholdMs]
  )

  function applyShortThreshold() {
    const next = Number.parseInt(shortThresholdDraft, 10)
    if (Number.isFinite(next) && next >= 0) setShortThresholdMs(next)
  }

  function onShortThresholdKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault()
      applyShortThreshold()
    }
  }

  return (
    <div>
      <div className="flex gap-1 flex-wrap mb-3">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
              subTab === t.id
                ? 'bg-accent/20 text-accent'
                : 'bg-white/5 text-white/40 hover:text-white/70'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'overview' && (
        <TerminalBlock
          cmd={`logcortex stats overview — ${logData.metadata.filename}`}
          text={statsOverviewText(logData, mask)}
          filename="logcortex-stats-overview.txt"
        />
      )}

      {subTab === 'queries' && (
        <div className="bg-black/50 rounded-xl border border-white/5 p-4">
          <div className="flex justify-between mb-2">
            {terminalHeader(`logcortex stats queries — ${logData.metadata.filename}`)}
            <div className="flex gap-1">
              <CopyBtn text={statsQueriesText(logData, mask, qpSort)} />
              <ExportBtn text={statsQueriesText(logData, mask, qpSort)} filename="logcortex-stats-queries.txt" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-accent border-b border-white/10">
                  {QUERY_COLUMNS.map(([col, label]) => (
                    <SortTh key={col} col={col} label={label} sortCfg={qpSort} onSort={mkSort(setQpSort)} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {qpRows.map((r, i) => (
                  <tr key={i} className="border-t border-white/5 hover:bg-white/3">
                    <td className="px-3 py-1.5 text-accent max-w-[140px] truncate">{mask(r.ns)}</td>
                    <td className="px-3 py-1.5 text-white/60">{r.op}</td>
                    <td className="px-3 py-1.5 text-green-300 max-w-[160px] truncate" title={r.pattern}>
                      {r.pattern.slice(0, 30)}
                    </td>
                    <td className="px-3 py-1.5 text-white/80 text-right">{r.count.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-white/60 text-right">{r.min}</td>
                    <td className="px-3 py-1.5 text-danger text-right">{r.max.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-warning text-right">{r.mean.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-caution text-right">{r.p95.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-white/70 text-right">{r.sum.toLocaleString()}</td>
                  </tr>
                ))}
                {qpRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-white/30">
                      No query patterns found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'connections' && (
        <TerminalBlock
          header={(
            <div className="flex flex-wrap items-center gap-2">
              {terminalHeader('logcortex stats connections')}
              <span className="text-xs text-white/35 font-mono">short &lt;</span>
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={shortThresholdDraft}
                onChange={(event) => setShortThresholdDraft(event.target.value)}
                onKeyDown={onShortThresholdKeyDown}
                className="w-24 rounded border border-white/10 bg-black/50 px-2 py-1 text-xs font-mono text-green-300 outline-none focus:border-accent/60"
                aria-label="Short-lived connection threshold in milliseconds"
              />
              <span className="text-xs text-white/35 font-mono">ms</span>
              <button
                type="button"
                onClick={applyShortThreshold}
                className="inline-flex h-7 w-7 items-center justify-center rounded border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20"
                title="Refresh connection statistics"
                aria-label="Refresh connection statistics"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          )}
          text={connectionsText}
          filename="logcortex-stats-connections.txt"
        />
      )}

      {subTab === 'restarts' && (
        <TerminalBlock
          cmd="logcortex stats restarts"
          text={statsRestartsText(logData)}
          filename="logcortex-stats-restarts.txt"
        />
      )}

      {subTab === 'rsstate' && (
        <TerminalBlock
          cmd="logcortex stats replication-state"
          text={statsRsText(logData)}
          filename="logcortex-stats-rsstate.txt"
        />
      )}

      {subTab === 'distinct' && (
        <TerminalBlock
          cmd="logcortex stats distinct-messages"
          text={statsDistinctText(logData, mask)}
          filename="logcortex-stats-distinct.txt"
        />
      )}

      {subTab === 'storage' && (
        <TerminalBlock
          cmd="logcortex stats storage"
          text={statsStorageText(logData)}
          filename="logcortex-stats-storage.txt"
        />
      )}
    </div>
  )
}
