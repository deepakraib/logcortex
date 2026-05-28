import { describe, expect, it } from 'vitest'
import { maskString, obfuscate, resetObfuscationMaps } from '../src/utils/pii'

describe('pii utilities', () => {
  it('maskString redacts sensitive values when enabled', () => {
    const input = 'User john@example.com from 10.1.2.3 connected via mongodb://u:p@host/db'
    const out = maskString(input, true, false, true)

    expect(out).toContain('[EMAIL_REDACTED]')
    expect(out).toContain('[IP_REDACTED]')
    expect(out).toContain('[CONN_STR_REDACTED]')
  })

  it('maskString is no-op when disabled', () => {
    const input = 'contact: user@example.com'
    expect(maskString(input, false)).toBe(input)
  })

  it('obfuscate maps the same IP consistently within a session', () => {
    resetObfuscationMaps()
    const once = obfuscate('ip=10.99.1.8')
    const twice = obfuscate('ip=10.99.1.8')

    expect(once).toBe(twice)
    expect(once).not.toContain('10.99.1.8')
  })
})
