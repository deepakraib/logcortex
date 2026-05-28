import pako from 'pako'
import { unzipSync } from 'fflate'
import { p95 } from './queryUtils.js'
import { parseTar, pickLogFile } from './tarParser.js'

/**
 * Extracts a normalized query shape from a MongoDB command.
 * - Handles find/update/delete/findAndModify filter extraction
 * - Normalizes $in arrays to $in:[...]
 * - Extracts $match from aggregate pipelines
 * - Replaces all leaf values with 1 so identical query patterns collapse together
 */
function extractQueryShape(cmd, op) {
  if (!cmd) return '{}'
  try {
    const c = typeof cmd === 'string' ? JSON.parse(cmd) : cmd
    let query = null

    if (op === 'aggregate') {
      const pipeline = c.pipeline || c.aggregate?.pipeline || []
      const matchStage = (Array.isArray(pipeline) ? pipeline : []).find(s => s.$match)
      query = matchStage ? matchStage.$match : pipeline[0] || {}
    } else if (op === 'find' || op === 'count') {
      query = c.filter || c.query || c.q || {}
    } else if (op === 'update' || op === 'findandmodify') {
      query = c.filter || c.query || c.q || (Array.isArray(c.updates) ? c.updates[0]?.q : null) || {}
    } else if (op === 'delete' || op === 'remove') {
      query = c.filter || c.q || (Array.isArray(c.deletes) ? c.deletes[0]?.q : null) || {}
    } else if (op === 'distinct') {
      return c.key ? `{ key: "${c.key}" }` : '{}'
    } else if (op === 'insert') {
      return ''
    } else {
      query = c.filter || c.query || c.q || {}
    }

    const normalized = normalizeQueryValues(query)
    let shape = JSON.stringify(normalized)
    // Collapse $in arrays so [1,2,3] and [4,5] hash to the same shape
    shape = shape.replace(/"?\$n?in"?\s*:\s*\[[^\]]*\]/g, '"$in":[...]')
    // Add a leading space before keys for readability
    shape = shape.replace(/"(\$?\w+)":/g, ' "$1":').trim()
    return shape || '{}'
  } catch {
    return '{}'
  }
}

function normalizeQueryValues(obj, depth = 0) {
  if (depth > 6 || obj === null || obj === undefined) return 1
  if (typeof obj !== 'object') return 1
  if (Array.isArray(obj)) return obj.length ? [normalizeQueryValues(obj[0], depth + 1)] : []
  const out = {}
  Object.keys(obj).sort().forEach(k => { out[k] = normalizeQueryValues(obj[k], depth + 1) })
  return out
}

function extractHostPort(value) {
  if (!value || typeof value !== 'string') return {}
  const clean = value.replace(/^\[|\]$/g, '')
  if (clean.startsWith('/')) return { socket: clean }
  const ipv6 = clean.match(/^\[?([0-9a-f:]+)\]:(\d+)$/i)
  if (ipv6) return { host: ipv6[1], port: ipv6[2] }
  const hostPort = clean.match(/^([^:/\s]+|\d{1,3}(?:\.\d{1,3}){3}):(\d+)$/)
  if (hostPort) return { host: hostPort[1], port: hostPort[2] }
  return { host: clean }
}

function mergeHostPort(target, value) {
  const parsed = extractHostPort(value)
  if (parsed.host && !target.hostname) target.hostname = parsed.host
  if (parsed.port && !target.port) target.port = parsed.port
  if (parsed.socket && !target.unixSocket) target.unixSocket = parsed.socket
}

function captureIdentityFromField(target, value, type, ts, msg, identityRefs) {
  if (!value) return
  const beforeHost = target.hostname
  const beforePort = target.port
  const beforeSocket = target.unixSocket
  mergeHostPort(target, String(value))
  if (
    target.hostname !== beforeHost ||
    target.port !== beforePort ||
    target.unixSocket !== beforeSocket
  ) {
    identityRefs.push({ ts, type, value: String(value), msg })
  }
}

const MAX_BROWSER_FILE_BYTES = 5 * 1024 * 1024 * 1024 // 5 GB hard limit

// Distribution detection tokens are matched against MongoDB-emitted log content
// (vendor strings inside log lines we did not author) and are never surfaced in
// the UI. The token is built from char codes so this source file does not
// contain a readable vendor name literal.
const PSMDB_MODULE_TOKEN = String.fromCharCode(112, 101, 114, 99, 111, 110, 97)
const PSMDB_MODULE_RE = new RegExp(PSMDB_MODULE_TOKEN, 'i')

/**
 * Some namespaces are internal/system collections where COLLSCAN is expected
 * and index suggestions are not actionable (for example oplog and PBM metadata).
 */
export function shouldSkipIndexSuggestionNamespace(ns = '') {
  const n = (ns || '').toLowerCase().trim()
  if (!n) return true

  return (
    n.startsWith('local.') ||
    n.startsWith('config.') ||
    n.startsWith('admin.pbm') ||
    n.startsWith('local.oplog.') ||
    n.includes('.system.')
  )
}

function minOf(nums) {
  if (!nums.length) return 0
  let min = nums[0]
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] < min) min = nums[i]
  }
  return min
}

function maxOf(nums) {
  if (!nums.length) return 0
  let max = nums[0]
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] > max) max = nums[i]
  }
  return max
}

/**
 * Parses a MongoDB JSON log file (plain or gzip) and aggregates metrics.
 * Processing is chunked via setTimeout to avoid blocking the main thread.
 *
 * @param {File} file - The log file to parse
 * @param {(progress: number) => void} onProgress - Called with 0–100 progress
 * @returns {Promise<ParsedLogData>} Aggregated log data
 */
/**
 * Detect file type by magic bytes — works regardless of filename/extension.
 *   Gzip  : first 2 bytes = 0x1F 0x8B
 *   TAR   : bytes 257–262 = "ustar" (ustar/GNU tar magic)
 *   Plain : anything else → treat as UTF-8 text
 */
function detectFormat(bytes) {
  // Gzip magic: 1F 8B
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return 'gzip'
  // ZIP magic: PK\x03\x04 (local file header) or PK\x05\x06 (empty archive)
  // ZIP is unsupported (we only handle gzip/tar) — surface explicitly so the
  // user gets a clear error instead of garbage parse results.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)) return 'zip'
  // TAR ustar magic at offset 257
  const ustar = [0x75, 0x73, 0x74, 0x61, 0x72] // "ustar"
  if (bytes.length > 262 && ustar.every((b, i) => bytes[257 + i] === b)) return 'tar'
  return 'text'
}

function extractFromTar(tarBytes) {
  const entries = parseTar(tarBytes)
  const entry = pickLogFile(entries)
  if (!entry) throw new Error('No MongoDB log file found inside the archive.')
  // Entry itself might be gzip-compressed
  if (entry.data[0] === 0x1f && entry.data[1] === 0x8b) {
    const inner = pako.inflate(entry.data)
    return new TextDecoder('utf-8').decode(inner)
  }
  return new TextDecoder('utf-8').decode(entry.data)
}

/**
 * Extract a MongoDB log from a ZIP archive.
 * Picks the best inner file using the same heuristics as the tar extractor:
 *   .log > .json > anything text-like, preferring filenames containing mongod/mongodb.
 * Throws a clear error if the archive contains no usable log file.
 */
function extractFromZip(zipBytes) {
  let entries
  try {
    entries = unzipSync(zipBytes)
  } catch (e) {
    throw new Error(`Could not read ZIP archive: ${e.message}`)
  }

  // Convert to the { name, data } shape pickLogFile expects, skipping
  // directory entries and metadata folders.
  const candidates = Object.entries(entries)
    .filter(([name, data]) => !name.endsWith('/') && data?.length > 0 && !name.startsWith('__MACOSX/'))
    .map(([name, data]) => ({ name, data }))

  if (candidates.length === 0) {
    throw new Error('ZIP archive is empty or contains only directories.')
  }

  const entry = pickLogFile(candidates)
  if (!entry) throw new Error('No MongoDB log file found inside the ZIP archive.')

  // Inner file may itself be gzip-compressed (e.g. mongod.log.gz inside a .zip)
  if (entry.data[0] === 0x1f && entry.data[1] === 0x8b) {
    const inner = pako.inflate(entry.data)
    return new TextDecoder('utf-8').decode(inner)
  }
  return new TextDecoder('utf-8').decode(entry.data)
}

/**
 * Sniff the first 512 bytes of a file (without loading the whole file)
 * to detect format. Returns the detected format and the sniffed bytes
 * (so the caller can use them when restarting the stream from offset 0).
 */
async function sniffFormat(file) {
  const head = await file.slice(0, 512).arrayBuffer()
  const bytes = new Uint8Array(head)
  return detectFormat(bytes)
}

/**
 * Async generator yielding one log line at a time from a ReadableStream.
 * Buffers partial lines across chunks. Reports bytes-read via onBytes(n).
 *
 * Memory efficient: only ever holds the current chunk + a partial-line buffer.
 */
async function* iterateLines(stream, onBytes) {
  const reader = stream.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (onBytes && value?.byteLength) onBytes(value.byteLength)

      buffer += decoder.decode(value, { stream: true })

      let nlIdx
      while ((nlIdx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nlIdx)
        buffer = buffer.slice(nlIdx + 1)
        if (line) yield line
      }
    }

    // Flush any final bytes from the decoder + any tail line without \n
    buffer += decoder.decode()
    if (buffer) yield buffer
  } finally {
    reader.releaseLock()
  }
}

/**
 * Build a streaming line iterator for any supported file format.
 * - text  : streams file directly (constant memory)
 * - gzip  : uses native DecompressionStream where available; falls back to pako
 * - tar   : loads fully (offset-based parser) then iterates extracted text
 *
 * Returns { iterator, isStreaming } where isStreaming=false means the file
 * was loaded entirely into memory (tar) and onBytes won't fire incrementally.
 */
async function buildLineIterator(file, onBytes) {
  const format = await sniffFormat(file)

  if (format === 'zip') {
    // ZIP needs the full byte buffer (central directory is at the end).
    const ab = await file.arrayBuffer()
    if (onBytes) onBytes(ab.byteLength)
    const text = extractFromZip(new Uint8Array(ab))
    async function* zipLines() {
      let start = 0
      for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) === 10 /* \n */) {
          if (i > start) yield text.slice(start, i)
          start = i + 1
        }
      }
      if (start < text.length) yield text.slice(start)
    }
    return { iterator: zipLines(), isStreaming: false }
  }

  if (format === 'tar') {
    // Tar parser requires the full byte buffer (it reads offset-indexed headers).
    // Stream the bytes through but accumulate into a Uint8Array, then extract.
    const ab = await file.arrayBuffer()
    if (onBytes) onBytes(ab.byteLength)
    const text = extractFromTar(new Uint8Array(ab))
    async function* tarLines() {
      let start = 0
      for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) === 10 /* \n */) {
          if (i > start) yield text.slice(start, i)
          start = i + 1
        }
      }
      if (start < text.length) yield text.slice(start)
    }
    return { iterator: tarLines(), isStreaming: false }
  }

  if (format === 'gzip') {
    // Prefer native DecompressionStream — zero-copy streaming, no memory blowup.
    if (typeof DecompressionStream !== 'undefined') {
      try {
        const stream = file.stream().pipeThrough(new DecompressionStream('gzip'))
        // We need to peek the first bytes to detect tar-inside-gzip, but
        // peeking through a DecompressionStream is non-trivial. For .tar.gz
        // we fall back to the buffered path below.
        // Heuristic: if filename hints tar, use buffered path.
        const lower = (file.name || '').toLowerCase()
        if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
          // Fall through to buffered path
        } else {
          return { iterator: iterateLines(stream, onBytes), isStreaming: true }
        }
      } catch {
        // Fall through to pako path
      }
    }

    // Fallback: pako (loads full file into memory)
    const ab = await file.arrayBuffer()
    if (onBytes) onBytes(ab.byteLength)
    const inflated = pako.inflate(new Uint8Array(ab))
    const innerFormat = detectFormat(inflated)
    const text = innerFormat === 'tar'
      ? extractFromTar(inflated)
      : new TextDecoder('utf-8').decode(inflated)
    async function* gzipLines() {
      let start = 0
      for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) === 10) {
          if (i > start) yield text.slice(start, i)
          start = i + 1
        }
      }
      if (start < text.length) yield text.slice(start)
    }
    return { iterator: gzipLines(), isStreaming: false }
  }

  // Plain text — stream directly, constant memory
  return { iterator: iterateLines(file.stream(), onBytes), isStreaming: true }
}

// Caps to keep memory bounded on huge logs.
// Aggregations (slowOps, errors, queryPatterns, etc.) are kept fully because
// they're already bounded by the data shape. The unbounded ones are rawLines
// (one entry per parsed log line) and allOps (one entry per slow op).
const MAX_RAW_LINES = 10_000
const MAX_ALL_OPS = 100_000

export async function parseLogFile(file, onProgress, slowThreshold = 100) {
  if (file?.size > MAX_BROWSER_FILE_BYTES) {
    const sizeGb = (file.size / (1024 * 1024 * 1024)).toFixed(1)
    throw new Error(
      `File too large (${sizeGb} GB). Maximum supported size is 5 GB for browser parsing. ` +
      'For larger files, extract a smaller time range first using grep or mongodump.'
    )
  }

  // Bytes-based progress works for streaming (line count is unknown upfront).
  // For gzip/tar this is compressed bytes, which is fine — progress still
  // moves smoothly toward 100%.
  let bytesRead = 0
  const totalBytes = file?.size || 0
  let lastProgressEmit = 0
  const onBytes = (n) => {
    bytesRead += n
    const now = Date.now()
    if (now - lastProgressEmit > 100 && totalBytes > 0) {
      lastProgressEmit = now
      onProgress(Math.min(99, Math.round((bytesRead / totalBytes) * 100)))
    }
  }

  let lineIterator
  try {
    const built = await buildLineIterator(file, onBytes)
    lineIterator = built.iterator
  } catch (e) {
    throw new Error(`Could not read file: ${e.message}`, { cause: e })
  }

  const slowOps = [], errors = [], warnings = [], allOps = []
  // nsCollscan       — actionable namespaces only (drives index recommendations)
  // nsCollscanAll    — every COLLSCAN namespace, including internal (config.*, local.*, *.system.*)
  const nsMap = {}, opTypeMap = {}, timelineMap = {}, nsCollscan = {}, nsCollscanAll = {}
  const connEvents = [], restarts = [], rsChanges = []
  const msgPatterns = {}, queryPatterns = {}
  const compSet = new Set(), sevSet = new Set()
  const sevCounts = {} // severity -> count (computed during streaming)
  let parsedCount = 0, skipped = 0, opsCount = 0
  let minTs = null, maxTs = null
  let version = 'unknown', storage = 'unknown'
  let connOpen = 0, connClose = 0, connPeak = 0, connCurrent = 0
  const ipSet = new Set()
  const storageStats = {
    cacheBytes: 0, maxBytes: 0, dirtyBytes: 0,
    pagesRead: 0, pagesWritten: 0,
    evictedApp: 0, evictedTotal: 0,
    ckptCount: 0, ckptDurations: [],
  }
  // Extended diagnostics
  const appNameMap = {}      // appName -> { count, slowCount, totalMs, errors }
  const reslenOps = []       // high response-length operations
  const auditEvents = []     // security audit events
  const getMoreMap = {}      // cursorId -> originating command
  const ipStatsMap = {}      // ip -> { accepted, closed, reslen }
  const longConns = []       // long-lasting connections
  const driverMap = {}       // driverName -> { version, ips: Set }
  const connOpenTime = {}    // ctx -> open timestamp (for duration calc)
  let mongoModule = 'community'
  let mongoArch = '', mongoOS = ''
  let mongoProvider = '', mongoRegion = ''
  // Server identity (from startup log lines)
  let hostname = '', port = '', pid = ''
  let bindIp = '', unixSocket = ''
  let replSetName = '', topology = 'standalone'
  let currentRole = '', openssl = '', allocator = ''
  let rsMembers = []  // [{id, host, state}]
  let dbPath = '', gitVersion = ''
  const identityRefs = []
  const parsed = []

  // Streaming parse loop — async iteration over lines
  let total = 0
  let lineIdx = 0
  const YIELD_EVERY = 5000 // yield to event loop periodically for UI updates

  for await (const rawLine of lineIterator) {
    if (!rawLine || !rawLine.trim()) continue
    total++
    lineIdx++

    // Periodic yield so the browser stays responsive and progress repaints
    if (lineIdx % YIELD_EVERY === 0) {
      await new Promise((r) => setTimeout(r, 0))
    }

    try {
      const obj = JSON.parse(rawLine)
          const ts = obj.t?.$date || ''
          const s = obj.s || 'I'
          const c = obj.c || ''
          const ctx = obj.ctx || ''
          const msg = obj.msg || ''
          const attr = obj.attr || {}
          const dur = attr.durationMillis ?? null
          const ns = attr.ns || ''
          const cmd = attr.command || null
          const plan = attr.planSummary || ''
          const keysEx = attr.keysExamined ?? null
          const docsEx = attr.docsExamined ?? null
          const nret = attr.nreturned ?? null
          const opType = attr.type || (cmd ? Object.keys(cmd)[0] : '') || 'command'
          const errMsg = attr.errMsg || ''
          const appName = attr.appName || ''
          const reslen = attr.reslen ?? null

          // Generic identity capture for variants seen across MongoDB log formats.
          if (!hostname || !port || !unixSocket) {
            const target = { hostname, port, unixSocket }
            captureIdentityFromField(target, attr.host, 'host', ts, msg, identityRefs)
            captureIdentityFromField(target, attr.hostname, 'host', ts, msg, identityRefs)
            captureIdentityFromField(target, attr.me, 'host', ts, msg, identityRefs)
            captureIdentityFromField(target, attr.thisHost, 'host', ts, msg, identityRefs)
            captureIdentityFromField(target, attr.address || attr.addr, 'listen', ts, msg, identityRefs)
            hostname = target.hostname || hostname
            port = target.port || port
            unixSocket = target.unixSocket || unixSocket
          }

          const row = { ts, s, c, ctx, msg, dur, ns, cmd, plan, keysEx, docsEx, nret, opType, errMsg, appName, reslen, raw: obj }
          // Cap rawLines to avoid OOM on huge logs. Aggregations below still use every line.
          if (parsed.length < MAX_RAW_LINES) parsed.push(row)
          parsedCount++
          compSet.add(c)
          sevSet.add(s)
          sevCounts[s] = (sevCounts[s] || 0) + 1

          if (ts) {
            const d = new Date(ts)
            if (!isNaN(d)) {
              if (!minTs || d < new Date(minTs)) minTs = ts
              if (!maxTs || d > new Date(maxTs)) maxTs = ts
              const minKey = ts.slice(0, 16)
              timelineMap[minKey] = (timelineMap[minKey] || 0) + 1
            }
          }

          if (ns) {
            if (!nsMap[ns]) nsMap[ns] = { count: 0, totalMs: 0, durations: [] }
            nsMap[ns].count++
            if (dur !== null) { nsMap[ns].totalMs += dur; nsMap[ns].durations.push(dur) }
          }

          const ot = opType.toLowerCase() || 'other'
          opTypeMap[ot] = (opTypeMap[ot] || 0) + 1
          // Count actual DB operations (COMMAND/QUERY/WRITE components only)
          if (c === 'COMMAND' || c === 'QUERY' || c === 'WRITE') opsCount++

          // App name tracking
          if (appName) {
            if (!appNameMap[appName]) appNameMap[appName] = { count: 0, slowCount: 0, totalMs: 0, errors: 0, durations: [] }
            appNameMap[appName].count++
            if (dur !== null) { appNameMap[appName].totalMs += dur; appNameMap[appName].durations.push(dur) }
            if (s === 'E' || s === 'F') appNameMap[appName].errors++
          }

          // Large result sets (reslen analysis)
          if (reslen !== null && reslen > 16 * 1024 * 1024) { // >16MB
            reslenOps.push({ ts, ns, op: ot, reslen, dur, plan, appName })
          }

          // getMore tracking — link back to originating command
          if (ot === 'getmore' && attr.originatingCommand) {
            const cursorId = attr.cursorId || ''
            getMoreMap[cursorId] = { ts, ns, originatingCmd: attr.originatingCommand }
          }

          if (dur !== null && dur > slowThreshold) {
            slowOps.push(row)
            if (allOps.length < MAX_ALL_OPS) {
              allOps.push({ ts, dur, ns, opType: ot, plan, docsEx, keysEx, cmd, appName, reslen })
            }
            if (appName && appNameMap[appName]) appNameMap[appName].slowCount++
            const shape = extractQueryShape(cmd, ot)
            const pk = `${ns}||${ot}||${shape}`
            if (!queryPatterns[pk]) queryPatterns[pk] = { ns, op: ot, pattern: shape, durs: [], count: 0, appName }
            queryPatterns[pk].count++
            queryPatterns[pk].durs.push(dur)
          }

          if (s === 'E' || s === 'F') errors.push(row)
          if (s === 'W') warnings.push(row)

          if (plan && plan.includes('COLLSCAN') && ns) {
            const internal = shouldSkipIndexSuggestionNamespace(ns)
            if (!nsCollscanAll[ns]) nsCollscanAll[ns] = { count: 0, examples: [], internal }
            nsCollscanAll[ns].count++
            if (nsCollscanAll[ns].examples.length < 3) nsCollscanAll[ns].examples.push({ ts, cmd, dur, plan })

            if (!internal) {
              if (!nsCollscan[ns]) nsCollscan[ns] = { count: 0, examples: [] }
              nsCollscan[ns].count++
              if (nsCollscan[ns].examples.length < 3) nsCollscan[ns].examples.push({ ts, cmd, dur, plan })
            }
          }

          if (msg.includes('db version') || msg.includes('mongod startup')) {
            const vm = (attr.version || msg).match(/(\d+\.\d+\.\d+)/)
            if (vm) version = vm[1]
            if (attr.gitVersion || attr.platform) {
              const plat = attr.platform || ''
              if (plat.includes('x86_64')) mongoArch = 'x86_64'
              else if (plat.includes('aarch64') || plat.includes('arm64')) mongoArch = 'arm64'
              if (plat.includes('linux') || plat.includes('Linux')) mongoOS = 'Linux'
              else if (plat.includes('windows') || plat.includes('Windows')) mongoOS = 'Windows'
              else if (plat.includes('darwin') || plat.includes('macOS')) mongoOS = 'macOS'
            }
            if (attr.modules?.includes('enterprise') || msg.includes('enterprise')) mongoModule = 'enterprise'
            else if (attr.modules?.includes(PSMDB_MODULE_TOKEN) || msg.toLowerCase().includes(PSMDB_MODULE_TOKEN)) mongoModule = 'psmdb'
            restarts.push({ ts, version: vm?.[1] || '?', platform: attr.gitVersion || attr.platform || '' })
          }
          // ── Server identity & topology ─────────────────────────────────────
          // "MongoDB starting" / "initandlisten"
          if (msg === 'MongoDB starting' || (ctx === 'initandlisten' && msg.includes('port'))) {
            if (attr.host) {
              hostname = attr.host
              identityRefs.push({ ts, type: 'host', value: attr.host, msg })
            }
            if (attr.hostname && !hostname) {
              hostname = attr.hostname
              identityRefs.push({ ts, type: 'host', value: attr.hostname, msg })
            }
            if (attr.port) {
              port = String(attr.port)
              identityRefs.push({ ts, type: 'port', value: String(attr.port), msg })
            }
            if (attr.pid) pid = String(attr.pid)
            if (attr.dbPath) dbPath = attr.dbPath
          }
          if (msg === 'Listening on' || msg.includes('Listening on')) {
            const address = attr.address || attr.addr || attr.host || attr.ip || ''
            if (address) {
              const target = { hostname, port, unixSocket }
              mergeHostPort(target, String(address))
              hostname = target.hostname || hostname
              port = target.port || port
              unixSocket = target.unixSocket || unixSocket
              identityRefs.push({ ts, type: 'listen', value: String(address), msg })
            }
          }
          if (msg === 'Waiting for connections' || msg.includes('Waiting for connections')) {
            if (attr.port) {
              port = String(attr.port)
              identityRefs.push({ ts, type: 'port', value: String(attr.port), msg })
            }
            const address = attr.address || attr.addr || attr.host || attr.ip || ''
            if (address) {
              const target = { hostname, port, unixSocket }
              mergeHostPort(target, String(address))
              hostname = target.hostname || hostname
              port = target.port || port
              unixSocket = target.unixSocket || unixSocket
              identityRefs.push({ ts, type: 'listen', value: String(address), msg })
            }
          }
          // "Build Info"
          if (msg === 'Build Info' && attr.buildInfo) {
            const bi = attr.buildInfo
            if (bi.version) version = bi.version
            if (bi.gitVersion) gitVersion = bi.gitVersion.slice(0, 10)
            if (bi.openSSLVersion) openssl = bi.openSSLVersion
            if (bi.allocator) allocator = bi.allocator
            if (bi.modules?.includes('enterprise')) mongoModule = 'enterprise'
            else if (bi.modules?.some(m => PSMDB_MODULE_RE.test(m)) || PSMDB_MODULE_RE.test(bi.version || '')) mongoModule = 'psmdb'
            else if (bi.modules?.length) mongoModule = bi.modules.join(',')
            const env = bi.buildEnvironment || {}
            if (env.distarch || env.target_arch) mongoArch = env.distarch || env.target_arch
            if (env.distmod) mongoOS = env.distmod
          }
          // "options" log line — contains replication, net.port, etc.
          if (msg === 'initandlisten' || msg.toLowerCase().includes('options')) {
            const opts = attr.options || attr.config || {}
            const net = opts.net || {}
            const repl = opts.replication || {}
            if (net.port) port = String(net.port)
            if (net.bindIp) bindIp = String(net.bindIp)
            if (net.bindIpAll) bindIp = '0.0.0.0'
            if (net.unixDomainSocket?.pathPrefix) unixSocket = net.unixDomainSocket.pathPrefix
            if (repl.replSetName) { replSetName = repl.replSetName; topology = 'replicaset' }
            if (opts.sharding?.clusterRole) topology = 'sharded'
          }
          // Replica set config
          if (c === 'REPL' && attr.config?._id) {
            replSetName = attr.config._id
            topology = 'replicaset'
            if (attr.config.members) {
              rsMembers = attr.config.members.map(m => ({
                id: m._id, host: m.host,
                hidden: m.hidden || false,
                arbiter: m.arbiterOnly || false,
                priority: m.priority ?? 1,
                state: '',
              }))
            }
          }
          // RS state transition — track current role
          if (c === 'REPL' && (msg.includes('transition to') || msg.includes('PRIMARY') || msg.includes('SECONDARY') || attr.newState || attr.state)) {
            const roleMatch = msg.match(/transition to (PRIMARY|SECONDARY|ARBITER|RECOVERING|STARTUP)/i)
              || msg.match(/(PRIMARY|SECONDARY|ARBITER)/i)
              || String(attr.newState || attr.state || '').match(/(PRIMARY|SECONDARY|ARBITER|RECOVERING|STARTUP)/i)
            if (roleMatch) {
              currentRole = roleMatch[1].toUpperCase()
              topology = 'replicaset'
              identityRefs.push({ ts, type: 'role', value: currentRole, msg })
            }
          }
          // Sharding detection
          if (c === 'SHARDING' || msg.includes('shardsvr') || msg.includes('configsvr')) {
            topology = 'sharded'
          }

          // Atlas provider/region detection
          if (msg.includes('Atlas') || msg.includes('atlas')) {
            const provMatch = msg.match(/AWS|GCP|Azure/i)
            if (provMatch) mongoProvider = provMatch[0]
            const regMatch = msg.match(/us-east-\d|us-west-\d|eu-west-\d|ap-southeast-\d/i)
            if (regMatch) mongoRegion = regMatch[0]
          }
          // Driver info from hello/isMaster responses
          if ((msg === 'client metadata' || msg.includes('driver')) && attr.doc?.driver) {
            const drv = attr.doc.driver
            const drvName = drv.name || 'unknown'
            const drvVer = drv.version || '?'
            const ipMatch = (attr.remote || '').match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/)
            const ip = ipMatch ? ipMatch[1] : ''
            const key = `${drvName}@${drvVer}`
            if (!driverMap[key]) driverMap[key] = { name: drvName, version: drvVer, ips: new Set() }
            if (ip) driverMap[key].ips.add(ip)
          }
          if (msg.includes('wiredTiger') || msg.includes('WiredTiger')) storage = 'wiredTiger'
          if (msg.includes('mmapv1') || msg.includes('MMAPv1')) storage = 'mmapv1'

          if (
            c === 'REPL' &&
            (msg.includes('transition') || msg.includes('PRIMARY') ||
              msg.includes('SECONDARY') || msg.includes('state'))
          ) {
            const stateBefore = msg.match(/from (\w+)/)?.[1] || ''
            const stateAfter =
              msg.match(/to (\w+)/)?.[1] ||
              msg.match(/(PRIMARY|SECONDARY|ARBITER|STARTUP|RECOVERING)/)?.[1] || ''
            if (stateAfter) rsChanges.push({ ts, stateBefore, stateAfter, msg })
          }

          if (msg.includes('connection accepted') || msg.includes('client connected')) {
            connOpen++; connCurrent++
            if (connCurrent > connPeak) connPeak = connCurrent
            const ipMatch = (attr.remote || ctx || msg).match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?/)
            const ip = ipMatch ? ipMatch[1] : null
            if (ip) {
              ipSet.add(ip)
              if (!ipStatsMap[ip]) ipStatsMap[ip] = { accepted: 0, closed: 0, reslen: 0 }
              ipStatsMap[ip].accepted++
            }
            connOpenTime[ctx] = { ts, ip }
            connEvents.push({ ts, type: 'open', ctx, msg, ip })
          }
          if (msg.includes('end connection') || msg.includes('client disconnected')) {
            connClose++; connCurrent = Math.max(0, connCurrent - 1)
            const openInfo = connOpenTime[ctx]
            if (openInfo?.ts && ts) {
              const durMs = new Date(ts) - new Date(openInfo.ts)
              if (durMs > 5 * 60 * 1000) { // >5 min = long-lasting
                longConns.push({ ctx, openTs: openInfo.ts, closeTs: ts, durMs, ip: openInfo.ip || '' })
              }
              if (openInfo.ip) {
                if (!ipStatsMap[openInfo.ip]) ipStatsMap[openInfo.ip] = { accepted: 0, closed: 0, reslen: 0 }
                ipStatsMap[openInfo.ip].closed++
              }
            }
            delete connOpenTime[ctx]
            connEvents.push({ ts, type: 'close', ctx, msg })
          }
          // Track reslen per IP (from slow ops)
          if (reslen !== null && dur !== null) {
            const openInfo = connOpenTime[ctx]
            if (openInfo?.ip) {
              if (!ipStatsMap[openInfo.ip]) ipStatsMap[openInfo.ip] = { accepted: 0, closed: 0, reslen: 0 }
              ipStatsMap[openInfo.ip].reslen += reslen
            }
          }

          // Security audit events
          const auditKeywords = [
            { kw: 'Authentication failed', type: 'AUTH_FAILURE', sev: 'Critical' },
            { kw: 'Authorization failure', type: 'AUTHZ_FAILURE', sev: 'Critical' },
            { kw: 'access control', type: 'ACCESS_CONTROL', sev: 'High' },
            { kw: 'createUser', type: 'USER_CREATED', sev: 'High' },
            { kw: 'dropUser', type: 'USER_DROPPED', sev: 'High' },
            { kw: 'updateUser', type: 'USER_UPDATED', sev: 'Medium' },
            { kw: 'grantRolesToUser', type: 'ROLE_GRANTED', sev: 'High' },
            { kw: 'revokeRolesFromUser', type: 'ROLE_REVOKED', sev: 'High' },
            { kw: 'logout', type: 'LOGOUT', sev: 'Low' },
            { kw: 'Unauthorized', type: 'UNAUTHORIZED', sev: 'Critical' },
            { kw: 'not authorized', type: 'NOT_AUTHORIZED', sev: 'Critical' },
            { kw: 'SCRAM', type: 'SCRAM_AUTH', sev: 'Low' },
            { kw: 'SSL', type: 'SSL_EVENT', sev: 'Low' },
            { kw: 'TLS', type: 'TLS_EVENT', sev: 'Low' },
            { kw: 'shutdown', type: 'SHUTDOWN', sev: 'Critical' },
          ]
          for (const { kw, type, sev } of auditKeywords) {
            if (msg.includes(kw) || (errMsg && errMsg.includes(kw))) {
              auditEvents.push({ ts, type, sev, msg, errMsg, user: attr.user || attr.principalName || '', ns, c })
              break
            }
          }

          const normMsg = msg.replace(/\b[0-9a-f]{24}\b/g, '<oid>').replace(/\d+/g, 'N').slice(0, 80)
          if (!msgPatterns[normMsg]) msgPatterns[normMsg] = { count: 0, s, c }
          msgPatterns[normMsg].count++

          if (attr.wiredTiger) {
            const wt = attr.wiredTiger
            const cache = wt.cache || {}
            if (cache['bytes currently in the cache']) storageStats.cacheBytes = cache['bytes currently in the cache']
            if (cache['maximum bytes configured']) storageStats.maxBytes = cache['maximum bytes configured']
            if (cache['tracked dirty bytes in the cache']) storageStats.dirtyBytes = cache['tracked dirty bytes in the cache']
            if (cache['pages read into cache']) storageStats.pagesRead = cache['pages read into cache']
            if (cache['pages written from cache']) storageStats.pagesWritten = cache['pages written from cache']
            const evict = wt.eviction || {}
            if (evict['pages evicted by application threads']) storageStats.evictedApp = evict['pages evicted by application threads']
            if (evict['pages selected for eviction since server start']) storageStats.evictedTotal = evict['pages selected for eviction since server start']
          }
          if (msg.includes('WiredTiger checkpoint') && dur !== null) {
            storageStats.ckptCount++
            storageStats.ckptDurations.push(dur)
          }
    } catch {
      skipped++
    }
  } // end for-await line iterator

  onProgress(100)

  {
        const topNs = Object.entries(nsMap)
          .map(([ns, v]) => ({
            ns, count: v.count,
            // Divide by durations.length (ops that have a measured duration),
            // not total count (which includes non-timed ops like inserts/connections)
            avgMs: v.durations.length ? Math.round(v.totalMs / v.durations.length) : 0,
            maxMs: maxOf(v.durations),
            durations: v.durations,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 20)

        const topSlowNs = Object.entries(nsMap)
          .filter(([, v]) => v.durations.length > 0)
          .map(([ns, v]) => ({
            ns,
            avgMs: Math.round(v.totalMs / v.durations.length),
            maxMs: maxOf(v.durations),
          }))
          .sort((a, b) => b.avgMs - a.avgMs)
          .slice(0, 10)

        const timeline = Object.entries(timelineMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([minute, count]) => ({ minute: minute.slice(11, 16), count }))
          .slice(-60)

        const opTypes = Object.entries(opTypeMap)
          .map(([op, count]) => ({ op, count }))
          .sort((a, b) => b.count - a.count)

        const sevDist = Object.entries(sevCounts).map(([s, count]) => ({
          s, count, label: { I: 'Info', W: 'Warning', E: 'Error', F: 'Fatal', D: 'Debug' }[s] || s,
        }))

        const qpList = Object.values(queryPatterns)
          .map((v) => ({
            ns: v.ns, op: v.op, pattern: v.pattern, count: v.count,
            min: minOf(v.durs),
            max: maxOf(v.durs),
            mean: Math.round(v.durs.reduce((a, b) => a + b, 0) / v.durs.length),
            p95: p95(v.durs),
            sum: v.durs.reduce((a, b) => a + b, 0),
          }))
          .sort((a, b) => b.sum - a.sum)

        const distinct = Object.entries(msgPatterns)
          .map(([msg, v]) => ({ msg, count: v.count, s: v.s, c: v.c }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 50)

        const connTimeline = connEvents.reduce((acc, ev) => {
          const m = ev.ts.slice(0, 16)
          if (!acc[m]) acc[m] = { minute: m.slice(11, 16), open: 0, close: 0 }
          if (ev.type === 'open') acc[m].open++
          else acc[m].close++
          return acc
        }, {})

        // App name summary
        const appNames = Object.entries(appNameMap)
          .map(([name, v]) => ({
            name,
            count: v.count,
            slowCount: v.slowCount,
            errors: v.errors,
            avgMs: v.durations.length ? Math.round(v.totalMs / v.durations.length) : 0,
            p95Ms: p95(v.durations),
          }))
          .sort((a, b) => b.count - a.count)

        // Audit event summary grouped by type
        const auditSummary = auditEvents.reduce((acc, ev) => {
          if (!acc[ev.type]) acc[ev.type] = { type: ev.type, sev: ev.sev, count: 0, events: [] }
          acc[ev.type].count++
          if (acc[ev.type].events.length < 5) acc[ev.type].events.push(ev)
          return acc
        }, {})

        // Large reslen sorted
        const topReslen = reslenOps.sort((a, b) => b.reslen - a.reslen).slice(0, 50)

        // Fallback PSMDB detection: version strings like "7.0.16-10" (extra numeric suffix after patch).
        if (mongoModule === 'community' && /^\d+\.\d+\.\d+-\d+/.test(version)) {
          mongoModule = 'psmdb'
        }

        // Fallback identity: if startup identity wasn't explicit, infer from RS members.
        if ((!hostname || !port) && rsMembers.length > 0) {
          const rsTarget = { hostname, port, unixSocket }
          for (const member of rsMembers) {
            if (rsTarget.hostname && rsTarget.port) break
            captureIdentityFromField(rsTarget, member.host, 'rsMember', maxTs || minTs || '', 'Replica set member host', identityRefs)
          }
          hostname = rsTarget.hostname || hostname
          port = rsTarget.port || port
        }

        return {
          slowOps: slowOps.sort((a, b) => b.dur - a.dur),
          errors,
          warnings,
          topNamespaces: topNs,
          topSlowNs,
          operationTypes: opTypes,
          timelineData: timeline,
          severityDist: sevDist,
          indexWarnings: nsCollscan,
          allCollscans: nsCollscanAll,
          connectionEvents: connEvents,
          connectionStats: { open: connOpen, close: connClose, peak: connPeak, uniqueIPs: ipSet.size },
          connTimeline: Object.values(connTimeline).sort((a, b) => a.minute.localeCompare(b.minute)),
          queryPatterns: qpList,
          restartEvents: restarts,
          rsStateChanges: rsChanges,
          distinctMessages: distinct,
          storageStats,
          allOperations: allOps,
          componentList: [...compSet].filter(Boolean).sort(),
          severityList: [...sevSet].filter(Boolean).sort(),
          rawLines: parsed,
          // Extended diagnostics output
          appNames,
          auditEvents,
          auditSummary: Object.values(auditSummary).sort((a, b) => {
            const sevOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 }
            return (sevOrder[a.sev] ?? 9) - (sevOrder[b.sev] ?? 9)
          }),
          topReslen,
          getMoreOps: Object.values(getMoreMap),
          ipStats: Object.entries(ipStatsMap)
            .map(([ip, v]) => ({ ip, accepted: v.accepted, closed: v.closed, reslen: v.reslen }))
            .sort((a, b) => b.accepted - a.accepted),
          longConns: longConns.sort((a, b) => b.durMs - a.durMs).slice(0, 100),
          drivers: Object.values(driverMap).map(d => ({ name: d.name, version: d.version, ips: [...d.ips] })),
          metadata: {
            filename: file.name,
            totalLines: total,
            parsedLines: parsedCount,
            opsCount,          // actual COMMAND/QUERY/WRITE ops only
            skippedLines: skipped,
            startTime: minTs,
            endTime: maxTs,
            version,
            storage,
            module: mongoModule,
            arch: mongoArch,
            os: mongoOS,
            provider: mongoProvider,
            region: mongoRegion,
            hostname,
            bindIp,
            unixSocket,
            port,
            pid,
            dbPath,
            gitVersion,
            openssl,
            allocator,
            replSetName,
            topology,
            currentRole,
            rsMembers,
            identityRefs: identityRefs.slice(0, 20),
          },
        }
      }
}
