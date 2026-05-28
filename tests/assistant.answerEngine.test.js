import { describe, expect, it } from 'vitest'
import { answerQuestion } from '../src/assistant/answerEngine.js'
import { LOG_DATA_CATALOG } from '../src/assistant/logKnowledge.js'
import { QUESTION_INTENTS } from '../src/assistant/questionCatalog.js'

const mockLogData = {
  metadata: {
    filename: 'test.log',
    version: '7.0.12',
    module: 'community',
    storage: 'wiredTiger',
    topology: 'replica set',
    replSetName: 'rs0',
    currentRole: 'PRIMARY',
    hostname: 'db1.example.com',
    port: '27017',
    startTime: '2026-01-01T00:00:00.000Z',
    endTime: '2026-01-01T12:00:00.000Z',
    totalLines: 1000,
    parsedLines: 900,
    skippedLines: 100,
    opsCount: 900,
  },
  slowOps: [{ ts: '2026-01-01T01:00:00.000Z', ns: 'app.users', opType: 'command', dur: 5000, plan: 'COLLSCAN', docsEx: 100, keysEx: 0 }],
  errors: [{ ts: '2026-01-01T02:00:00.000Z', s: 'E', c: 'COMMAND', msg: 'test error' }],
  warnings: [],
  queryPatterns: [{ ns: 'app.users', op: 'command', pattern: '{"id":1}', count: 10, min: 100, max: 5000, mean: 800, p95: 4000, sum: 8000 }],
  indexWarnings: { 'app.users': { count: 3, examples: [] } },
  allCollscans: { 'app.users': { count: 3, internal: false }, 'config.shards': { count: 1, internal: true } },
  topNamespaces: [{ ns: 'app.users', count: 500, avgMs: 50 }],
  operationTypes: [{ op: 'command', count: 800 }],
  auditSummary: [],
  auditEvents: [],
  appNames: [{ name: 'myApp', count: 100, slowCount: 5, errors: 0, avgMs: 120, p95Ms: 400 }],
  drivers: [],
  connectionStats: { peak: 50, open: 10, close: 8, uniqueIPs: 3 },
  ipStats: [],
  topSlowNs: [{ ns: 'app.users', avgMs: 120 }],
  severityDist: [{ s: 'I', label: 'Info', count: 800 }, { s: 'E', label: 'Error', count: 1 }],
  timelineData: [{ minute: '2026-01-01 01:00', count: 50 }],
}

describe('assistant knowledge', () => {
  it('defines catalog categories', () => {
    expect(LOG_DATA_CATALOG.length).toBeGreaterThan(10)
    expect(LOG_DATA_CATALOG.some((c) => c.id === 'slowOps')).toBe(true)
  })

  it('defines question intents', () => {
    expect(QUESTION_INTENTS.length).toBeGreaterThan(15)
  })
})

describe('answerQuestion', () => {
  it('answers version without log for help', () => {
    const r = answerQuestion('what can you answer?', null)
    expect(r.text).toMatch(/ask/i)
    expect(r.followUps.length).toBeGreaterThan(0)
  })

  it('requires log for version question', () => {
    const r = answerQuestion('what mongodb version?', null)
    expect(r.text).toMatch(/upload/i)
  })

  it('answers version from mock log', () => {
    const r = answerQuestion('What MongoDB version is this?', mockLogData)
    expect(r.text).toMatch(/7\.0\.12/)
    expect(r.intentId).toBe('version')
  })

  it('answers slow count', () => {
    const r = answerQuestion('how many slow queries?', mockLogData)
    expect(r.text).toMatch(/1/)
    expect(r.intentId).toBe('slow_count')
  })

  it('answers collscan', () => {
    const r = answerQuestion('any collscan?', mockLogData)
    expect(r.text).toMatch(/COLLSCAN/i)
    expect(r.text).toMatch(/app\.users/)
  })

  it('answers summarize', () => {
    const r = answerQuestion('summarize this log', mockLogData)
    expect(r.text).toMatch(/Overview/i)
  })

  it('lists errors for show me the errors', () => {
    const r = answerQuestion('show me the errors', mockLogData)
    expect(r.intentId).toBe('top_errors')
    expect(r.text).toMatch(/error/i)
  })

  it('answers why is it slow with performance snapshot', () => {
    const r = answerQuestion('why is it slow?', mockLogData)
    expect(r.intentId).toBe('performance_issues')
    expect(r.text).toMatch(/slow/i)
  })

  it('answers namespace-specific slow question', () => {
    const r = answerQuestion('slow queries on app.users', mockLogData)
    expect(r.intentId).toBe('namespace_focus')
    expect(r.text).toMatch(/app\.users/)
  })

  it('answers whats wrong with overview-style help', () => {
    const r = answerQuestion("what's wrong with this cluster?", mockLogData)
    expect(['performance_issues', 'health_summary']).toContain(r.intentId)
  })

  it('answers recommendations', () => {
    const r = answerQuestion('what should I fix first?', mockLogData)
    expect(r.intentId).toBe('recommendations')
    expect(r.text).toMatch(/Recommended/i)
  })

  it('answers tab guide for slow queries', () => {
    const r = answerQuestion('where do I find slow queries in the UI?', mockLogData)
    expect(r.intentId).toBe('tab_guide')
    expect(r.text).toMatch(/Slow Ops/i)
  })

  it('responds to Hi with greeting not topology', () => {
    const r = answerQuestion('Hi', mockLogData)
    expect(r.intentId).toBe('greeting')
    expect(r.text).toMatch(/Ask Log/i)
    expect(r.text).not.toMatch(/Topology/i)
  })

  it('responds to How are you with greeting not slow count', () => {
    const r = answerQuestion('How are you?', mockLogData)
    expect(r.intentId).toBe('greeting')
    expect(r.text).not.toMatch(/slow operations/i)
  })

  it('covers full question bank intents', () => {
    const ids = new Set(QUESTION_INTENTS.map((i) => i.id))
    expect(ids.size).toBeGreaterThanOrEqual(40)
  })
})
