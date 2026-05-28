import React, { useState, useMemo } from 'react'
import { Search, ChevronDown, ChevronRight, Lightbulb, AlertCircle } from 'lucide-react'
import SortTh from '../ui/SortTh'
import { SEV_COLORS } from '../../utils/constants'
import { sortArr, mkSort } from '../../utils/queryUtils'
import CopyBtn from '../ui/CopyBtn'
import InlineMarkup from '../ui/InlineMarkup'

// ── Error fix knowledge base ──────────────────────────────────────────────────
const ERROR_FIXES = [
  {
    patterns: ['authentication failed', 'auth failed', 'sasl'],
    title: 'Authentication Failure',
    severity: 'Critical',
    causes: ['Wrong password', 'Incorrect authSource database', 'Wrong auth mechanism (SCRAM-SHA-1 vs SCRAM-SHA-256)'],
    fixes: [
      'Verify credentials: db.getSiblingDB("admin").auth("user","password")',
      'Check authSource matches the user\'s database: mongodb://user:pass@host/db?authSource=admin',
      'Confirm auth mechanism: mongosh --authenticationMechanism SCRAM-SHA-256',
    ],
    cmd: 'db.getSiblingDB("admin").getUsers()',
  },
  {
    patterns: ['not authorized', 'unauthorized', 'not allowed'],
    title: 'Authorization / Permission Denied',
    severity: 'Critical',
    causes: ['User lacks required role', 'Missing readWrite or dbAdmin role', 'Incorrect database scope'],
    fixes: [
      'Grant read/write: db.getSiblingDB("mydb").grantRolesToUser("user",[{role:"readWrite",db:"mydb"}])',
      'Check existing roles: db.getSiblingDB("admin").getUser("username")',
      'Grant cluster admin if needed: db.grantRolesToUser("user",[{role:"clusterAdmin",db:"admin"}])',
    ],
    cmd: 'db.getSiblingDB("admin").getUser("username")',
  },
  {
    patterns: ['writeconflict', 'write conflict', 'transaction'],
    title: 'Write Conflict (Transaction)',
    severity: 'High',
    causes: ['Two transactions modifying the same document simultaneously', 'Long-running transactions', 'Insufficient retry logic'],
    fixes: [
      'Add retry logic on WriteConflict error (error code 112)',
      'Reduce transaction scope — commit/abort faster',
      'Increase maxTransactionLockRequestTimeoutMillis (default: 5ms)',
    ],
    cmd: 'db.adminCommand({getParameter:1, maxTransactionLockRequestTimeoutMillis:1})',
  },
  {
    patterns: ['cursor id not found', 'cursor not found', 'cursor timed out'],
    title: 'Cursor Not Found / Timed Out',
    severity: 'Medium',
    causes: ['Cursor idled longer than cursorTimeoutMillis (default: 10 min)', 'Application not draining cursor fast enough'],
    fixes: [
      'Use noCursorTimeout for long-running cursors: db.collection.find().noCursorTimeout()',
      'Increase cursor timeout: db.adminCommand({setParameter:1, cursorTimeoutMillis: 1800000})',
      'Use smaller batch sizes and fetch sooner',
      'Consider using aggregation with $out instead of large cursors',
    ],
    cmd: 'db.adminCommand({getParameter:1, cursorTimeoutMillis:1})',
  },
  {
    patterns: ['operation exceeded time limit', 'maxtime', 'exceeded time'],
    title: 'Operation Exceeded Time Limit',
    severity: 'High',
    causes: ['Query maxTimeMS too low', 'Slow query without proper index', 'Server under load'],
    fixes: [
      'Add an index to avoid COLLSCAN (check Indexes tab)',
      'Increase maxTimeMS on specific queries if expected to be slow',
      'Use explain() to identify bottleneck: db.collection.explain("executionStats").find({...})',
    ],
    cmd: 'db.collection.explain("executionStats").find({/* your query */})',
  },
  {
    patterns: ['out of memory', 'exceeded memory limit', 'MemoryError'],
    title: 'Out of Memory / Memory Limit',
    severity: 'Critical',
    causes: ['Aggregation exceeding 100MB allowance', 'WiredTiger cache too small', 'Server RAM exhausted'],
    fixes: [
      'Enable disk use for aggregations: db.collection.aggregate([...], {allowDiskUse: true})',
      'Increase WiredTiger cache: mongod --wiredTigerCacheSizeGB 4',
      'Add index to reduce working set size',
      'Check server RAM usage: db.adminCommand({serverStatus:1}).mem',
    ],
    cmd: 'db.adminCommand({serverStatus:1}).mem',
  },
  {
    patterns: ['too many open files', 'ulimit', 'EMFILE'],
    title: 'Too Many Open Files',
    severity: 'High',
    causes: ['OS file descriptor limit too low', 'Too many concurrent connections', 'Connection leak in application'],
    fixes: [
      'Increase ulimit on Linux: ulimit -n 65536 (or edit /etc/security/limits.conf)',
      'Add to /etc/mongod.conf: processManagement.windowsService.serviceUser',
      'Check connection count: db.serverStatus().connections',
      'Implement connection pooling in your application',
    ],
    cmd: 'db.adminCommand({serverStatus:1}).connections',
  },
  {
    patterns: ['duplicate key', 'E11000', 'duplicate key error'],
    title: 'Duplicate Key Error',
    severity: 'Medium',
    causes: ['Inserting document with value already in a unique index', 'Race condition on upsert'],
    fixes: [
      'Use upsert instead of insert: db.collection.updateOne({key:val},{$set:{...}},{upsert:true})',
      'Handle E11000 in application and retry with update',
      'Check which index caused it: error message contains the index name',
    ],
    cmd: 'db.collection.getIndexes()',
  },
  {
    patterns: ['replication lag', 'oplog', 'secondary behind'],
    title: 'Replication Lag',
    severity: 'High',
    causes: ['Secondary can\'t keep up with primary write rate', 'Network latency between nodes', 'Heavy writes on primary'],
    fixes: [
      'Check lag: rs.printSecondaryReplicationInfo()',
      'Increase oplog size: mongod --oplogSize 10240 (10GB)',
      'Reduce write load on primary or add more secondaries',
      'Check network bandwidth between replica set members',
    ],
    cmd: 'rs.printSecondaryReplicationInfo()',
  },
  {
    patterns: ['connection refused', 'connection reset', 'ECONNREFUSED'],
    title: 'Connection Refused',
    severity: 'Critical',
    causes: ['mongod not running', 'Firewall blocking port 27017', 'Wrong host/port in connection string'],
    fixes: [
      'Check if mongod is running: systemctl status mongod',
      'Verify port is open: netstat -tlnp | grep 27017',
      'Check firewall: ufw allow 27017 (or security group for Atlas)',
      'Test connection: mongosh --host <host> --port 27017',
    ],
    cmd: 'db.adminCommand({ping:1})',
  },
  {
    patterns: ['document exceeds', 'document too large', 'BSONObjectTooLarge'],
    title: 'Document Too Large',
    severity: 'Medium',
    causes: ['Document exceeds 16MB BSON limit', 'Array growing unbounded with $push'],
    fixes: [
      'Refactor schema to use references instead of embedded arrays',
      'Use GridFS for large binary data: GridFSBucket',
      'Use $slice with $push to limit array growth: {$push:{arr:{$each:[val],$slice:-100}}}',
    ],
    cmd: 'db.collection.find().sort({_id:-1}).limit(5).forEach(d=>print(Object.bsonsize(d)))',
  },
  {
    patterns: ['index key too large', 'key too large'],
    title: 'Index Key Too Large',
    severity: 'Medium',
    causes: ['String field being indexed is longer than 1024 bytes (pre-4.2)', 'Large compound index keys'],
    fixes: [
      'MongoDB 4.2+: failIndexKeyTooLong is off by default — upgrade if possible',
      'Use text index for long string fields: db.collection.createIndex({field:"text"})',
      'Hash the field before indexing if exact match not needed',
    ],
    cmd: 'db.adminCommand({getParameter:1, failIndexKeyTooLong:1})',
  },
]

function findFix(msg, errMsg) {
  const combined = `${msg || ''} ${errMsg || ''}`.toLowerCase()
  return ERROR_FIXES.find(fix => fix.patterns.some(p => combined.includes(p)))
}

// Full label severity order (for auditSummary-style objects with .severity)
const SEV_LABEL_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 }
const SEV_ROW_ORDER = { F: 0, E: 1, W: 2, I: 3, D: 4 }

function normalizeIssueSignature(row) {
  return `${row.c || ''}|${row.msg || ''}|${row.errMsg || ''}`
    .toLowerCase()
    .replace(/\b[0-9a-f]{24}\b/g, '<oid>')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
}

export default function ErrorsTab({ logData, mask }) {
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState({ key: 'ts', dir: 'desc' })
  const [expandedRow, setExpandedRow] = useState(null)
  const [showFixes, setShowFixes] = useState(true)
  const [groupFilter, setGroupFilter] = useState('')

  const allRows = useMemo(() => {
    if (!logData) return []
    return [...logData.errors, ...logData.warnings]
  }, [logData])

  const recurringIssues = useMemo(() => {
    const groups = {}
    for (const row of allRows) {
      const sig = normalizeIssueSignature(row)
      if (!sig) continue
      if (!groups[sig]) {
        groups[sig] = {
          id: sig,
          count: 0,
          severity: row.s || 'W',
          component: row.c || 'unknown',
          sample: row.msg || row.errMsg || 'Unknown message',
          fix: findFix(row.msg, row.errMsg)?.title || null,
        }
      }
      groups[sig].count++
      if ((SEV_ROW_ORDER[row.s] ?? 9) < (SEV_ROW_ORDER[groups[sig].severity] ?? 9)) {
        groups[sig].severity = row.s
      }
    }
    return Object.values(groups)
      .sort((a, b) => b.count - a.count || (SEV_ROW_ORDER[a.severity] ?? 9) - (SEV_ROW_ORDER[b.severity] ?? 9))
      .slice(0, 8)
  }, [allRows])

  const rows = useMemo(() => {
    if (!allRows.length) return []
    const f = filter.toLowerCase()
    const filtered = allRows.filter((x) => {
      const sig = normalizeIssueSignature(x)
      if (groupFilter && sig !== groupFilter) return false
      return (
      !f ||
      x.msg?.toLowerCase().includes(f) ||
      x.c?.toLowerCase().includes(f) ||
      x.errMsg?.toLowerCase().includes(f) ||
      x.s?.toLowerCase().includes(f)
      )
    })
    return sortArr(filtered, sort)
  }, [allRows, filter, sort, groupFilter])

  // Unique fix suggestions based on detected errors
  const detectedFixes = useMemo(() => {
    if (!allRows.length) return []
    const seen = new Set()
    const fixes = []
    for (const row of allRows) {
      const fix = findFix(row.msg, row.errMsg)
      if (fix && !seen.has(fix.title)) {
        seen.add(fix.title)
        // Count occurrences
        const count = allRows.filter(r => fix.patterns.some(p => (`${r.msg || ''} ${r.errMsg || ''}`).toLowerCase().includes(p))).length
        fixes.push({ ...fix, count })
      }
    }
    return fixes.sort((a, b) => (SEV_LABEL_ORDER[a.severity] ?? 9) - (SEV_LABEL_ORDER[b.severity] ?? 9))
  }, [allRows])

  const SEV_FIX_COLORS = { Critical: 'text-danger border-danger/30 bg-danger/8', High: 'text-warning border-warning/30 bg-warning/8', Medium: 'text-caution border-caution/30 bg-caution/8', Low: 'text-white/50 border-white/10 bg-white/3' }

  return (
    <div className="space-y-3">
      {/* ── Recurring issue groups (quick drill-down) ── */}
      {recurringIssues.length > 0 && (
        <div className="rounded-xl border border-white/8 bg-surface p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <AlertCircle size={13} className="text-warning" />
              <span className="text-sm font-semibold text-white">Top Recurring Issues</span>
              <span className="text-[10px] text-white/40">click any card to filter table</span>
            </div>
            {groupFilter && (
              <button
                onClick={() => setGroupFilter('')}
                className="text-[10px] px-2 py-1 rounded border border-white/15 text-white/50 hover:text-white/70 hover:border-white/30 transition-colors"
              >
                Clear group filter
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {recurringIssues.map((issue) => (
              <button
                key={issue.id}
                onClick={() => setGroupFilter((v) => (v === issue.id ? '' : issue.id))}
                className={`text-left rounded-lg p-2.5 border transition-colors ${
                  groupFilter === issue.id
                    ? 'border-accent/40 bg-accent/10'
                    : 'border-white/10 hover:border-accent/20 hover:bg-white/3'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-white/40 font-mono">{issue.component}</span>
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono"
                    style={{ background: `${SEV_COLORS[issue.severity]}22`, color: SEV_COLORS[issue.severity] }}
                  >
                    {issue.severity}
                  </span>
                </div>
                <p className="text-[11px] text-white/75 line-clamp-2">
                  {mask(issue.sample)}
                </p>
                <div className="mt-1.5 text-[10px] text-white/35">
                  {issue.count} occurrence{issue.count > 1 ? 's' : ''}{issue.fix ? ` - ${issue.fix}` : ''}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Fix Suggestions Panel ── */}
      {detectedFixes.length > 0 && (
        <div className="rounded-xl border border-accent/15 bg-surface overflow-hidden">
          <button
            onClick={() => setShowFixes(s => !s)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/2 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Lightbulb size={14} className="text-accent" />
              <span className="text-sm font-semibold text-white">Fix Suggestions</span>
              <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full">{detectedFixes.length} issues detected</span>
            </div>
            {showFixes ? <ChevronDown size={14} className="text-white/30" /> : <ChevronRight size={14} className="text-white/30" />}
          </button>

          {showFixes && (
            <div className="px-4 pb-4 space-y-3">
              {detectedFixes.map((fix, fi) => (
                <div key={fi} className={`rounded-xl border p-4 ${SEV_FIX_COLORS[fix.severity]}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={13} />
                      <span className="text-sm font-semibold">{fix.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono opacity-60">{fix.count} occurrence{fix.count > 1 ? 's' : ''}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-current/30 bg-current/10">{fix.severity}</span>
                    </div>
                  </div>

                  {/* Causes */}
                  <div className="mb-2">
                    <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Likely Causes</p>
                    <ul className="space-y-0.5">
                      {fix.causes.map((c, i) => (
                        <li key={i} className="text-[11px] text-white/60 flex gap-1.5"><span className="opacity-40 flex-shrink-0">•</span>{c}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Fixes */}
                  <div className="mb-2">
                    <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">How to Fix</p>
                    <ul className="space-y-1">
                      {fix.fixes.map((f, i) => (
                        <li key={i} className="text-[11px] text-white/70 flex gap-1.5">
                          <span className="text-accent flex-shrink-0 font-bold">{i+1}.</span>
                          <span><InlineMarkup text={f} /></span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Diagnostic command */}
                  {fix.cmd && (
                    <div className="mt-2 bg-black/30 rounded-lg p-2 flex items-center justify-between gap-2">
                      <code className="text-[10px] font-mono text-green-300 flex-1 break-all">{fix.cmd}</code>
                      <CopyBtn text={fix.cmd} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Filter bar ── */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by message, component, errMsg, severity…"
            className="w-full bg-elevated border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
          />
        </div>
        <span className="text-xs text-white/30 whitespace-nowrap">{rows.length} rows</span>
        {groupFilter && (
          <span className="text-[10px] px-2 py-1 rounded border border-accent/20 bg-accent/10 text-accent/80">
            grouped view
          </span>
        )}
      </div>

      {/* ── Errors table ── */}
      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full text-xs">
          <thead className="bg-elevated/50">
            <tr>
              {[['ts','Time'],['s','Severity'],['c','Component'],['msg','Message']].map(([col, label]) => (
                <SortTh key={col} col={col} label={label} sortCfg={sort} onSort={mkSort(setSort)} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const rowKey = `${row.ts}|${row.s}|${row.c}|${i}`
              const fix = findFix(row.msg, row.errMsg)
              return (
                <React.Fragment key={rowKey}>
                  <tr
                    className={`border-t border-white/5 hover:bg-white/2 ${fix ? 'cursor-pointer' : ''}`}
                    onClick={() => fix && setExpandedRow(expandedRow === rowKey ? null : rowKey)}
                  >
                    <td className="px-3 py-2 font-mono text-white/40 whitespace-nowrap">{row.ts?.slice(11, 23) || '—'}</td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold"
                        style={{ background: `${SEV_COLORS[row.s]}22`, color: SEV_COLORS[row.s] }}>
                        {row.s}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-white/50">{row.c || '—'}</td>
                    <td className="px-3 py-2 text-white/70 max-w-sm truncate">
                      <span title={`${row.msg}${row.errMsg ? ' — ' + row.errMsg : ''}`}>
                        {mask(row.msg)}
                        {row.errMsg ? <span className="text-danger/70"> — {mask(row.errMsg)}</span> : ''}
                      </span>
                      {fix && (
                        <span className="ml-2 text-[9px] bg-accent/15 text-accent px-1.5 py-0.5 rounded-full border border-accent/20">
                          fix available ▾
                        </span>
                      )}
                    </td>
                  </tr>
                  {expandedRow === rowKey && fix && (
                    <tr key={`${rowKey}-fix`} className="bg-black/30">
                      <td colSpan={4} className="px-4 py-3">
                        <div className="text-[10px] text-accent uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                          <Lightbulb size={11} />Fix: {fix.title}
                        </div>
                        <ul className="space-y-1 mb-2">
                          {fix.fixes.map((f, fi) => (
                            <li key={fi} className="text-[11px] text-white/60 flex gap-1.5">
                              <span className="text-accent">{fi+1}.</span>
                              <span><InlineMarkup text={f} /></span>
                            </li>
                          ))}
                        </ul>
                        {fix.cmd && (
                          <div className="flex items-center gap-2 bg-black/40 rounded px-2 py-1.5 w-fit">
                            <code className="text-[10px] font-mono text-green-300">{fix.cmd}</code>
                            <CopyBtn text={fix.cmd} />
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-white/30 text-xs">No errors or warnings found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
