import { useState } from 'react'
import { Brain, Wifi, Clock } from 'lucide-react'
import SortTh from '../ui/SortTh'
import { mkSort, sortArr } from '../../utils/queryUtils'
import CopyBtn from '../ui/CopyBtn'
import ClusterOverview from '../ui/ClusterOverview'
import InlineMarkup from '../ui/InlineMarkup'

function fmtBytes(b) {
  if (!b) return '0 B'
  if (b >= 1024 * 1024 * 1024) return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(2)} MB`
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${b} B`
}

function fmtDuration(ms) {
  if (ms >= 86400000) return `${(ms / 86400000).toFixed(1)} days`
  if (ms >= 3600000) return `${(ms / 3600000).toFixed(1)} hours`
  if (ms >= 60000) return `${(ms / 60000).toFixed(0)} min`
  return `${(ms / 1000).toFixed(0)} sec`
}

// ── Auto-generated narrative summary of the log ──────────────────────────────
function buildNarrative(logData) {
  if (!logData) return ''
  const m = logData.metadata
  const lines = []

  // Version & platform
  if (m.version && m.version !== 'unknown') {
    const editionLabel = m.module === 'enterprise'
      ? 'Enterprise'
      : m.module === 'psmdb'
        ? 'PSMDB'
        : 'Community'
    lines.push(`The server is running **${editionLabel} edition v${m.version}**${m.arch ? ` on a ${m.arch} architecture` : ''}${m.os ? ` running ${m.os}` : ''}.`)
    if (parseFloat(m.version) < 5.0) {
      lines.push(`⚠️ Version ${m.version} is **end-of-life** — upgrading to MongoDB 7.0+ is strongly recommended.`)
    }
    if (m.module === 'psmdb') {
      lines.push(`This log appears to be from a **PSMDB-compatible** MongoDB distribution. Keep security strong: enable authentication and RBAC, require TLS in transit, and review audit logs regularly.`)
    } else if (m.module !== 'enterprise') {
      lines.push(`The server is using **MongoDB Community Edition** (MongoDB Inc open-source edition). Keep security strong with OSS-friendly hardening: enable authentication and RBAC, require TLS in transit, and regularly review audit/error logs.`)
    }
  }

  // Atlas
  if (m.provider && m.region) {
    lines.push(`The server is hosted on **Atlas (${m.provider})** in the **${m.region}** region. Ensure your application servers are in the same region to minimize latency and data transfer costs.`)
  }

  // Time range
  if (m.startTime && m.endTime) {
    const durMs = new Date(m.endTime) - new Date(m.startTime)
    const durStr = fmtDuration(durMs)
    lines.push(`Log spans **${durStr}** — from ${m.startTime.slice(0,19).replace('T',' ')} to ${m.endTime.slice(0,19).replace('T',' ')}.`)
    if (durMs > 86400000) {
      lines.push(`The log duration exceeds 24 hours. **Log rotation** is recommended to keep individual log files manageable.`)
    }
  }

  // Slow ops
  const slowCount = logData.slowOps.length
  const maxSlow = logData.slowOps[0]?.dur || 0
  const totalSlowMs = logData.slowOps.reduce((a, r) => a + (r.dur || 0), 0)
  if (slowCount > 0) {
    lines.push(`Found **${slowCount.toLocaleString()}** slow operations (>100ms). The slowest took **${maxSlow.toLocaleString()}ms**. Total wasted time: **${fmtDuration(totalSlowMs)}**.`)
    if (totalSlowMs > 3600000) {
      lines.push(`⚠️ The total impact from slow operations exceeds **1 hour** — this may indicate a resource or indexing problem that needs urgent attention.`)
    }
  } else {
    lines.push(`No slow operations detected — query performance looks healthy.`)
  }

  // COLLSCAN
  const collscanCount = Object.values(logData.indexWarnings).reduce((a, v) => a + v.count, 0)
  const collscanNs = Object.keys(logData.indexWarnings).length
  if (collscanCount > 0) {
    const collscanMs = logData.slowOps.filter(r => r.plan?.includes('COLLSCAN')).reduce((a, r) => a + (r.dur || 0), 0)
    lines.push(`Found **${collscanCount.toLocaleString()} COLLSCAN** operations across **${collscanNs}** collection${collscanNs > 1 ? 's' : ''}. These are full collection scans caused by missing indexes — **${fmtDuration(collscanMs)}** of wasted time.`)
  }

  // Errors
  if (logData.errors.length > 0) {
    lines.push(`Detected **${logData.errors.length.toLocaleString()} errors** (severity E/F) and **${logData.warnings.length.toLocaleString()} warnings** in the log.`)
  }

  // Connections
  const { open, peak, uniqueIPs } = logData.connectionStats
  if (open > 0) {
    lines.push(`**${open.toLocaleString()}** connections were opened from **${uniqueIPs}** unique clients. Peak concurrent connections reached **${peak}**.`)
    if (peak > 500) {
      lines.push(`⚠️ Peak of ${peak} concurrent connections is high — consider connection pooling or increasing \`maxIncomingConnections\`.`)
    }
  }

  // Drivers
  if (logData.drivers?.length > 0) {
    const drvNames = logData.drivers.map(d => `${d.name} v${d.version}`).join(', ')
    lines.push(`Application drivers detected: **${drvNames}**.`)
  }

  // App names — exclude internal MongoDB backup/tooling clients that dominate stats
  // (PBM, oplog fetchers, internal clients) so the "most active" reflects real workload.
  if (logData.appNames?.length > 0) {
    const isInternalApp = (name) => {
      const n = (name || '').toLowerCase()
      return (
        n.startsWith('pbm') ||           // backup agent clients
        n.includes('oplog') ||
        n.includes('mongodb internal') ||
        n.includes('mongodb-enterprise') ||
        n.includes('-backup') && n.startsWith('pbm') ||
        n === 'mongosh' ||
        n.startsWith('mongos ')          // mongos internal
      )
    }
    const userApps = logData.appNames.filter(a => !isInternalApp(a.name))
    const top = userApps[0]
    if (top) {
      lines.push(`The most active application is **${top.name}** with **${top.count.toLocaleString()}** operations (${top.slowCount} slow, ${top.errors} errors).`)
    } else {
      lines.push(`Only internal tooling (PBM, oplog fetchers, internal clients) was active in this log — no real application workload detected.`)
    }
  }

  return lines
}

// ─────────────────────────────────────────────────────────────────────────────
export default function InsightsTab({ logData, mask }) {
  const [ipSort, setIpSort] = useState({ key: 'accepted', dir: 'desc' })
  const [lcSort, setLcSort] = useState({ key: 'durMs', dir: 'desc' })

  if (!logData) return null

  const narrative = buildNarrative(logData)
  const ipStats = logData.ipStats || []
  const longConns = logData.longConns || []

  const ipRows = sortArr(ipStats, ipSort)
  const lcRows = sortArr(longConns, lcSort)

  const narrativeText = narrative.map(l => l.replace(/\*\*/g, '')).join('\n')

  return (
    <div className="space-y-5">

      {/* ── Cluster Overview (colorful top panel) ── */}
      <ClusterOverview logData={logData} mask={mask} />

      {/* ── Narrative Summary ── */}
      <div className="bg-surface rounded-xl border border-accent/15 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
              <Brain size={14} className="text-accent" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">LogCortex Insights</h3>
              <p className="text-[10px] text-white/30">Auto-generated analysis of your log data</p>
            </div>
          </div>
          <CopyBtn text={narrativeText} />
        </div>
        <div className="space-y-2">
          {narrative.map((line, i) => {
            const isWarning = line.startsWith('⚠️')
            return (
              <div key={i} className={`text-xs leading-relaxed flex gap-2 ${isWarning ? 'text-warning' : 'text-white/70'}`}>
                {isWarning && <span className="flex-shrink-0">⚠️</span>}
                <span><InlineMarkup text={isWarning ? line.slice(3) : line} /></span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Driver compat now shown in ClusterOverview above */}

      {/* ── Stats by IP ── */}
      {ipStats.length > 0 && (
        <div className="bg-surface rounded-xl border border-white/5 p-4">
          <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Wifi size={12} />Stats by IP Address
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-elevated/50">
                <tr>
                  {[['ip','IP'],['accepted','Accepted'],['closed','Closed'],['reslen','Response Size']].map(([col, label]) => (
                    <SortTh key={col} col={col} label={label} sortCfg={ipSort} onSort={mkSort(setIpSort)} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {ipRows.slice(0, 50).map((r, i) => (
                  <tr key={i} className="border-t border-white/5 hover:bg-white/2">
                    <td className="px-3 py-2 font-mono text-accent">{mask(r.ip)}</td>
                    <td className="px-3 py-2 text-white/70 text-right">{r.accepted.toLocaleString()}</td>
                    <td className="px-3 py-2 text-white/50 text-right">{r.closed.toLocaleString()}</td>
                    <td className="px-3 py-2 text-white/50 text-right">{fmtBytes(r.reslen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Long-lasting Connections ── */}
      {longConns.length > 0 ? (
        <div className="bg-surface rounded-xl border border-white/5 p-4">
          <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Clock size={12} />Long-Lasting Connections (&gt;5 min)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-elevated/50">
                <tr>
                  {[['ctx','Context'],['ip','IP'],['openTs','Connected At'],['durMs','Duration']].map(([col, label]) => (
                    <SortTh key={col} col={col} label={label} sortCfg={lcSort} onSort={mkSort(setLcSort)} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {lcRows.slice(0, 50).map((r, i) => (
                  <tr key={i} className="border-t border-white/5 hover:bg-white/2">
                    <td className="px-3 py-2 font-mono text-white/50">{r.ctx}</td>
                    <td className="px-3 py-2 font-mono text-accent">{mask(r.ip) || '—'}</td>
                    <td className="px-3 py-2 font-mono text-white/40">{r.openTs?.slice(11, 19)}</td>
                    <td className={`px-3 py-2 font-mono font-bold ${r.durMs > 3600000 ? 'text-danger' : r.durMs > 1800000 ? 'text-warning' : 'text-caution'}`}>
                      {fmtDuration(r.durMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-white/5 p-4">
          <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Clock size={12} />Long-Lasting Connections
          </h3>
          <p className="text-xs text-white/30">No connections lasting longer than 5 minutes detected.</p>
        </div>
      )}
    </div>
  )
}
