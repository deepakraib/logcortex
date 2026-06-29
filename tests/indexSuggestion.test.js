import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildIndexSuggestion,
  extractFieldsFromQueryPattern,
  extractFieldsFromTruncated,
  extractIndexableFields,
  extractQueryFilter,
  generateCreateIndexCmd,
  inferOpTypeFromCommand,
  resolveCollscanCommand,
} from '../src/utils/indexSuggestion.js'
import { loadParsedLog } from '../src/cli/loadLog.js'

describe('indexSuggestion', () => {
  it('extracts filter fields from find commands', () => {
    const cmd = { find: 'orders', filter: { customer_id: 42, status: 'open' }, $db: 'shop' }
    expect(extractIndexableFields(cmd, 'find')).toEqual(['customer_id', 'status'])
  })

  it('extracts fields from aggregate $match stages', () => {
    const cmd = {
      aggregate: 'users',
      pipeline: [{ $match: { region: 'EU', active: true } }],
      $db: 'app',
    }
    expect(extractIndexableFields(cmd, 'aggregate')).toEqual(['active', 'region'])
  })

  it('does not treat getMore metadata as index fields', () => {
    const cmd = {
      getMore: { $numberLong: '123456789' },
      collection: 'orders',
      lsid: { id: { $uuid: '00000000-0000-0000-0000-000000000000' } },
      maxTimeMSOpOnly: true,
      mayBypassWriteBlocking: true,
    }
    expect(extractQueryFilter(cmd, 'getmore')).toBeNull()
    expect(extractIndexableFields(cmd, 'getmore')).toEqual([])
  })

  it('does not fall back to command keys when filter is missing', () => {
    const cmd = { find: 'orders', $db: 'shop' }
    expect(extractIndexableFields(cmd, 'find')).toEqual([])
  })

  it('resolves getMore COLLSCAN to originating find filter', () => {
    const attr = {
      originatingCommand: {
        find: 'orders',
        filter: { account_id: 99 },
        $db: 'shop',
      },
    }
    const resolved = resolveCollscanCommand(
      attr,
      { getMore: { $numberLong: '1' }, collection: 'orders' },
      'getmore',
    )
    expect(inferOpTypeFromCommand(resolved.cmd)).toBe('find')
    expect(extractIndexableFields(resolved.cmd, resolved.opType)).toEqual(['account_id'])
  })

  it('generates createIndex from resolved examples', () => {
    const cmd = generateCreateIndexCmd('shop.orders', [
      {
        opType: 'find',
        cmd: { find: 'orders', filter: { customer_id: 1, status: 'open' }, $db: 'shop' },
      },
    ])
    expect(cmd).toBe(
      'db.getSiblingDB("shop").getCollection("orders").createIndex({"customer_id":1,"status":1})',
    )
    expect(cmd).not.toMatch(/getMore|lsid|collection/)
  })

  it('collects fields from $or conditions', () => {
    const cmd = {
      find: 'users',
      filter: { $or: [{ email: 'a@b.com' }, { username: 'alice' }] },
      $db: 'app',
    }
    expect(extractIndexableFields(cmd, 'find')).toEqual(['email', 'username'])
  })

  it('extracts fields from normalized query pattern strings', () => {
    expect(extractFieldsFromQueryPattern('{ "status":1, "customer_id":1}')).toEqual(['customer_id', 'status'])
    expect(extractFieldsFromQueryPattern('{ key: "region" }')).toEqual(['region'])
    expect(extractFieldsFromQueryPattern('{}')).toEqual([])
  })

  it('falls back to query patterns when COLLSCAN examples have no filter', () => {
    const suggestion = buildIndexSuggestion(
      'shop.orders',
      [{
        opType: 'getmore',
        cmd: { getMore: { $numberLong: '1' }, collection: 'orders' },
      }],
      [{ pattern: '{ "region":1, "status":1}', count: 42 }],
    )
    expect(suggestion.hasFields).toBe(true)
    expect(suggestion.fields).toEqual(['region', 'status'])
    expect(suggestion.source).toBe('pattern')
    expect(suggestion.cmd).toBe(
      'db.getSiblingDB("shop").getCollection("orders").createIndex({"region":1,"status":1})',
    )
  })

  it('resolves getMore via cursor map when originatingCommand is on an earlier line', () => {
    const getMoreMap = {
      '9876543210': {
        originatingCmd: { find: 'orders', filter: { order_id: 7 }, $db: 'shop' },
      },
    }
    const resolved = resolveCollscanCommand(
      { cursorId: '9876543210' },
      { getMore: { $numberLong: '9876543210' }, collection: 'orders' },
      'getmore',
      getMoreMap,
    )
    expect(extractIndexableFields(resolved.cmd, resolved.opType)).toEqual(['order_id'])
  })

  it('does not emit invalid createIndex placeholder when fields are unknown', () => {
    const cmd = generateCreateIndexCmd('shop.orders', [{ opType: 'getmore', cmd: { getMore: 1 } }], [])
    expect(cmd).not.toMatch(/createIndex\(\{ \/\*/)
    expect(cmd).toMatch(/No query filter fields found/)
  })

  it('recovers filter fields from a truncated find command string', () => {
    const text = '{ find: "orders", filter: { customerId: 123, status: "active", region: "EU" }, sort: { createdAt: -1 }, $db: "shop" }'
    expect(extractFieldsFromTruncated(text)).toEqual(['customerId', 'region', 'status'])
  })

  it('recovers filter fields from a partially cut-off truncated string', () => {
    const text = '{ find: "orders", filter: { customerId: 123, status: "active", regio'
    expect(extractFieldsFromTruncated(text)).toEqual(['customerId', 'status'])
  })

  it('recovers fields from a truncated aggregate $match', () => {
    const text = '{ aggregate: "events", pipeline: [ { $match: { tenantId: 7, kind: "click" } }, { $group'
    expect(extractFieldsFromTruncated(text)).toEqual(['kind', 'tenantId'])
  })

  it('extracts indexable fields from a command object carrying $truncated', () => {
    const cmd = { $truncated: '{ find: "orders", filter: { accountId: 9, state: "open" }, sort: {', comment: 'app-x' }
    expect(extractIndexableFields(cmd, 'command')).toEqual(['accountId', 'state'])
  })
})

describe('COLLSCAN examples in parsed logs', () => {
  it('stores originating command for getMore COLLSCAN lines', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'logcortex-'))
    const file = join(dir, 'mongod.log')

    const getMoreCollscan = JSON.stringify({
      t: { $date: '2026-01-17T04:36:53.141Z' },
      s: 'I',
      c: 'COMMAND',
      id: 51803,
      ctx: 'conn1',
      msg: 'Slow query',
      attr: {
        type: 'getmore',
        ns: 'shop.orders',
        command: {
          getMore: { $numberLong: '9876543210' },
          collection: 'orders',
          lsid: { id: { $uuid: '11111111-1111-1111-1111-111111111111' } },
          maxTimeMSOpOnly: true,
          mayBypassWriteBlocking: true,
        },
        originatingCommand: {
          find: 'orders',
          filter: { customer_id: 42 },
          $db: 'shop',
        },
        planSummary: 'COLLSCAN',
        keysExamined: 0,
        docsExamined: 12000,
        durationMillis: 5016,
      },
    })

    writeFileSync(file, getMoreCollscan + '\n')

    try {
      const { logData } = await loadParsedLog(file, { slowThreshold: 100 })
      const examples = logData.indexWarnings['shop.orders'].examples
      expect(examples).toHaveLength(1)
      expect(examples[0].opType).toBe('find')
      expect(examples[0].cmd.filter).toEqual({ customer_id: 42 })

      const indexCmd = generateCreateIndexCmd('shop.orders', examples)
      expect(indexCmd).toBe(
        'db.getSiblingDB("shop").getCollection("orders").createIndex({"customer_id":1})',
      )
      expect(indexCmd).not.toMatch(/getMore|lsid|collection/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('uses query patterns when getMore COLLSCAN has no originatingCommand', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'logcortex-'))
    const file = join(dir, 'mongod.log')

    const lines = [
      JSON.stringify({
        t: { $date: '2026-01-17T08:00:00.000Z' },
        s: 'I', c: 'COMMAND', ctx: 'conn1', msg: 'Slow query',
        attr: {
          type: 'command', ns: 'app.items', durationMillis: 3200,
          planSummary: 'COLLSCAN', keysExamined: 0, docsExamined: 50000,
          command: { find: 'items', filter: { sku: 'ABC', active: true }, $db: 'app' },
        },
      }),
      JSON.stringify({
        t: { $date: '2026-01-17T08:00:05.000Z' },
        s: 'I', c: 'COMMAND', ctx: 'conn1', msg: 'Slow query',
        attr: {
          type: 'getmore', ns: 'app.items', durationMillis: 5100,
          planSummary: 'COLLSCAN', keysExamined: 0, docsExamined: 50000,
          command: { getMore: { $numberLong: '999' }, collection: 'items' },
        },
      }),
    ]

    writeFileSync(file, lines.join('\n') + '\n')

    try {
      const { logData } = await loadParsedLog(file, { slowThreshold: 100 })
      const suggestion = buildIndexSuggestion(
        'app.items',
        logData.indexWarnings['app.items'].examples,
        logData.indexWarnings['app.items'].queryPatterns,
      )
      expect(suggestion.hasFields).toBe(true)
      expect(suggestion.fields).toEqual(['active', 'sku'])
      expect(suggestion.cmd).toContain('"sku":1')
      expect(suggestion.cmd).toContain('"active":1')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
