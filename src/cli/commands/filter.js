import { createWriteStream } from 'node:fs'
import { finished } from 'node:stream/promises'
import { streamFilterLog, defaultMaskFn } from '../streamFilter.js'
import { printJson } from '../format.js'

export async function runFilter(filePath, opts) {
  const maskFn = defaultMaskFn(opts)
  const words = opts.word?.length
    ? opts.word
  : opts.errors
    ? ['error', 'assert', 'warning', 'fatal']
    : []

  const filterOpts = { ...opts, word: words }

  if (opts.out) {
    const out = createWriteStream(opts.out, { encoding: 'utf8' })
    const write = (chunk) => new Promise((resolve, reject) => {
      out.write(chunk, (err) => (err ? reject(err) : resolve()))
    })
    const stats = await streamFilterLog(filePath, filterOpts, maskFn, write)
    await finished(out)
    if (!opts.json) {
      process.stderr.write(
        `Wrote ${stats.matched.toLocaleString()} lines (scanned ${stats.scanned.toLocaleString()}) → ${opts.out}\n`
      )
    } else {
      printJson({ ...stats, out: opts.out })
    }
    return
  }

  const chunks = []
  const stats = await streamFilterLog(filePath, filterOpts, maskFn, async (chunk) => {
    chunks.push(chunk)
  })

  if (opts.json) {
    printJson({ scanned: stats.scanned, matched: stats.matched, lines: chunks.join('').split('\n').filter(Boolean) })
    return
  }

  process.stdout.write(chunks.join(''))
  if (!chunks.length) {
    process.stderr.write(`No lines matched (scanned ${stats.scanned.toLocaleString()}).\n`)
  }
}
