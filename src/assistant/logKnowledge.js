/**
 * Catalog of everything LogCortex extracts from a MongoDB JSON log.
 * Used by the Ask Log assistant and for structured context export.
 */

/** @typedef {{ id: string, label: string, description: string, fields: string[], uiTab?: string }} LogDataCategory */

/** Static catalog — what MongoDB logs can contain and what we parse into logData. */
export const LOG_DATA_CATALOG = [
  {
    id: 'metadata',
    label: 'Server & file metadata',
    description: 'Identity and environment detected from startup lines, build info, and replica-set heartbeats.',
    fields: [
      'filename', 'totalLines', 'parsedLines', 'skippedLines', 'opsCount',
      'startTime', 'endTime', 'version', 'storage', 'module', 'arch', 'os',
      'provider', 'region', 'hostname', 'bindIp', 'unixSocket', 'port', 'pid',
      'dbPath', 'gitVersion', 'openssl', 'allocator', 'replSetName', 'topology',
      'currentRole', 'rsMembers',
    ],
    uiTab: 'insights',
  },
  {
    id: 'slowOps',
    label: 'Slow operations',
    description: 'COMMAND/QUERY/WRITE operations slower than the threshold (default 100ms). Includes duration, namespace, plan, docs/keys examined, command shape, appName.',
    fields: ['ts', 'ns', 'opType', 'dur', 'plan', 'docsEx', 'keysEx', 'cmd', 'appName', 'reslen'],
    uiTab: 'slowOps',
  },
  {
    id: 'queryPatterns',
    label: 'Query patterns',
    description: 'Aggregated slow-query shapes per namespace + operation with count, min, max, mean, p95, sum of duration.',
    fields: ['ns', 'op', 'pattern', 'count', 'min', 'max', 'mean', 'p95', 'sum'],
    uiTab: 'slowOps',
  },
  {
    id: 'indexWarnings',
    label: 'Actionable COLLSCAN (index candidates)',
    description: 'Namespaces with COLLSCAN on user databases where an index may help. Excludes config.*, local.*, system collections.',
    fields: ['namespace', 'count', 'examples (ts, cmd, dur, plan)'],
    uiTab: 'indexes',
  },
  {
    id: 'allCollscans',
    label: 'All COLLSCAN namespaces',
    description: 'Every namespace with COLLSCAN including internal (config, local) with an internal flag.',
    fields: ['namespace', 'count', 'internal', 'examples'],
    uiTab: 'indexes',
  },
  {
    id: 'errors',
    label: 'Errors',
    description: 'Log lines with severity E or F, grouped with component, message, error code/name when present.',
    fields: ['ts', 's', 'c', 'msg', 'errMsg', 'errCode', 'errName'],
    uiTab: 'errors',
  },
  {
    id: 'warnings',
    label: 'Warnings',
    description: 'Log lines with severity W.',
    fields: ['ts', 's', 'c', 'msg'],
    uiTab: 'errors',
  },
  {
    id: 'audit',
    label: 'Security audit events',
    description: 'Authentication failures, shutdown signals, TLS/SSL events, unauthorized access patterns.',
    fields: ['ts', 'type', 'sev', 'user', 'msg', 'auditSummary by type'],
    uiTab: 'audit',
  },
  {
    id: 'appNames',
    label: 'Application / driver breakdown',
    description: 'appName from slow ops and commands — which clients hit the server.',
    fields: ['name', 'count', 'slowCount', 'errors', 'avgMs', 'p95Ms'],
    uiTab: 'appnames',
  },
  {
    id: 'drivers',
    label: 'Driver versions',
    description: 'Client driver name/version seen in connection metadata.',
    fields: ['name', 'version', 'ips'],
    uiTab: 'insights',
  },
  {
    id: 'connections',
    label: 'Connections',
    description: 'Connection open/close events, peak connections, per-IP accept counts, long-lived sessions.',
    fields: ['connectionStats', 'connTimeline', 'ipStats', 'longConns'],
    uiTab: 'insights',
  },
  {
    id: 'namespaces',
    label: 'Namespace statistics',
    description: 'Top namespaces by operation count and average duration.',
    fields: ['topNamespaces', 'topSlowNs'],
    uiTab: 'statistics',
  },
  {
    id: 'operations',
    label: 'Operation types',
    description: 'Distribution of command, query, getmore, insert, update, delete, etc.',
    fields: ['operationTypes'],
    uiTab: 'statistics',
  },
  {
    id: 'timeline',
    label: 'Time series',
    description: 'Operations bucketed over time for charts.',
    fields: ['timelineData'],
    uiTab: 'statistics',
  },
  {
    id: 'severity',
    label: 'Severity distribution',
    description: 'Counts of I / W / E / F lines.',
    fields: ['severityDist'],
    uiTab: 'statistics',
  },
  {
    id: 'reslen',
    label: 'Large result sets',
    description: 'Operations returning more than 16MB (reslen) — risk of memory/network issues.',
    fields: ['topReslen: ts, ns, op, reslen, dur, plan, appName'],
    uiTab: 'reslen',
  },
  {
    id: 'restarts',
    label: 'Restarts & RS state',
    description: 'mongod startup/restart lines and replica set role changes.',
    fields: ['restartEvents', 'rsStateChanges'],
    uiTab: 'insights',
  },
  {
    id: 'storage',
    label: 'Storage engine stats',
    description: 'WiredTiger cache, data size, tickets when logged.',
    fields: ['storageStats'],
    uiTab: 'insights',
  },
  {
    id: 'rawLines',
    label: 'Raw parsed lines',
    description: 'Sample of all parsed JSON log rows for search/filter (capped).',
    fields: ['ts', 's', 'c', 'msg', 'ns', 'dur'],
    uiTab: 'search',
  },
  {
    id: 'messages',
    label: 'Distinct messages',
    description: 'Unique message templates and counts.',
    fields: ['distinctMessages'],
    uiTab: 'search',
  },
]

/**
 * Compact JSON context for assistants (masked). Safe to copy externally.
 * @param {object} logData
 * @param {(s: string) => string} mask
 */
export function buildAssistantContext(logData, mask = (s) => s) {
  if (!logData) return null
  const m = logData.metadata
  const collscanAll = Object.entries(logData.allCollscans || {})
  const collscanActionable = Object.entries(logData.indexWarnings || {})

  return {
    file: mask(m.filename),
    timeRange: { start: m.startTime, end: m.endTime },
    server: {
      version: m.version,
      edition: m.module,
      storage: m.storage,
      topology: m.topology,
      replSet: m.replSetName,
      role: m.currentRole,
      host: mask(m.hostname),
      port: m.port,
      arch: m.arch,
      os: m.os,
      provider: m.provider,
      region: m.region,
    },
    counts: {
      totalLines: m.totalLines,
      parsedLines: m.parsedLines,
      skippedLines: m.skippedLines,
      dbOperations: m.opsCount,
      slowOps: logData.slowOps?.length ?? 0,
      errors: logData.errors?.length ?? 0,
      warnings: logData.warnings?.length ?? 0,
      collscanNamespaces: collscanAll.length,
      actionableCollscanNamespaces: collscanActionable.length,
      auditEvents: logData.auditEvents?.length ?? 0,
    },
    slowest: (logData.slowOps || []).slice(0, 5).map((r) => ({
      ts: r.ts,
      ns: mask(r.ns),
      op: r.opType,
      durMs: r.dur,
      plan: r.plan,
      docsEx: r.docsEx,
      keysEx: r.keysEx,
    })),
    topQueryPatterns: (logData.queryPatterns || []).slice(0, 10).map((q) => ({
      ns: mask(q.ns),
      op: q.op,
      pattern: q.pattern,
      count: q.count,
      meanMs: q.mean,
      p95Ms: q.p95,
    })),
    collscans: collscanAll.slice(0, 15).map(([ns, v]) => ({
      ns: mask(ns),
      count: v.count,
      internal: v.internal,
    })),
    topNamespaces: (logData.topNamespaces || []).slice(0, 10).map((n) => ({
      ns: mask(n.ns),
      count: n.count,
      avgMs: n.avgMs,
    })),
    topApps: (logData.appNames || []).slice(0, 10).map((a) => ({
      name: mask(a.name),
      count: a.count,
      slowCount: a.slowCount,
      errors: a.errors,
    })),
    auditSummary: (logData.auditSummary || []).slice(0, 10).map((a) => ({
      type: a.type,
      severity: a.sev,
      count: a.count,
    })),
    topErrors: [...(logData.errors || [])].slice(0, 5).map((e) => ({
      ts: e.ts,
      component: e.c,
      msg: mask(e.msg),
      errMsg: e.errMsg ? mask(e.errMsg) : undefined,
    })),
  }
}

/** Human-readable inventory for the Knowledge panel. */
export function formatKnowledgeInventory() {
  return LOG_DATA_CATALOG.map(
    (c) => `**${c.label}** — ${c.description}\nFields: ${c.fields.join(', ')}${c.uiTab ? ` (see ${c.uiTab} tab)` : ''}`
  ).join('\n\n')
}
