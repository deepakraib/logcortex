import { createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createGunzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { Writable } from 'node:stream'
import pako from 'pako'
import { unzipSync } from 'fflate'
import { parseTar, pickLogFile } from '../utils/tarParser.js'
import { maskString } from '../utils/pii.js'

async function sniffBytes(filePath) {
  const { open } = await import('node:fs/promises')
  const handle = await open(filePath, 'r')
  try {
    const buf = Buffer.alloc(512)
    const { bytesRead } = await handle.read(buf, 0, 512, 0)
    return new Uint8Array(buf.subarray(0, bytesRead))
  } finally {
    await handle.close()
  }
}

function detectFormat(bytes) {
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return 'gzip'
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return 'zip'
  const ustar = [0x75, 0x73, 0x74, 0x61, 0x72]
  if (bytes.length > 262 && ustar.every((b, i) => bytes[257 + i] === b)) return 'tar'
  return 'text'
}

function extractTarText(bytes) {
  const entries = parseTar(bytes)
  const entry = pickLogFile(entries)
  if (!entry) throw new Error('No MongoDB log file found inside the archive.')
  let data = entry.data
  if (data[0] === 0x1f && data[1] === 0x8b) data = pako.inflate(data)
  return new TextDecoder('utf-8').decode(data)
}

function extractZipText(bytes) {
  const entries = unzipSync(bytes)
  const candidates = Object.entries(entries)
    .filter(([name, data]) => !name.endsWith('/') && data?.length > 0 && !name.startsWith('__MACOSX/'))
    .map(([name, data]) => ({ name, data }))
  const entry = pickLogFile(candidates)
  if (!entry) throw new Error('No MongoDB log file found inside the ZIP archive.')
  let data = entry.data
  if (data[0] === 0x1f && data[1] === 0x8b) data = pako.inflate(data)
  return new TextDecoder('utf-8').decode(data)
}

async function* iterateTextLines(text) {
  let start = 0
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      if (i > start) yield text.slice(start, i)
      start = i + 1
    }
  }
  if (start < text.length) yield text.slice(start)
}

async function* iterateFileLines(filePath, format) {
  if (format === 'text') {
    const stream = createReadStream(filePath, { encoding: 'utf8' })
    let buffer = ''
    for await (const chunk of stream) {
      buffer += chunk
      let nl
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl)
        buffer = buffer.slice(nl + 1)
        if (line) yield line
      }
    }
    if (buffer) yield buffer
    return
  }

  if (format === 'gzip') {
    const chunks = []
    await pipeline(
      createReadStream(filePath),
      createGunzip(),
      new Writable({
        write(chunk, _enc, cb) {
          chunks.push(chunk)
          cb()
        },
      })
    )
    const text = Buffer.concat(chunks).toString('utf8')
    yield* iterateTextLines(text)
    return
  }

  const buf = await readFile(filePath)
  const bytes = new Uint8Array(buf)
  const text = format === 'tar'
    ? extractTarText(bytes)
    : format === 'zip'
      ? extractZipText(bytes)
      : buf.toString('utf8')
  yield* iterateTextLines(text)
}

function parseLineMeta(line) {
  try {
    const obj = JSON.parse(line)
    const ts = obj.t?.$date || ''
    const s = obj.s || 'I'
    const c = obj.c || ''
    const msg = obj.msg || ''
    const attr = obj.attr || {}
    const dur = attr.durationMillis ?? null
    const plan = (attr.planSummary || '').toUpperCase()
    return { ts, s, c, msg, dur, plan, raw: obj }
  } catch {
    return null
  }
}

function matchesFilter(meta, line, opts) {
  if (!meta) return opts.word.length === 0

  if (opts.severity) {
    const want = opts.severity.toUpperCase()
    if (meta.s.toUpperCase() !== want) return false
  }

  if (opts.component) {
    if (meta.c.toLowerCase() !== opts.component.toLowerCase()) return false
  }

  if (opts.slow && (meta.dur == null || meta.dur < (opts.slowThreshold ?? 100))) return false

  if (opts.from && meta.ts && meta.ts < opts.from) return false
  if (opts.to && meta.ts && meta.ts > opts.to) return false

  if (opts.word.length > 0) {
    const hay = `${meta.msg} ${meta.c} ${JSON.stringify(meta.raw)}`.toLowerCase()
    const ok = opts.word.some((w) => hay.includes(w.toLowerCase()))
    if (!ok) return false
  }

  return true
}

function formatHumanLine(meta, line, maskFn) {
  const ts = meta.ts?.slice(0, 23) || '?'
  const dur = meta.dur != null ? ` (${meta.dur}ms)` : ''
  const msg = maskFn(meta.msg || line.slice(0, 200))
  return `${ts} ${meta.s} ${meta.c}${dur} ${msg}`
}

/**
 * Stream-filter a log file (mlogfilter-style).
 */
export async function streamFilterLog(filePath, opts, maskFn, write) {
  const head = await sniffBytes(filePath)
  const format = detectFormat(head)
  let matched = 0
  let scanned = 0

  for await (const line of iterateFileLines(filePath, format)) {
    if (!line.trim()) continue
    scanned++
    const meta = parseLineMeta(line)
    if (!matchesFilter(meta, line, opts)) continue
    matched++
    const out = opts.human && meta
      ? formatHumanLine(meta, line, maskFn)
      : maskFn(line)
    await write(`${out}\n`)
  }

  return { scanned, matched }
}

export function defaultMaskFn(opts) {
  const enabled = Boolean(opts.mask || opts.maskNs || opts.maskIp || opts.maskHost || opts.maskRs)
  if (!enabled) return (s) => s
  return (s) => maskString(s, true, opts.maskNs, opts.maskIp, opts.maskHost, opts.maskRs)
}
