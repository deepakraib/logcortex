import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { ChartTip } from '../charts/ChartTip'
import CopyBtn from '../ui/CopyBtn'
import ExportBtn from '../ui/ExportBtn'
import SortTh from '../ui/SortTh'
import { sortArr, mkSort } from '../../utils/queryUtils'
import {
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

export default function StatisticsTab({ logData, mask }) {
  const [subTab, setSubTab] = useState('overview')
  const [qpSort, setQpSort] = useState({ key: 'sum', dir: 'desc' })

  const qpRows = useMemo(
    () => sortArr(logData.queryPatterns, qpSort),
    [logData, qpSort]
  )

  function terminalHeader(cmd) {
    return <span className="text-xs text-accent font-mono">$ {cmd}</span>
  }

  function TerminalBlock({ cmd, text, filename }) {
    return (
      <div className="bg-black/50 rounded-xl border border-white/5 p-4">
        <div className="flex justify-between mb-2">
          {terminalHeader(cmd)}
          <div className="flex gap-1">
            <CopyBtn text={text} />
            <ExportBtn text={text} filename={filename} />
          </div>
        </div>
        <pre className="font-mono text-xs text-green-300 whitespace-pre-wrap leading-relaxed">{text}</pre>
      </div>
    )
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
        <div className="space-y-3">
          <TerminalBlock
            cmd="logcortex stats connections"
            text={statsConnectionsText(logData)}
            filename="logcortex-stats-connections.txt"
          />
          {logData.connTimeline.length > 0 && (
            <div className="bg-surface rounded-xl p-3 border border-white/5">
              <h3 className="text-xs text-white/40 mb-2 uppercase tracking-wider">Connection Timeline</h3>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={logData.connTimeline} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis dataKey="minute" tick={{ fontSize: 9, fill: '#64748b' }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: '#64748b' }} />
                  <Tooltip content={<ChartTip />} />
                  <Bar dataKey="open" fill="#00D4AA" name="opened" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="close" fill="#EF4444" name="closed" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
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
