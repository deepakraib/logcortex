import { loadParsedLog } from '../loadLog.js'
import { formatTable, printJson } from '../format.js'

/** Bare `logcortex info file` = summary only (like mloginfo). Use flags for sections. */
function wantsSection(opts, flag) {
  return Boolean(opts[flag])
}

export async function runInfo(filePath, opts) {
  const { logData, mask } = await loadParsedLog(filePath, opts)
  if (opts.json) {
    const payload = { summary: buildSummary(logData, mask) }
    if (wantsSection(opts, 'queries') || opts.collectionscan) {
      payload.queries = buildQueries(logData, mask, opts)
    }
    if (opts.collectionscan) payload.collectionscan = buildCollscan(logData, mask)
    if (wantsSection(opts, 'slow')) payload.slowOps = buildSlowOps(logData, mask, opts.limit)
    if (wantsSection(opts, 'errors')) payload.errors = buildErrors(logData, mask, opts.limit)
    if (wantsSection(opts, 'audit')) payload.audit = logData.auditSummary
    printJson(payload)
    return
  }

  printSummaryText(logData, mask, opts.slowThreshold)

  if (wantsSection(opts, 'queries') || opts.collectionscan) {
    process.stdout.write('\n--- Query patterns (like mloginfo --queries) ---\n')
    process.stdout.write(formatQueriesTable(buildQueries(logData, mask, opts)) + '\n')
  }

  if (opts.collectionscan) {
    process.stdout.write('\n--- Collection scans (like mloginfo --queries --collectionscan) ---\n')
    const rows = buildCollscan(logData, mask)
    if (!rows.length) {
      process.stdout.write('(none)\n')
    } else {
      process.stdout.write(formatTable(
        ['namespace', 'collscan_count', 'kind', 'example_plan'],
        rows.map((r) => [r.namespace, r.count, r.internal ? 'internal' : 'user', r.examplePlan])
      ) + '\n')
      const internalCount = rows.filter((r) => r.internal).length
      if (internalCount) {
        process.stdout.write(
          `\nNote: ${internalCount} namespace(s) marked 'internal' (config.*, local.*, *.system.*). ` +
          'COLLSCAN is expected there and indexes are not recommended.\n'
        )
      }
    }
  }

  if (opts.slow) {
    process.stdout.write('\n--- Slow operations ---\n')
    process.stdout.write(formatSlowTable(buildSlowOps(logData, mask, opts.limit)) + '\n')
  }

  if (opts.errors) {
    process.stdout.write('\n--- Errors & warnings ---\n')
    process.stdout.write(formatErrorsTable(buildErrors(logData, mask, opts.limit)) + '\n')
  }

  if (opts.audit) {
    process.stdout.write('\n--- Security audit summary ---\n')
    const rows = (logData.auditSummary || []).map((a) => [a.type, a.sev, a.count])
    if (!rows.length) process.stdout.write('(none)\n')
    else process.stdout.write(formatTable(['event', 'severity', 'count'], rows) + '\n')
  }
}

function buildSummary(logData, mask) {
  const m = logData.metadata
  const collscanAll = logData.allCollscans || logData.indexWarnings || {}
  return {
    file: m.filename,
    mongodb: `${m.module || 'community'} ${m.version}`,
    storage: m.storage,
    host: mask(m.hostname),
    port: m.port,
    topology: m.topology,
    replSet: m.replSetName || null,
    role: m.currentRole,
    startTime: m.startTime,
    endTime: m.endTime,
    totalLines: m.totalLines,
    parsedLines: m.parsedLines,
    skippedLines: m.skippedLines,
    slowOps: logData.slowOps.length,
    errors: logData.errors.length,
    warnings: logData.warnings.length,
    collscanNamespaces: Object.keys(collscanAll).length,
    collscanNamespacesActionable: Object.keys(logData.indexWarnings || {}).length,
  }
}

function printSummaryText(logData, mask, slowThreshold = 100) {
  const m = logData.metadata
  const collscanAll = logData.allCollscans || logData.indexWarnings || {}
  const totalCollscanNs = Object.keys(collscanAll).length
  const actionableNs = Object.keys(logData.indexWarnings || {}).length
  const internalNs = totalCollscanNs - actionableNs
  const collscanLine = internalNs
    ? `COLLSCAN namespaces: ${totalCollscanNs} (${actionableNs} actionable, ${internalNs} internal)`
    : `COLLSCAN namespaces: ${totalCollscanNs}`
  const lines = [
    `LogCortex — ${m.filename}`,
    `MongoDB ${m.module || 'community'} v${m.version} | ${m.storage}`,
    `Host ${mask(m.hostname) || '?'}${m.port ? ':' + m.port : ''} | ${m.topology}${m.replSetName ? ' rs/' + m.replSetName : ''} | role ${m.currentRole || '?'}`,
    `Time range: ${m.startTime || '?'} → ${m.endTime || '?'}`,
    `Lines: ${m.totalLines.toLocaleString()} total | ${m.parsedLines.toLocaleString()} parsed | ${m.skippedLines} skipped`,
    `Slow ops (>${slowThreshold}ms): ${logData.slowOps.length} | Errors: ${logData.errors.length} | Warnings: ${logData.warnings.length}`,
    collscanLine,
  ]
  process.stdout.write(lines.join('\n') + '\n')
}

function buildQueries(logData, mask, opts) {
  let rows = logData.queryPatterns || []
  if (opts.collectionscan) {
    const collscanAll = logData.allCollscans || logData.indexWarnings || {}
    const collscanNs = new Set(Object.keys(collscanAll))
    rows = rows.filter((r) => collscanNs.has(r.ns))
  }
  return rows.slice(0, opts.limit ?? 50).map((r) => ({
    namespace: mask(r.ns),
    operation: r.op,
    pattern: r.pattern,
    count: r.count,
    minMs: r.min,
    maxMs: r.max,
    meanMs: r.mean,
    p95Ms: r.p95,
    sumMs: r.sum,
  }))
}

function buildCollscan(logData, mask) {
  const all = logData.allCollscans || logData.indexWarnings || {}
  return Object.entries(all)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([ns, v]) => ({
      namespace: mask(ns),
      count: v.count,
      examplePlan: v.examples?.[0]?.plan || 'COLLSCAN',
      internal: Boolean(v.internal),
    }))
}

function buildSlowOps(logData, mask, limit) {
  return logData.slowOps.slice(0, limit ?? 50).map((r) => ({
    time: r.ts?.slice(0, 19),
    namespace: mask(r.ns),
    operation: r.opType,
    durationMs: r.dur,
    plan: r.plan,
  }))
}

function buildErrors(logData, mask, limit) {
  return [...logData.errors, ...logData.warnings]
    .slice(0, limit ?? 50)
    .map((r) => ({
      time: r.ts?.slice(0, 19),
      severity: r.s,
      component: r.c,
      message: mask(r.msg || r.errMsg),
    }))
}

function formatQueriesTable(rows) {
  if (!rows.length) return '(no query patterns)'
  return formatTable(
    ['namespace', 'operation', 'pattern', 'count', 'min', 'max', 'mean', '95%-ile', 'sum'],
    rows.map((r) => [
      r.namespace,
      r.operation,
      r.pattern.length > 40 ? r.pattern.slice(0, 37) + '...' : r.pattern,
      r.count,
      r.minMs,
      r.maxMs,
      r.meanMs,
      r.p95Ms,
      r.sumMs,
    ])
  )
}

function formatSlowTable(rows) {
  if (!rows.length) return '(none)'
  return formatTable(
    ['time', 'namespace', 'operation', 'duration_ms', 'plan'],
    rows.map((r) => [r.time, r.namespace, r.operation, r.durationMs, r.plan || ''])
  )
}

function formatErrorsTable(rows) {
  if (!rows.length) return '(none)'
  return formatTable(
    ['time', 'sev', 'component', 'message'],
    rows.map((r) => [
      r.time,
      r.severity,
      r.component,
      r.message.length > 60 ? r.message.slice(0, 57) + '...' : r.message,
    ])
  )
}
