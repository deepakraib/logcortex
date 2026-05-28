import { Server, Database, GitBranch, Clock, Layers } from 'lucide-react'

const ROLE_COLORS = {
  PRIMARY:   { bg: 'bg-success/15', text: 'text-success', border: 'border-success/30' },
  SECONDARY: { bg: 'bg-accent/15',  text: 'text-accent',  border: 'border-accent/30' },
  ARBITER:   { bg: 'bg-warning/15', text: 'text-warning', border: 'border-warning/30' },
  RECOVERING:{ bg: 'bg-danger/15',  text: 'text-danger',  border: 'border-danger/30' },
}

const TOPO_LABELS = {
  standalone:  { label: 'Standalone',    color: 'text-white/50' },
  replicaset:  { label: 'Replica Set',   color: 'text-accent' },
  sharded:     { label: 'Sharded',       color: 'text-warning' },
}

function fmtDuration(ms) {
  if (!ms || ms < 0) return null
  if (ms >= 86400000) return `${Math.floor(ms / 86400000)}d ${Math.floor((ms % 86400000) / 3600000)}h`
  if (ms >= 3600000)  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`
  if (ms >= 60000)    return `${Math.floor(ms / 60000)}m`
  return `${Math.floor(ms / 1000)}s`
}

function getDisplayHost(metadata) {
  if (metadata.hostname) return metadata.hostname
  const memberHost = metadata.rsMembers?.[0]?.host
  if (!memberHost) return ''
  return String(memberHost).replace(/:\d+$/, '')
}

function Pill({ label, value, valueClass = 'text-white/80', icon: Icon }) {
  if (!value) return null
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 rounded-lg border border-white/5">
      {Icon && <Icon size={11} className="text-white/30 flex-shrink-0" />}
      <span className="text-[10px] text-white/30 whitespace-nowrap">{label}</span>
      <span className={`text-[11px] font-mono font-medium whitespace-nowrap ${valueClass}`}>{value}</span>
    </div>
  )
}

export default function ServerInfoBar({ logData, mask }) {
  if (!logData) return null
  const m = logData.metadata
  const displayHost = getDisplayHost(m)

  const uptime = m.startTime && m.endTime
    ? fmtDuration(new Date(m.endTime) - new Date(m.startTime))
    : null

  const role = m.currentRole
  const roleStyle = ROLE_COLORS[role] || {}
  const topo = TOPO_LABELS[m.topology] || TOPO_LABELS.standalone

  // Build member list display
  const hasRsMembers = m.rsMembers?.length > 0

  return (
    <div className="flex-shrink-0 border-b border-white/5 bg-black/20 px-4 py-2 overflow-x-auto">
      <div className="flex items-center gap-2 flex-nowrap min-w-0">

        {/* Topology + RS name */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Layers size={11} className="text-white/30" />
          <span className={`text-[11px] font-medium ${topo.color}`}>{topo.label}</span>
          {m.replSetName && (
            <span className="text-[11px] font-mono text-white/50">/ {m.replSetName}</span>
          )}
        </div>

        <span className="text-white/10 flex-shrink-0">·</span>

        {/* Current role */}
        {role && (
          <>
            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border flex-shrink-0 ${roleStyle.bg} ${roleStyle.text} ${roleStyle.border}`}>
              {role}
            </span>
            <span className="text-white/10 flex-shrink-0">·</span>
          </>
        )}

        {/* Hostname + port */}
        <Pill icon={Server} label="host" value={displayHost ? `${mask(displayHost)}${m.port ? `:${m.port}` : ''}` : m.port ? `:${m.port}` : null} valueClass="text-accent" />
        <Pill label="bind" value={m.bindIp ? mask(m.bindIp) : null} valueClass="text-white/60" />
        <Pill label="socket" value={m.unixSocket ? mask(m.unixSocket) : null} valueClass="text-white/40" />

        {/* PID */}
        <Pill label="pid" value={m.pid} />

        {/* MongoDB version + edition */}
        <Pill icon={Database}
          label="mongod"
          value={m.version !== 'unknown' ? `v${m.version}${m.module === 'enterprise' ? ' EE' : m.module === 'psmdb' ? ' PSMDB' : ''}` : null}
          valueClass={m.module === 'enterprise' ? 'text-warning' : m.module === 'psmdb' ? 'text-blue-400' : 'text-white/80'}
        />

        {/* Storage engine */}
        <Pill label="storage" value={m.storage !== 'unknown' ? m.storage : null} valueClass="text-white/60" />

        {/* Uptime */}
        {uptime && <Pill icon={Clock} label="log duration" value={uptime} valueClass="text-white/60" />}

        {/* dbPath — masked when PII enabled */}
        {m.dbPath && <Pill icon={Database} label="dbPath" value={mask(m.dbPath)} valueClass="text-white/40" />}

        {/* Git version short */}
        {m.gitVersion && <Pill icon={GitBranch} label="git" value={m.gitVersion} valueClass="text-white/30" />}

        {/* RS members */}
        {hasRsMembers && (
          <>
            <span className="text-white/10 flex-shrink-0">·</span>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-[10px] text-white/30">members:</span>
              {m.rsMembers.map((mbr, i) => (
                <span key={i}
                  className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/5 border border-white/10 text-white/50"
                  title={`id:${mbr.id} priority:${mbr.priority}${mbr.hidden ? ' hidden' : ''}${mbr.arbiter ? ' arbiter' : ''}`}>
                  {mask(mbr.host)}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
