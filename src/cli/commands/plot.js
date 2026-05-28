import { loadParsedLog } from '../loadLog.js'
import { formatTable, printJson } from '../format.js'

/**
 * mplotqueries-style text output (range buckets by time gap).
 * Full charts remain in the web UI.
 */
export async function runPlot(filePath, opts) {
  const { logData, mask } = await loadParsedLog(filePath, opts)
  const gapSec = Math.max(60, Number(opts.gap) || 600)
  const gapMs = gapSec * 1000

  const points = logData.slowOps
    .filter((op) => op.ts && op.dur != null)
    .map((op) => ({
      ts: new Date(op.ts).getTime(),
      dur: op.dur,
      ns: mask(op.ns),
      op: op.opType,
      plan: op.plan,
    }))
    .sort((a, b) => a.ts - b.ts)

  if (opts.type === 'scatter' || opts.json) {
    const payload = {
      type: opts.type,
      group: opts.group,
      gapSeconds: gapSec,
      points: points.slice(0, opts.limit ?? 500),
    }
    if (opts.json) {
      printJson(payload)
      return
    }
  }

  const buckets = bucketByGap(points, gapMs, opts.group)
  process.stdout.write(`LogCortex plot — ${opts.type} (gap ${gapSec}s, group by ${opts.group})\n`)
  process.stdout.write(`Slow ops plotted: ${points.length}\n\n`)

  if (opts.type === 'range') {
    const rows = buckets.map((b) => [
      b.label,
      b.count,
      b.maxDur,
      b.avgDur,
      b.topGroup,
    ])
    process.stdout.write(formatTable(
      ['time_bucket', 'count', 'max_ms', 'avg_ms', `top_${opts.group}`],
      rows.slice(0, opts.limit ?? 50)
    ) + '\n')
    return
  }

  // scatter summary: top outliers
  const outliers = [...points].sort((a, b) => b.dur - a.dur).slice(0, opts.limit ?? 30)
  process.stdout.write(formatTable(
    ['time', 'duration_ms', 'namespace', 'operation', 'plan'],
    outliers.map((p) => [
      new Date(p.ts).toISOString().slice(0, 19),
      p.dur,
      p.ns,
      p.op,
      p.plan || '',
    ])
  ) + '\n')
}

function bucketByGap(points, gapMs, groupBy) {
  if (!points.length) return []

  const buckets = []
  let start = points[0].ts
  let current = {
    start,
    end: start + gapMs,
    count: 0,
    totalDur: 0,
    maxDur: 0,
    groups: {},
  }

  for (const p of points) {
    if (p.ts >= current.end) {
      buckets.push(finalizeBucket(current, groupBy))
      start = p.ts
      current = { start, end: start + gapMs, count: 0, totalDur: 0, maxDur: 0, groups: {} }
    }
    current.count++
    current.totalDur += p.dur
    current.maxDur = Math.max(current.maxDur, p.dur)
    const key = groupBy === 'namespace' ? p.ns : p.op
    current.groups[key] = (current.groups[key] || 0) + 1
  }
  buckets.push(finalizeBucket(current, groupBy))
  return buckets
}

function finalizeBucket(bucket, groupBy) {
  const top = Object.entries(bucket.groups).sort((a, b) => b[1] - a[1])[0]
  const label = `${new Date(bucket.start).toISOString().slice(11, 19)}–${new Date(bucket.end).toISOString().slice(11, 19)}`
  return {
    label,
    count: bucket.count,
    maxDur: bucket.maxDur,
    avgDur: bucket.count ? Math.round(bucket.totalDur / bucket.count) : 0,
    topGroup: top ? `${top[0]} (${top[1]})` : '-',
    groupBy,
  }
}
