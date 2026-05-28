#!/usr/bin/env node
/** Writes docs/ASK_LOG_QUESTIONS.md — full list of Ask Log example questions. */
import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getFullQuestionBank, getQuestionBankSize } from '../src/assistant/questionBank.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const out = resolve(__dirname, '../docs/ASK_LOG_QUESTIONS.md')
const grouped = getFullQuestionBank()
const total = getQuestionBankSize()

const lines = [
  '# Ask Log — example questions',
  '',
  'LogCortex includes **generic example phrasings** you can ask about a loaded MongoDB log.',
  'Click any line in the **Ask Log** panel under **Example questions**, or type similar wording in the chat box.',
  'Answers are built from parsed log data in your browser (no cloud API).',
  '',
  '---',
  '',
]

for (const [category, items] of grouped) {
  lines.push(`## ${category}`, '')
  for (const { question } of items) {
    lines.push(`- ${question}`)
  }
  lines.push('')
}

writeFileSync(out, lines.join('\n'), 'utf8')
console.log(`Wrote ${total} questions to ${out}`)
