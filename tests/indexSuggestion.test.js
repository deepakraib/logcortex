import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
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
})
