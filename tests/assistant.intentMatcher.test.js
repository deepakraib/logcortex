import { describe, expect, it } from 'vitest'
import {
  matchIntents,
  normalizeQuestion,
  inferFallbackIntent,
  isChitchat,
} from '../src/assistant/intentMatcher.js'

describe('normalizeQuestion', () => {
  it('expands show errors to top-errors phrasing', () => {
    expect(normalizeQuestion('show me the errors')).toMatch(/top errors/)
  })

  it('expands whats wrong', () => {
    expect(normalizeQuestion("what's wrong")).toMatch(/problem|failed|overview/)
  })
})

describe('matchIntents', () => {
  it('prefers top_errors over error_count for show errors', () => {
    const matches = matchIntents(normalizeQuestion('show me the errors'))
    expect(matches[0]?.intent.id).toBe('top_errors')
  })

  it('prefers error_count for how many errors', () => {
    const matches = matchIntents(normalizeQuestion('how many errors'))
    expect(matches[0]?.intent.id).toBe('error_count')
  })

  it('matches why is it slow to performance_issues', () => {
    const matches = matchIntents(normalizeQuestion('why is it slow'))
    expect(matches[0]?.intent.id).toBe('performance_issues')
  })

  it('matches summarize variants', () => {
    const matches = matchIntents(normalizeQuestion('give me a quick summary'))
    expect(matches.some((m) => m.intent.id === 'health_summary')).toBe(true)
  })
})

describe('inferFallbackIntent', () => {
  it('returns top_errors for generic error question', () => {
    expect(inferFallbackIntent('any error in log', {})).toBe('top_errors')
  })
})

describe('chitchat and short queries', () => {
  it('detects greetings', () => {
    expect(isChitchat('Hi')).toBe(true)
    expect(isChitchat('How are you?')).toBe(true)
    expect(isChitchat('thanks!')).toBe(true)
  })

  it('does not match Hi to topology via examples', () => {
    const matches = matchIntents(normalizeQuestion('hi'))
    expect(matches[0]?.intent.id).not.toBe('topology')
    if (matches.length > 0) {
      expect(matches[0]?.intent.id).toBe('greeting')
    }
  })

  it('does not match how are you to slow_count', () => {
    const matches = matchIntents(normalizeQuestion('how are you'))
    expect(matches.find((m) => m.intent.id === 'slow_count')).toBeUndefined()
  })

  it('still matches how many slow queries', () => {
    const matches = matchIntents(normalizeQuestion('how many slow queries'))
    expect(matches[0]?.intent.id).toBe('slow_count')
  })
})
