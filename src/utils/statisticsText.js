import { sortArr } from './queryUtils.js'

export const DEFAULT_SHORT_CONNECTION_THRESHOLD_MS = 3000

export function statsOverviewText(logData, mask) {
  const m = logData.metadata
  return [
    `source:      ${m.filename}`,
    `host:        ${mask(m.filename.replace(/\.log.*/, ''))}`,
    `start:       ${m.startTime || 'N/A'}`,
    `end:         ${m.endTime || 'N/A'}`,
    `date format: iso8601-utc`,
    `length:      ${m.totalLines.toLocaleString()} lines`,
    `parsed:      ${m.parsedLines.toLocaleString()} lines`,
    `skipped:     ${m.skippedLines} lines`,
    `binary:      mongod`,
    `version:     ${m.version}`,
    `storage:     ${m.storage}`,
  ].join('\n')
}

export function statsQueriesText(logData, mask, qpSort) {
  const header = `${'namespace'.padEnd(35)} ${'op'.padEnd(10)} ${'pattern'.padEnd(30)} ${'count'.padStart(7)} ${'min'.padStart(8)} ${'max'.padStart(8)} ${'mean'.padStart(8)} ${'95%ile'.padStart(8)} ${'sum'.padStart(10)}`
  const sep = '-'.repeat(header.length)
  const rows = sortArr(logData.queryPatterns, qpSort).map((r) =>
    `${mask(r.ns).padEnd(35)} ${r.op.padEnd(10)} ${r.pattern.slice(0, 30).padEnd(30)} ${String(r.count).padStart(7)} ${String(r.min).padStart(8)} ${String(r.max).padStart(8)} ${String(r.mean).padStart(8)} ${String(r.p95).padStart(8)} ${String(r.sum).padStart(10)}`
  )
  return [header, sep, ...rows].join('\n')
}

const CONNECTION_USER_WIDTH = 35
const CONNECTION_HOST_WIDTH = 30

function formatDuration(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return 'n/a'
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) {
    const seconds = ms / 1000
    return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s`
  }
  if (ms < 60 * 60_000) return `${(ms / 60_000).toFixed(1)} min`
  return `${(ms / (60 * 60_000)).toFixed(1)} h`
}

function maskCell(mask, value, width) {
  const text = mask(String(value || ''))
  return text.slice(0, width).padEnd(width)
}

function connectionRowsByShortCount(rows, thresholdMs) {
  return rows
    .map((row) => ({
      ...row,
      shortCount: row.durations.filter((duration) => duration < thresholdMs).length,
    }))
    .filter((row) => row.shortCount > 0)
    .sort((a, b) => b.shortCount - a.shortCount || b.conns - a.conns || (a.user || '').localeCompare(b.user || '') || a.host.localeCompare(b.host))
}

function userHostTable(rows, mask) {
  if (!rows.length) return ['(no authenticated connection details detected)']

  const header = `${'user'.padEnd(CONNECTION_USER_WIDTH)} ${'host'.padEnd(CONNECTION_HOST_WIDTH)} ${'conns'.padStart(7)} ${'closed'.padStart(7)} ${'avg'.padStart(10)} ${'p95'.padStart(10)}`
  const sep = '-'.repeat(header.length)
  const body = rows.map((row) =>
    `${maskCell(mask, row.user, CONNECTION_USER_WIDTH)} ${maskCell(mask, row.host, CONNECTION_HOST_WIDTH)} ${String(row.conns).padStart(7)} ${String(row.closed).padStart(7)} ${formatDuration(row.avgMs).padStart(10)} ${formatDuration(row.p95Ms).padStart(10)}`
  )
  return [header, sep, ...body]
}

function hostTable(rows, mask) {
  if (!rows.length) return ['(no connection host details detected)']

  const header = `${'host'.padEnd(CONNECTION_HOST_WIDTH)} ${'conns'.padStart(7)} ${'closed'.padStart(7)} ${'avg'.padStart(10)} ${'p95'.padStart(10)}`
  const sep = '-'.repeat(header.length)
  const body = rows.map((row) =>
    `${maskCell(mask, row.host, CONNECTION_HOST_WIDTH)} ${String(row.conns).padStart(7)} ${String(row.closed).padStart(7)} ${formatDuration(row.avgMs).padStart(10)} ${formatDuration(row.p95Ms).padStart(10)}`
  )
  return [header, sep, ...body]
}

function shortUserHostTable(rows, thresholdMs, mask) {
  const shortRows = connectionRowsByShortCount(rows, thresholdMs)
  if (!shortRows.length) return [`(no closed connections shorter than ${thresholdMs} ms)`]

  const shortLabel = `<${thresholdMs}ms`
  const shortWidth = Math.max(7, shortLabel.length)
  const header = `${'user'.padEnd(CONNECTION_USER_WIDTH)} ${'host'.padEnd(CONNECTION_HOST_WIDTH)} ${shortLabel.padStart(shortWidth)} ${'closed'.padStart(7)} ${'avg'.padStart(10)}`
  const sep = '-'.repeat(header.length)
  const body = shortRows.map((row) =>
    `${maskCell(mask, row.user, CONNECTION_USER_WIDTH)} ${maskCell(mask, row.host, CONNECTION_HOST_WIDTH)} ${String(row.shortCount).padStart(shortWidth)} ${String(row.closed).padStart(7)} ${formatDuration(row.avgMs).padStart(10)}`
  )
  return [header, sep, ...body]
}

function shortHostTable(rows, thresholdMs, mask) {
  const shortRows = connectionRowsByShortCount(rows, thresholdMs)
  if (!shortRows.length) return [`(no closed connections shorter than ${thresholdMs} ms)`]

  const shortLabel = `<${thresholdMs}ms`
  const shortWidth = Math.max(7, shortLabel.length)
  const header = `${'host'.padEnd(CONNECTION_HOST_WIDTH)} ${shortLabel.padStart(shortWidth)} ${'closed'.padStart(7)} ${'avg'.padStart(10)}`
  const sep = '-'.repeat(header.length)
  const body = shortRows.map((row) =>
    `${maskCell(mask, row.host, CONNECTION_HOST_WIDTH)} ${String(row.shortCount).padStart(shortWidth)} ${String(row.closed).padStart(7)} ${formatDuration(row.avgMs).padStart(10)}`
  )
  return [header, sep, ...body]
}

function hourlyConnectionTable(rows) {
  if (!rows.length) return ['(no hourly connection events detected)']

  const header = `${'TS'.padEnd(19)} ${'accepted'.padStart(10)} ${'closed'.padStart(10)} ${'active_peak'.padStart(12)} ${'errors'.padStart(8)}`
  const sep = '-'.repeat(header.length)
  const body = rows.map((row) =>
    `${row.ts.padEnd(19)} ${String(row.accepted).padStart(10)} ${String(row.closed).padStart(10)} ${String(row.activePeak).padStart(12)} ${String(row.errors).padStart(8)}`
  )
  return [header, sep, ...body]
}

function normalizeShortThreshold(thresholdMs) {
  const parsed = Number(thresholdMs)
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_SHORT_CONNECTION_THRESHOLD_MS
  return Math.floor(parsed)
}

export function statsConnectionsText(logData, mask = (value) => value, shortThresholdMs = DEFAULT_SHORT_CONNECTION_THRESHOLD_MS) {
  const churn = logData.connectionChurn || {
    stats: logData.connectionStats,
    hasDbUsers: false,
    summary: { trackedConnections: 0, authenticated: 0, withoutUsername: 0, closedWithDuration: 0 },
    byUserHost: [],
    byHost: [],
  }
  const cs = churn.stats || logData.connectionStats
  const thresholdMs = normalizeShortThreshold(shortThresholdMs)
  const rows = churn.hasDbUsers ? churn.byUserHost : churn.byHost
  const scope = churn.hasDbUsers ? 'user and host' : 'host'

  return [
    `total opened:      ${cs.open}`,
    `total closed:      ${cs.close}`,
    `unique IPs:        ${cs.uniqueIPs}`,
    `max concurrent:    ${cs.peak}`,
    '',
    `user/host connections: ${churn.summary.trackedConnections}`,
    `authenticated:         ${churn.summary.authenticated}`,
    `without username:      ${churn.summary.withoutUsername}`,
    `closed with duration:  ${churn.summary.closedWithDuration}`,
    '',
    'Connection timeline by hour:',
    ...hourlyConnectionTable(logData.connHourlyTimeline || []),
    '',
    `Connections by ${scope}:`,
    ...(churn.hasDbUsers ? userHostTable(rows, mask) : hostTable(rows, mask)),
    '',
    `Short-lived connections by ${scope} (<${thresholdMs} ms):`,
    ...(churn.hasDbUsers ? shortUserHostTable(rows, thresholdMs, mask) : shortHostTable(rows, thresholdMs, mask)),
  ].join('\n')
}

export function statsRestartsText(logData) {
  if (!logData.restartEvents.length) return '(no restart events detected)'
  const header = `${'datetime'.padEnd(28)} ${'version'.padEnd(12)} platform`
  const sep = '-'.repeat(70)
  const rows = logData.restartEvents.map(
    (r) => `${r.ts.padEnd(28)} ${r.version.padEnd(12)} ${r.platform.slice(0, 30)}`
  )
  return [header, sep, ...rows].join('\n')
}

export function statsRsText(logData) {
  if (!logData.rsStateChanges.length) return '(no replica set state changes detected)'
  const header = `${'datetime'.padEnd(28)} ${'state_before'.padEnd(16)} state_after`
  const sep = '-'.repeat(70)
  const rows = logData.rsStateChanges.map(
    (r) => `${r.ts.padEnd(28)} ${(r.stateBefore || '?').padEnd(16)} ${r.stateAfter || '?'}`
  )
  return [header, sep, ...rows].join('\n')
}

export function statsDistinctText(logData, mask) {
  const header = `${'count'.padStart(7)}  ${'level'.padEnd(7)} ${'component'.padEnd(12)} message`
  const sep = '-'.repeat(80)
  const rows = logData.distinctMessages.map(
    (r) =>
      `${String(r.count).padStart(7)}  ${(r.s || '?').padEnd(7)} ${(r.c || '?').padEnd(12)} ${mask(r.msg).slice(0, 50)}`
  )
  return [header, sep, ...rows].join('\n')
}

export function statsStorageText(logData) {
  const s = logData.storageStats
  const fmt = (b) =>
    b > 1e9 ? `${(b / 1e9).toFixed(2)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(2)} MB` : `${b} B`
  const ckptAvg = s.ckptDurations.length
    ? Math.round(s.ckptDurations.reduce((a, b) => a + b, 0) / s.ckptDurations.length)
    : 0
  const ckptMax = s.ckptDurations.length ? Math.max(...s.ckptDurations) : 0
  return [
    'WiredTiger Cache:',
    `  bytes currently in cache:    ${fmt(s.cacheBytes)}`,
    `  maximum bytes configured:    ${fmt(s.maxBytes)}`,
    `  tracked dirty bytes:         ${fmt(s.dirtyBytes)}`,
    `  pages read into cache:       ${s.pagesRead.toLocaleString()}`,
    `  pages written from cache:    ${s.pagesWritten.toLocaleString()}`,
    '',
    'Eviction Stats:',
    `  pages evicted by app threads: ${s.evictedApp.toLocaleString()}`,
    `  total pages selected:         ${s.evictedTotal.toLocaleString()}`,
    '',
    'Checkpoint Stats:',
    `  count:           ${s.ckptCount}`,
    `  avg duration:    ${ckptAvg} ms`,
    `  max duration:    ${ckptMax} ms`,
  ].join('\n')
}
