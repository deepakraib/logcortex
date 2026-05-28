import { useState } from 'react'
import { ShieldAlert, ShieldCheck, AlertTriangle, Search } from 'lucide-react'
import SortTh from '../ui/SortTh'
import { mkSort, sortArr } from '../../utils/queryUtils'

const SEV_COLORS = { Critical: '#EF4444', High: '#F59E0B', Medium: '#EAB308', Low: '#00D4AA' }
const SEV_BG = { Critical: 'bg-red-950/60', High: 'bg-amber-950/50', Medium: 'bg-yellow-950/40', Low: 'bg-teal-950/30' }

const EVENT_LABELS = {
  AUTH_FAILURE: 'Authentication Failure',
  AUTHZ_FAILURE: 'Authorization Failure',
  ACCESS_CONTROL: 'Access Control Event',
  USER_CREATED: 'User Created',
  USER_DROPPED: 'User Dropped',
  USER_UPDATED: 'User Updated',
  ROLE_GRANTED: 'Role Granted',
  ROLE_REVOKED: 'Role Revoked',
  LOGOUT: 'User Logout',
  UNAUTHORIZED: 'Unauthorized Access',
  NOT_AUTHORIZED: 'Not Authorized',
  SCRAM_AUTH: 'SCRAM Authentication',
  SSL_EVENT: 'SSL/TLS Event',
  TLS_EVENT: 'TLS Event',
  SHUTDOWN: 'Server Shutdown',
}

export default function AuditTab({ logData, mask }) {
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState({ key: 'ts', dir: 'desc' })

  if (!logData) return null

  const { auditSummary, auditEvents } = logData

  if (!auditEvents || auditEvents.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-white/30">
        <ShieldCheck size={40} className="text-success mb-3" />
        <p className="text-sm font-medium text-white/50">No security events detected</p>
        <p className="text-xs text-white/30 mt-1">No authentication failures, unauthorized access, or user changes found.</p>
      </div>
    )
  }

  const filtered = auditEvents.filter(e =>
    !filter || e.msg?.toLowerCase().includes(filter.toLowerCase()) ||
    e.type?.includes(filter.toUpperCase()) || e.user?.includes(filter)
  )
  const rows = sortArr(filtered, sort)

  const criticalCount = auditEvents.filter(e => e.sev === 'Critical').length
  const highCount = auditEvents.filter(e => e.sev === 'High').length

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-red-950/40 border border-red-500/20 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert size={13} className="text-danger" />
            <span className="text-[10px] text-white/40 uppercase tracking-wider">Critical</span>
          </div>
          <div className="text-xl font-bold text-danger">{criticalCount}</div>
        </div>
        <div className="bg-amber-950/40 border border-amber-500/20 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={13} className="text-warning" />
            <span className="text-[10px] text-white/40 uppercase tracking-wider">High</span>
          </div>
          <div className="text-xl font-bold text-warning">{highCount}</div>
        </div>
        <div className="bg-surface border border-white/5 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert size={13} className="text-caution" />
            <span className="text-[10px] text-white/40 uppercase tracking-wider">Event Types</span>
          </div>
          <div className="text-xl font-bold text-caution">{auditSummary.length}</div>
        </div>
        <div className="bg-surface border border-white/5 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert size={13} className="text-accent" />
            <span className="text-[10px] text-white/40 uppercase tracking-wider">Total Events</span>
          </div>
          <div className="text-xl font-bold text-accent">{auditEvents.length}</div>
        </div>
      </div>

      {/* Event type breakdown */}
      <div className="bg-surface rounded-xl border border-white/5 p-4">
        <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3">Event Type Summary</h3>
        <div className="space-y-2">
          {auditSummary.map(ev => (
            <div key={ev.type} className={`flex items-center justify-between rounded-lg px-3 py-2 ${SEV_BG[ev.sev] || 'bg-white/5'}`}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{ background: `${SEV_COLORS[ev.sev]}22`, color: SEV_COLORS[ev.sev] }}>
                  {ev.sev}
                </span>
                <span className="text-sm text-white/80">{EVENT_LABELS[ev.type] || ev.type}</span>
              </div>
              <span className="font-mono font-bold text-sm text-white">{ev.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Detailed events table */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
            <input value={filter} onChange={e => setFilter(e.target.value)}
              placeholder="Filter by message, event type, user…"
              className="w-full bg-elevated border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-accent/50" />
          </div>
          <span className="text-xs text-white/30">{rows.length} events</span>
        </div>
        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table className="w-full text-xs">
            <thead className="bg-elevated/50">
              <tr>
                {[['ts','Time'],['sev','Severity'],['type','Event Type'],['user','User'],['msg','Message']].map(([col, label]) => (
                  <SortTh key={col} col={col} label={label} sortCfg={sort} onSort={mkSort(setSort)} />
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map((ev, i) => (
                <tr key={i} className="border-t border-white/5 hover:bg-white/2">
                  <td className="px-3 py-2 font-mono text-white/40 whitespace-nowrap">{ev.ts?.slice(11, 23)}</td>
                  <td className="px-3 py-2">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: `${SEV_COLORS[ev.sev]}22`, color: SEV_COLORS[ev.sev] }}>
                      {ev.sev}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-white/60 whitespace-nowrap">{EVENT_LABELS[ev.type] || ev.type}</td>
                  <td className="px-3 py-2 font-mono text-accent">{mask(ev.user) || '—'}</td>
                  <td className="px-3 py-2 text-white/60 max-w-xs truncate" title={ev.msg}>{mask(ev.msg)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-white/30">No events match the filter</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
