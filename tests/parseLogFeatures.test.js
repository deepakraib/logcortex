import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadParsedLog } from '../src/cli/loadLog.js'
import { statsOverviewText } from '../src/utils/statisticsText.js'
import { generateCreateIndexCmd } from '../src/utils/indexSuggestion.js'

function writeFeatureLog() {
  const dir = mkdtempSync(join(tmpdir(), 'logcortex-'))
  const file = join(dir, 'feature-test.log')

  const lines = [
    {
      t: { $date: '2026-02-01T08:00:00.000Z' },
      s: 'I', c: 'CONTROL', ctx: 'initandlisten',
      msg: 'MongoDB starting',
      attr: { pid: 9001, host: 'db01.example.com', port: 27017 },
    },
    {
      t: { $date: '2026-02-01T08:00:01.000Z' },
      s: 'I', c: 'REPL', ctx: 'initandlisten',
      msg: 'transition to PRIMARY',
      attr: {},
    },
    {
      t: { $date: '2026-02-01T08:01:00.000Z' },
      s: 'I', c: 'NETWORK', ctx: 'conn1',
      msg: 'Connection accepted',
      attr: { remote: '10.20.30.40:50100', connectionId: 1 },
    },
    {
      t: { $date: '2026-02-01T08:02:00.000Z' },
      s: 'I', c: 'ACCESS', ctx: 'conn1',
      msg: 'Authentication failed',
      attr: { user: 'app_user', mechanism: 'SCRAM-SHA-256' },
    },
    {
      t: { $date: '2026-02-01T08:03:00.000Z' },
      s: 'I', c: 'COMMAND', ctx: 'conn2',
      msg: 'Slow query',
      attr: {
        type: 'command',
        ns: 'sales.orders',
        appName: 'OrderService',
        durationMillis: 3200,
        planSummary: 'COLLSCAN',
        docsExamined: 80000,
        keysExamined: 0,
        reslen: 18000000,
        command: { find: 'orders', filter: { region: 'EU', status: 'open' }, $db: 'sales' },
      },
    },
    {
      t: { $date: '2026-02-01T08:04:00.000Z' },
      s: 'E', c: 'COMMAND', ctx: 'conn3',
      msg: 'Command failed',
      attr: { ns: 'sales.orders', errMsg: 'not authorized on sales to execute command' },
    },
    {
      t: { $date: '2026-02-01T08:05:00.000Z' },
      s: 'W', c: 'STORAGE', ctx: 'conn4',
      msg: 'WiredTiger checkpoint took longer than expected',
      attr: { durationMillis: 120 },
    },
    {
      t: { $date: '2026-02-01T08:06:00.000Z' },
      s: 'I', c: 'NETWORK', ctx: 'conn1',
      msg: 'Connection ended',
      attr: { remote: '10.20.30.40:50100', connectionId: 1 },
    },
  ]

  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
  return { dir, file }
}

describe('parseLogFile feature integration', () => {
  it('aggregates errors, warnings, audit, reslen, topology, and indexes', async () => {
    const { dir, file } = writeFeatureLog()
    try {
      const { logData } = await loadParsedLog(file, { slowThreshold: 250 })

      expect(logData.metadata.hostname).toBe('db01.example.com')
      expect(logData.metadata.port).toBe('27017')
      expect(logData.metadata.currentRole).toBe('PRIMARY')
      expect(logData.metadata.topology).toBe('replicaset')
      expect(logData.metadata.slowThresholdMs).toBe(250)

      expect(logData.errors).toHaveLength(1)
      expect(logData.warnings).toHaveLength(1)
      expect(logData.slowOps).toHaveLength(1)
      expect(logData.slowOps[0].ns).toBe('sales.orders')

      expect(logData.auditEvents.length).toBeGreaterThan(0)
      expect(logData.auditEvents.some((e) => e.type === 'AUTH_FAILURE')).toBe(true)

      expect(logData.topReslen).toHaveLength(1)
      expect(logData.topReslen[0].reslen).toBeGreaterThan(16 * 1024 * 1024)

      expect(logData.indexWarnings['sales.orders']).toBeDefined()
      expect(logData.indexWarnings['sales.orders'].count).toBe(1)
      const indexCmd = generateCreateIndexCmd('sales.orders', logData.indexWarnings['sales.orders'].examples)
      expect(indexCmd).toContain('"region":1')
      expect(indexCmd).toContain('"status":1')
      expect(indexCmd).not.toMatch(/getMore|lsid/)

      expect(logData.rawLines.length).toBeGreaterThan(0)
      expect(logData.connectionStats.open).toBeGreaterThan(0)
      expect(logData.appNames.some((a) => a.name === 'OrderService')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('respects slow threshold when classifying slow ops', async () => {
    const { dir, file } = writeFeatureLog()
    try {
      const high = await loadParsedLog(file, { slowThreshold: 5000 })
      expect(high.logData.slowOps).toHaveLength(0)

      const mid = await loadParsedLog(file, { slowThreshold: 2500 })
      expect(mid.logData.slowOps).toHaveLength(1)
      expect(mid.logData.slowOps[0].ns).toBe('sales.orders')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('statsOverviewText', () => {
  it('uses server hostname from metadata, not filename', () => {
    const text = statsOverviewText({
      metadata: {
        filename: 'mongod.log',
        hostname: 'db01.example.com',
        port: '27017',
        startTime: '2026-02-01T08:00:00.000Z',
        endTime: '2026-02-01T08:06:00.000Z',
        totalLines: 8,
        parsedLines: 8,
        skippedLines: 0,
        version: '7.0.5',
        storage: 'wiredTiger',
      },
    }, (s) => s)

    expect(text).toContain('host:        db01.example.com:27017')
    expect(text).not.toContain('host:        mongod')
  })
})
