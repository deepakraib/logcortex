import { sortArr } from './queryUtils.js'

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

export function statsConnectionsText(logData) {
  const cs = logData.connectionStats
  return [
    `total opened:      ${cs.open}`,
    `total closed:      ${cs.close}`,
    `unique IPs:        ${cs.uniqueIPs}`,
    `max concurrent:    ${cs.peak}`,
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
