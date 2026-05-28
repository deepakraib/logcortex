import { Server, Database, GitBranch, Layers, AlertTriangle, CheckCircle, XCircle, Wifi } from 'lucide-react'

// ── MongoDB EOL dates ─────────────────────────────────────────────────────────
// Source: https://www.mongodb.com/legal/support-policy/lifecycles
// Verified against https://endoflife.date/mongodb
// Update this table when MongoDB publishes new lifecycle changes.
const MONGO_EOL = {
  '3.6': { eol: '2021-04-30', label: '3.6' },
  '4.0': { eol: '2022-04-30', label: '4.0' },
  '4.2': { eol: '2023-04-30', label: '4.2' },
  '4.4': { eol: '2024-02-29', label: '4.4' },
  '5.0': { eol: '2024-10-31', label: '5.0' },
  '6.0': { eol: '2025-07-31', label: '6.0' },
  '7.0': { eol: '2027-08-31', label: '7.0' },
  '8.0': { eol: '2029-10-31', label: '8.0' },
}

// ── Driver EOL / compatibility ────────────────────────────────────────────────
const DRIVER_MIN_MONGO = {
  mongodb: '4.0', motor: '4.0', pymongo: '3.6',
  'mongo-go-driver': '4.0', 'mongodb-driver-sync': '4.0',
  'mongodb-driver-reactivestreams': '4.0', 'mongo-csharp-driver': '4.0',
  mongoid: '4.0', 'mongo_ruby_driver': '3.6',
  'mongo-php-driver': '4.0', mongoose: '5.0', mongoc: '3.6',
}

function getMongoStatus(version) {
  if (!version || version === 'unknown') return null
  const major = version.split('.').slice(0, 2).join('.')
  const entry = MONGO_EOL[major]
  if (!entry) return { status: 'unknown', color: 'text-white/40', label: 'Unknown EOL' }
  const now = new Date()
  const eolDate = new Date(entry.eol)
  const daysLeft = Math.floor((eolDate - now) / 86400000)
  if (daysLeft < 0) return { status: 'eol', color: 'text-danger', bg: 'bg-danger/15', border: 'border-danger/40', label: `EOL since ${entry.eol.slice(0,7)}`, icon: XCircle }
  if (daysLeft < 90) return { status: 'ending', color: 'text-warning', bg: 'bg-warning/15', border: 'border-warning/40', label: `EOL in ${daysLeft} days`, icon: AlertTriangle }
  return { status: 'ok', color: 'text-success', bg: 'bg-success/15', border: 'border-success/30', label: `Supported until ${entry.eol.slice(0,7)}`, icon: CheckCircle }
}

function getDriverStatus(driverName, mongoVersion) {
  const key = Object.keys(DRIVER_MIN_MONGO).find(k => driverName?.toLowerCase().includes(k))
  if (!key) return null
  const minVer = parseFloat(DRIVER_MIN_MONGO[key])
  const mVer = parseFloat(mongoVersion)
  if (isNaN(mVer) || isNaN(minVer)) return null
  if (mVer < minVer) return { ok: false, msg: `May not support MongoDB ${mongoVersion}` }
  return { ok: true, msg: 'Compatible' }
}

const TOPOLOGY_CONFIG = {
  standalone:  { label: 'Standalone',       color: 'text-white/60',  bg: 'bg-white/8',   border: 'border-white/15', icon: Server },
  replicaset:  { label: 'Replica Set',       color: 'text-accent',    bg: 'bg-accent/10', border: 'border-accent/25', icon: Layers },
  sharded:     { label: 'Sharded Cluster',   color: 'text-warning',   bg: 'bg-warning/10',border: 'border-warning/25',icon: GitBranch },
}

const ROLE_CONFIG = {
  PRIMARY:    { color: 'text-success',  bg: 'bg-success/15',  border: 'border-success/40' },
  SECONDARY:  { color: 'text-accent',   bg: 'bg-accent/15',   border: 'border-accent/30' },
  ARBITER:    { color: 'text-warning',  bg: 'bg-warning/15',  border: 'border-warning/30' },
  RECOVERING: { color: 'text-danger',   bg: 'bg-danger/15',   border: 'border-danger/30' },
}

function fmtDuration(ms) {
  if (!ms || ms < 0) return null
  if (ms >= 86400000) return `${Math.floor(ms / 86400000)}d ${Math.floor((ms % 86400000) / 3600000)}h`
  if (ms >= 3600000)  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`
  return `${Math.floor(ms / 60000)}m`
}

function getDisplayHost(metadata) {
  if (metadata.hostname) return metadata.hostname
  const memberHost = metadata.rsMembers?.[0]?.host
  if (!memberHost) return ''
  return String(memberHost).replace(/:\d+$/, '')
}

export default function ClusterOverview({ logData, mask }) {
  if (!logData) return null
  const m = logData.metadata
  const displayHost = getDisplayHost(m)

  const mongoStatus = getMongoStatus(m.version)
  const topo = TOPOLOGY_CONFIG[m.topology] || TOPOLOGY_CONFIG.standalone
  const TopoIcon = topo.icon
  const role = m.currentRole
  const roleStyle = ROLE_CONFIG[role] || {}
  const logDuration = m.startTime && m.endTime
    ? fmtDuration(new Date(m.endTime) - new Date(m.startTime)) : null

  const drivers = logData.drivers || []
  const collscanCount = Object.values(logData.indexWarnings || {}).reduce((a, v) => a + v.count, 0)

  return (
    <div className="space-y-3 mb-4">
      {/* ── Main cluster card ── */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#161B22] to-[#0F1117] p-4 overflow-hidden relative">
        {/* Decorative glow */}
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-5 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #00D4AA 0%, transparent 70%)', transform: 'translate(30%,-30%)' }} />

        <div className="flex items-start justify-between gap-4 flex-wrap">
          {/* Left: identity */}
          <div className="flex items-start gap-3 min-w-0">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border ${topo.bg} ${topo.border}`}>
              <TopoIcon size={22} className={topo.color} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-white font-mono truncate max-w-xs">
                  {mask(displayHost) || 'Unknown Host'}{m.port ? `:${m.port}` : ''}
                </h2>
                {m.pid && <span className="text-[10px] font-mono text-white/30 bg-white/5 px-1.5 py-0.5 rounded">pid {m.pid}</span>}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {/* Topology badge */}
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${topo.bg} ${topo.color} ${topo.border}`}>
                  {topo.label}
                </span>
                {m.replSetName && (
                  <span className="text-[11px] font-mono text-accent/70">/ {m.replSetName}</span>
                )}
                {/* Role badge */}
                {role && (
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${roleStyle.bg} ${roleStyle.color} ${roleStyle.border}`}>
                    {role}
                  </span>
                )}
              </div>
              {m.dbPath && (
                <div className="text-[10px] font-mono text-white/25 mt-1">{mask(m.dbPath)}</div>
              )}
            </div>
          </div>

          {/* Right: quick stats */}
          <div className="flex gap-3 flex-wrap">
            <StatBadge label="Slow Ops" value={logData.slowOps.length.toLocaleString()} color="text-warning" bg="bg-warning/10" border="border-warning/20" />
            <StatBadge label="Errors" value={logData.errors.length.toLocaleString()} color="text-danger" bg="bg-danger/10" border="border-danger/20" />
            <StatBadge label="COLLSCANs" value={collscanCount.toLocaleString()} color="text-danger" bg="bg-danger/10" border="border-danger/20" />
            <StatBadge label="Connections" value={logData.connectionStats.open.toLocaleString()} color="text-accent" bg="bg-accent/10" border="border-accent/20" />
            {logDuration && <StatBadge label="Log Duration" value={logDuration} color="text-white/60" bg="bg-white/5" border="border-white/10" />}
          </div>
        </div>

        {/* RS Members row */}
        {m.rsMembers?.length > 0 && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-white/30 uppercase tracking-wider">Members:</span>
            {m.rsMembers.map((mbr, i) => (
              <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-elevated rounded border border-white/8 text-[10px] font-mono text-white/60"
                title={`id:${mbr.id} | priority:${mbr.priority}${mbr.hidden?' | hidden':''}${mbr.arbiter?' | arbiter':''}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                {mask(mbr.host)}
                {mbr.arbiter && <span className="text-warning ml-0.5">A</span>}
                {mbr.hidden && <span className="text-white/30 ml-0.5">H</span>}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── MongoDB version card (full width) ── */}
      <VersionCard
        label="MongoDB"
        version={m.version !== 'unknown' ? `v${m.version}` : '?'}
        sub={
          m.module === 'enterprise' ? 'Enterprise Edition'
          : m.module === 'psmdb' ? 'PSMDB'
          : 'Community Edition'
        }
        subColor={
          m.module === 'enterprise' ? 'text-warning'
          : m.module === 'psmdb' ? 'text-blue-400'
          : 'text-white/30'
        }
        status={mongoStatus}
        extra={m.storage !== 'unknown' ? `Storage: ${m.storage}` : null}
        icon={Database}
        accentColor={m.module === 'enterprise' ? '#F59E0B' : m.module === 'psmdb' ? '#60A5FA' : '#00D4AA'}
      />

      {/* ── Driver versions ── */}
      {drivers.length > 0 && (
        <div className="rounded-xl border border-white/8 bg-surface p-4">
          <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Wifi size={12} />Application Drivers
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {drivers.map((d, i) => {
              const compat = getDriverStatus(d.name, m.version)
              return (
                <div key={i} className="flex items-center justify-between bg-elevated rounded-lg px-3 py-2 border border-white/5">
                  <div>
                    <div className="text-xs font-mono text-accent">{d.name}</div>
                    <div className="text-[10px] font-mono text-white/40">v{d.version}</div>
                    {d.ips?.length > 0 && (
                      <div className="text-[10px] text-white/25 mt-0.5">{d.ips.map(ip => mask(ip)).slice(0,2).join(', ')}{d.ips.length > 2 ? ` +${d.ips.length-2}` : ''}</div>
                    )}
                  </div>
                  {compat && (
                    <span className={`flex items-center gap-1 text-[10px] font-medium ${compat.ok ? 'text-success' : 'text-danger'}`}>
                      {compat.ok ? <CheckCircle size={11} /> : <XCircle size={11} />}
                      {compat.ok ? 'OK' : 'Warn'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          {drivers.length === 0 && (
            <p className="text-xs text-white/30">No driver metadata found. Add <code className="font-mono text-green-300/60">appname=MyApp</code> to your connection string to see driver info.</p>
          )}
        </div>
      )}

      {/* ── EOL warning banner ── */}
      {mongoStatus?.status === 'eol' && (
        <div className="rounded-xl bg-danger/10 border border-danger/30 px-4 py-3 flex items-start gap-3">
          <XCircle size={16} className="text-danger flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-danger">MongoDB {m.version} is End-of-Life</p>
            <p className="text-xs text-white/60 mt-0.5">This version no longer receives security patches or bug fixes. Upgrade to MongoDB 8.0 immediately.</p>
            <p className="text-xs font-mono text-white/70 mt-1">
              {(() => {
                const ALL_VERSIONS = ['3.6', '4.0', '4.2', '4.4', '5.0', '6.0', '7.0', '8.0']
                const major = (m.version || '').split('.').slice(0, 2).join('.')
                const idx = ALL_VERSIONS.indexOf(major)
                const path = idx >= 0 ? ALL_VERSIONS.slice(idx) : ALL_VERSIONS
                return 'Upgrade path: ' + path.join(' → ')
              })()}
            </p>
          </div>
        </div>
      )}
      {mongoStatus?.status === 'ending' && (
        <div className="rounded-xl bg-warning/10 border border-warning/30 px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={16} className="text-warning flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-warning">MongoDB {m.version} reaches End-of-Life {mongoStatus.label}</p>
            <p className="text-xs text-white/60 mt-0.5">Plan your upgrade to MongoDB 8.0 before this date to maintain security support.</p>
          </div>
        </div>
      )}
    </div>
  )
}

function StatBadge({ label, value, color, bg, border }) {
  return (
    <div className={`px-3 py-2 rounded-xl border ${bg} ${border} text-center`}>
      <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[10px] text-white/30 mt-0.5">{label}</div>
    </div>
  )
}

function VersionCard({ label, version, sub, subColor, extra, icon: Icon, accentColor, status }) {
  const StatusIcon = status?.icon
  return (
    <div className="rounded-xl border border-white/8 bg-surface p-4 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-8 pointer-events-none"
        style={{ background: `radial-gradient(circle, ${accentColor} 0%, transparent 70%)`, transform: 'translate(40%,-40%)' }} />
      <div className="flex items-center gap-2 mb-2">
        <Icon size={13} style={{ color: accentColor }} />
        <span className="text-[10px] text-white/40 uppercase tracking-wider font-medium">{label}</span>
      </div>
      <div className="text-lg font-bold font-mono text-white">{version}</div>
      <div className={`text-[11px] mt-0.5 ${subColor}`}>{sub}</div>
      {status && (
        <div className={`flex items-center gap-1 mt-2 text-[10px] font-medium px-2 py-1 rounded-lg border w-fit ${status.bg} ${status.color} ${status.border}`}>
          {StatusIcon && <StatusIcon size={10} />}
          {status.label}
        </div>
      )}
      {extra && <div className="text-[10px] text-white/25 font-mono mt-1">{extra}</div>}
    </div>
  )
}
