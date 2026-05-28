import { describe, expect, it } from 'vitest'
import {
  QUESTION_BANK,
  CORE_QUESTION_BANK,
  TARGET_QUESTION_COUNT,
  lookupQuestionIntent,
  searchQuestionBank,
  filterQuestionBankGrouped,
  getQuestionBankSize,
} from '../src/assistant/questionBank.js'
import { answerQuestion } from '../src/assistant/answerEngine.js'
import { generateQuestionBank } from '../src/assistant/questionGenerator.js'

describe('question bank', () => {
  it('generates exactly 10000 unique questions', () => {
    expect(QUESTION_BANK.length).toBe(TARGET_QUESTION_COUNT)
    expect(TARGET_QUESTION_COUNT).toBe(10000)
    const unique = new Set(QUESTION_BANK.map((q) => q.question.toLowerCase()))
    expect(unique.size).toBe(10000)
  })

  it('lookupQuestionIntent maps every bank question to its intent', () => {
    for (const { question, intentId } of QUESTION_BANK) {
      expect(lookupQuestionIntent(question)).toBe(intentId)
    }
  })

  it('answerQuestion uses bank lookup for catalog phrasing', () => {
    const logData = {
      metadata: { version: '7.0.5', filename: 't.log' },
      slowOps: [],
      errors: [],
    }
    const sample = QUESTION_BANK[5000]
    const r = answerQuestion(sample.question, logData, { mask: (s) => s })
    expect(r.intentId).toBe(sample.intentId)
    expect(r.confidence).toBe('high')
  })

  it('includes all core hand-picked questions', () => {
    for (const core of CORE_QUESTION_BANK) {
      expect(QUESTION_BANK.some((q) => q.question === core.question)).toBe(true)
    }
  })

  it('covers every intent template', () => {
    const ids = new Set(QUESTION_BANK.map((q) => q.intentId))
    expect(ids.size).toBeGreaterThanOrEqual(40)
  })

  it('searchQuestionBank finds slow-related questions', () => {
    const hits = searchQuestionBank('slow', 50)
    expect(hits.length).toBeGreaterThan(10)
    expect(hits.every((h) => h.text.toLowerCase().includes('slow'))).toBe(true)
  })

  it('filterQuestionBankGrouped returns all questions when filter empty', () => {
    const grouped = filterQuestionBankGrouped('')
    const count = grouped.reduce((n, [, items]) => n + items.length, 0)
    expect(count).toBe(getQuestionBankSize())
    expect(count).toBe(10000)
  })

  it('generateQuestionBank is deterministic', () => {
    const a = generateQuestionBank(CORE_QUESTION_BANK.slice(0, 3), 100)
    const b = generateQuestionBank(CORE_QUESTION_BANK.slice(0, 3), 100)
    expect(a.map((x) => x.question)).toEqual(b.map((x) => x.question))
  })
})
