import { describe, expect, it } from 'vitest'
import { shouldSkipIndexSuggestionNamespace } from '../src/utils/parseLogFile'

describe('shouldSkipIndexSuggestionNamespace', () => {
  it('skips known internal namespaces where COLLSCAN is expected', () => {
    expect(shouldSkipIndexSuggestionNamespace('local.oplog.rs')).toBe(true)
    expect(shouldSkipIndexSuggestionNamespace('admin.pbmLog')).toBe(true)
    expect(shouldSkipIndexSuggestionNamespace('config.system.sessions')).toBe(true)
    expect(shouldSkipIndexSuggestionNamespace('local.system.replset')).toBe(true)
  })

  it('allows user data namespaces for index recommendations', () => {
    expect(shouldSkipIndexSuggestionNamespace('mydb.users')).toBe(false)
    expect(shouldSkipIndexSuggestionNamespace('orders.transactions')).toBe(false)
  })
})
