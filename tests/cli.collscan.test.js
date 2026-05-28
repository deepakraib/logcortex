import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadParsedLog } from '../src/cli/loadLog.js'

function writeSampleLog() {
  const dir = mkdtempSync(join(tmpdir(), 'logcortex-'))
  const file = join(dir, 'mongod.log')

  const userSlowFind = JSON.stringify({
    t: { $date: '2026-01-17T04:36:53.141Z' },
    s: 'I', c: 'COMMAND', id: 51803, ctx: 'conn1',
    msg: 'Slow query',
    attr: {
      type: 'command',
      ns: 'shop.orders',
      command: { find: 'orders', filter: { customer_id: 42 }, $db: 'shop' },
      planSummary: 'COLLSCAN',
      keysExamined: 0,
      docsExamined: 12000,
      nreturned: 1,
      durationMillis: 18420,
    },
  })

  const internalShardsCollscan = JSON.stringify({
    t: { $date: '2026-01-17T04:36:54.000Z' },
    s: 'I', c: 'COMMAND', id: 51803, ctx: 'conn2',
    msg: 'Slow query',
    attr: {
      type: 'command',
      ns: 'config.shards',
      command: { find: 'shards', $db: 'config' },
      planSummary: 'COLLSCAN',
      keysExamined: 0,
      docsExamined: 7,
      nreturned: 7,
      durationMillis: 515,
    },
  })

  const internalChunksCollscan = JSON.stringify({
    t: { $date: '2026-01-17T04:36:55.000Z' },
    s: 'I', c: 'COMMAND', id: 51803, ctx: 'conn3',
    msg: 'Slow query',
    attr: {
      type: 'command',
      ns: 'config.chunks',
      command: { aggregate: 'chunks', pipeline: [{ $match: {} }], $db: 'config' },
      planSummary: 'COLLSCAN',
      keysExamined: 0,
      docsExamined: 5000,
      nreturned: 1,
      durationMillis: 103,
    },
  })

  writeFileSync(file, [userSlowFind, internalShardsCollscan, internalChunksCollscan].join('\n') + '\n')
  return { dir, file }
}

describe('CLI COLLSCAN tracking', () => {
  it('reports both user and internal namespaces in allCollscans', async () => {
    const { dir, file } = writeSampleLog()
    try {
      const { logData } = await loadParsedLog(file, { slowThreshold: 100 })

      const allNs = Object.keys(logData.allCollscans || {})
      expect(allNs).toContain('shop.orders')
      expect(allNs).toContain('config.shards')
      expect(allNs).toContain('config.chunks')

      const actionable = Object.keys(logData.indexWarnings || {})
      expect(actionable).toContain('shop.orders')
      expect(actionable).not.toContain('config.shards')
      expect(actionable).not.toContain('config.chunks')

      expect(logData.allCollscans['config.shards'].internal).toBe(true)
      expect(logData.allCollscans['shop.orders'].internal).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('captures slow ops on internal namespaces too', async () => {
    const { dir, file } = writeSampleLog()
    try {
      const { logData } = await loadParsedLog(file, { slowThreshold: 100 })
      const namespaces = logData.slowOps.map((op) => op.ns)
      expect(namespaces).toContain('shop.orders')
      expect(namespaces).toContain('config.shards')
      expect(namespaces).toContain('config.chunks')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
