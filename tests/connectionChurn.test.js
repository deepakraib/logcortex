import { File } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { parseLogFile } from '../src/utils/parseLogFile.js'
import { statsConnectionsText } from '../src/utils/statisticsText.js'

function line({ ts, s = 'I', c = 'NETWORK', id = 1, ctx = 'listener', msg, attr = {} }) {
  return JSON.stringify({
    t: { $date: ts },
    s,
    c,
    id,
    ctx,
    msg,
    attr,
  })
}

async function parseLines(lines) {
  const file = new File([`${lines.join('\n')}\n`], 'mongod.log', { type: 'text/plain' })
  return parseLogFile(file, () => {})
}

describe('connection churn analysis', () => {
  it('matches accepted connections with authenticated users by connection id', async () => {
    const data = await parseLines([
      line({
        ts: '2026-06-02T10:05:00.000-03:00',
        id: 22943,
        msg: 'Connection accepted',
        attr: { remote: '10.0.0.5:5000', connectionId: 1 },
      }),
      line({
        ts: '2026-06-02T10:05:00.010-03:00',
        c: 'ACCESS',
        id: 5286306,
        ctx: 'conn1',
        msg: 'Successfully authenticated',
        attr: { client: '10.0.0.5:5000', user: 'app', db: 'admin', result: 0 },
      }),
      line({
        ts: '2026-06-02T10:05:00.040-03:00',
        id: 22944,
        ctx: 'conn1',
        msg: 'Connection ended',
        attr: { remote: '10.0.0.5:5000', connectionId: 1 },
      }),
      line({
        ts: '2026-06-02T10:06:00.000-03:00',
        id: 22943,
        msg: 'Connection accepted',
        attr: { remote: '10.0.0.5:5001', connectionId: 2 },
      }),
      line({
        ts: '2026-06-02T10:06:04.000-03:00',
        s: 'W',
        c: 'NETWORK',
        id: 9001,
        ctx: 'conn2',
        msg: 'Error sending response to client. Ending connection from remote',
        attr: { error: { errmsg: 'Broken pipe' }, connectionId: 2 },
      }),
      line({
        ts: '2026-06-02T10:06:05.000-03:00',
        id: 22944,
        ctx: 'conn2',
        msg: 'Connection ended',
        attr: { remote: '10.0.0.5:5001', connectionId: 2 },
      }),
      line({
        ts: '2026-06-02T11:01:00.000-03:00',
        id: 22943,
        msg: 'Connection accepted',
        attr: { remote: 'host.example.com:6000', connectionId: 3 },
      }),
      line({
        ts: '2026-06-02T11:01:00.100-03:00',
        c: 'ACCESS',
        id: 5286306,
        ctx: 'conn3',
        msg: 'Successfully authenticated',
        attr: { client: 'host.example.com:6000', user: 'report', db: 'analytics', result: 0 },
      }),
      line({
        ts: '2026-06-02T11:04:00.000-03:00',
        id: 22944,
        ctx: 'conn3',
        msg: 'Connection ended',
        attr: { remote: 'host.example.com:6000', connectionId: 3 },
      }),
    ])

    expect(data.connectionStats).toMatchObject({ open: 3, close: 3, peak: 1, uniqueIPs: 2 })
    expect(data.connectionChurn.stats).toMatchObject({ open: 3, close: 3, peak: 1, uniqueIPs: 2 })
    expect(data.connectionChurn.hasDbUsers).toBe(true)
    expect(data.connectionChurn.summary).toMatchObject({
      trackedConnections: 3,
      authenticated: 2,
      withoutUsername: 1,
      closedWithDuration: 3,
    })
    expect(data.connectionChurn.byUserHost).toEqual(expect.arrayContaining([
      expect.objectContaining({ user: 'app@admin', host: '10.0.0.5', conns: 1, closed: 1, avgMs: 40 }),
      expect.objectContaining({ user: 'report@analytics', host: 'host.example.com', conns: 1, closed: 1 }),
    ]))
    expect(data.connHourlyTimeline).toEqual(expect.arrayContaining([
      expect.objectContaining({ ts: '2026-06-02 10:00', accepted: 2, closed: 2, activePeak: 1, errors: 1 }),
      expect.objectContaining({ ts: '2026-06-02 11:00', accepted: 1, closed: 1, activePeak: 1, errors: 0 }),
    ]))

    const text = statsConnectionsText(data, (value) => value, 100)
    expect(text).toContain('Connections by user and host:')
    expect(text).toContain('Short-lived connections by user and host (<100 ms):')
    expect(text).toContain('app@admin')
    expect(text).not.toContain('Unknown')
  })

  it('uses host-only tables when no db user appears in the log', async () => {
    const data = await parseLines([
      line({
        ts: '2026-06-02T12:00:00.000-03:00',
        id: 22943,
        msg: 'Connection accepted',
        attr: { remote: '127.0.0.1:5000', connectionId: 1 },
      }),
      line({
        ts: '2026-06-02T12:00:00.050-03:00',
        id: 22944,
        ctx: 'conn1',
        msg: 'Connection ended',
        attr: { remote: '127.0.0.1:5000', connectionId: 1 },
      }),
      line({
        ts: '2026-06-02T12:01:00.000-03:00',
        id: 22943,
        msg: 'Connection accepted',
        attr: { remote: 'db-client.example.com:5001', connectionId: 2 },
      }),
      line({
        ts: '2026-06-02T12:01:05.000-03:00',
        id: 22944,
        ctx: 'conn2',
        msg: 'Connection ended',
        attr: { remote: 'db-client.example.com:5001', connectionId: 2 },
      }),
    ])

    const text = statsConnectionsText(data, (value) => value, 3000)

    expect(data.connectionChurn.hasDbUsers).toBe(false)
    expect(text).toContain('Connections by host:')
    expect(text).toContain('Short-lived connections by host (<3000 ms):')
    expect(text).toContain('127.0.0.1')
    expect(text).not.toContain('Connections by user and host:')
    expect(text).not.toContain('user                                 host')
  })

  it('excludes replication/internal connections from churn tables and timeline errors', async () => {
    const data = await parseLines([
      line({
        ts: '2026-06-02T13:00:00.000-03:00',
        id: 22943,
        msg: 'Connection accepted',
        attr: { remote: '10.0.0.8:5000', connectionId: 1 },
      }),
      line({
        ts: '2026-06-02T13:00:00.020-03:00',
        c: 'ACCESS',
        id: 5286306,
        ctx: 'conn1',
        msg: 'Successfully authenticated',
        attr: { client: '10.0.0.8:5000', user: 'app', db: 'admin', result: 0, isClusterMember: false },
      }),
      line({
        ts: '2026-06-02T13:00:00.030-03:00',
        s: 'W',
        c: 'NETWORK',
        id: 9001,
        ctx: 'conn1',
        msg: 'Error sending response to client. Ending connection from remote',
        attr: { error: { errmsg: 'Broken pipe' }, connectionId: 1 },
      }),
      line({
        ts: '2026-06-02T13:00:00.060-03:00',
        id: 22944,
        ctx: 'conn1',
        msg: 'Connection ended',
        attr: { remote: '10.0.0.8:5000', connectionId: 1 },
      }),
      line({
        ts: '2026-06-02T13:10:00.000-03:00',
        id: 22943,
        msg: 'Connection accepted',
        attr: { remote: '127.0.0.1:6000', connectionId: 2 },
      }),
      line({
        ts: '2026-06-02T13:10:00.020-03:00',
        c: 'ACCESS',
        id: 5286306,
        ctx: 'conn2',
        msg: 'Successfully authenticated',
        attr: { client: '127.0.0.1:6000', user: '__system', db: 'local', result: 0, isClusterMember: true },
      }),
      line({
        ts: '2026-06-02T13:10:00.040-03:00',
        id: 22944,
        ctx: 'conn2',
        msg: 'Connection ended',
        attr: { remote: '127.0.0.1:6000', connectionId: 2 },
      }),
      line({
        ts: '2026-06-02T13:20:00.000-03:00',
        c: 'NETWORK',
        ctx: 'ReplicaSetMonitor-TaskExecutor',
        msg: 'Host failed in replica set',
        attr: { error: { errmsg: 'HostUnreachable' } },
      }),
      line({
        ts: '2026-06-02T13:21:00.000-03:00',
        c: 'CONNPOOL',
        ctx: 'MirrorMaestro',
        msg: 'Dropping all pooled connections',
        attr: { hostAndPort: 'localhost:27002', error: 'ConnectionPoolExpired' },
      }),
      line({
        ts: '2026-06-02T13:22:00.000-03:00',
        c: 'REPL_HB',
        ctx: 'ReplCoord-0',
        msg: 'Heartbeat failed after max retries',
        attr: { error: { errmsg: 'NetworkTimeout' } },
      }),
    ])

    const text = statsConnectionsText(data, (value) => value, 3000)

    expect(data.connectionStats).toMatchObject({ open: 2, close: 2 })
    expect(data.connectionChurn.stats).toMatchObject({ open: 1, close: 1, peak: 1, uniqueIPs: 1 })
    expect(data.connectionChurn.summary).toMatchObject({
      trackedConnections: 1,
      authenticated: 1,
      withoutUsername: 0,
      closedWithDuration: 1,
    })
    expect(data.connectionChurn.byUserHost).toHaveLength(1)
    expect(data.connectionChurn.byUserHost[0]).toMatchObject({ user: 'app@admin', host: '10.0.0.8' })
    expect(data.connHourlyTimeline).toEqual([
      expect.objectContaining({ ts: '2026-06-02 13:00', accepted: 1, closed: 1, activePeak: 1, errors: 1 }),
    ])
    expect(text).toContain('total opened:      1')
    expect(text).toContain('app@admin')
    expect(text).not.toContain('__system@local')
  })
})
