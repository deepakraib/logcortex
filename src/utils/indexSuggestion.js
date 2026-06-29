/**
 * Derive MongoDB createIndex suggestions from slow-query / COLLSCAN log commands.
 * Filters out wire-protocol and command metadata (getMore, lsid, $db, etc.).
 */

const COMMAND_META_KEYS = new Set([
  '$db',
  '$clusterTime',
  '$readPreference',
  '$audit',
  'comment',
  'getMore',
  'collection',
  'lsid',
  'maxTimeMS',
  'maxTimeMSOpOnly',
  'mayBypassWriteBlocking',
  'batchSize',
  'singleBatch',
  'limit',
  'skip',
  'sort',
  'projection',
  'hint',
  'readConcern',
  'writeConcern',
  'cursor',
  'exhaust',
  'allowDiskUse',
  'collation',
  'let',
  'apiVersion',
  'apiStrict',
  'apiDeprecationErrors',
  'maxAwaitTimeMS',
  'tailable',
  'awaitData',
  'term',
  'autoResumeAfter',
  'startAtOperationTime',
  'startAfter',
  'pipeline',
  'updates',
  'deletes',
  'ordered',
  'bypassDocumentValidation',
  'find',
  'aggregate',
  'count',
  'distinct',
  'update',
  'delete',
  'remove',
  'findAndModify',
  'insert',
  'explain',
  'writeErrors',
  'writeConcernErrors',
  'ok',
  'errmsg',
  'code',
  'codeName',
])

function parseCmd(cmd) {
  if (!cmd) return null
  if (typeof cmd === 'string') {
    try {
      return JSON.parse(cmd)
    } catch {
      return null
    }
  }
  return typeof cmd === 'object' ? cmd : null
}

/**
 * Infer operation type from a MongoDB command document.
 */
export function inferOpTypeFromCommand(cmd) {
  const c = parseCmd(cmd)
  if (!c) return 'command'
  if (c.find !== undefined) return 'find'
  if (c.aggregate !== undefined) return 'aggregate'
  if (c.count !== undefined) return 'count'
  if (c.distinct !== undefined) return 'distinct'
  if (c.update !== undefined) return 'update'
  if (c.delete !== undefined || c.remove !== undefined) return 'delete'
  if (c.findAndModify !== undefined) return 'findandmodify'
  if (c.getMore !== undefined) return 'getmore'
  return 'command'
}

/**
 * Resolve the command that carries the query filter for COLLSCAN examples.
 * getMore lines store cursor metadata in `command`; the filter lives in
 * `originatingCommand` on the same log entry.
 */
export function resolveCollscanCommand(attr = {}, cmd, opType = '', getMoreMap = {}) {
  const ot = String(opType || '').toLowerCase()
  if (ot === 'getmore') {
    if (attr.originatingCommand) {
      return {
        cmd: attr.originatingCommand,
        opType: inferOpTypeFromCommand(attr.originatingCommand),
      }
    }
    const cursorId = String(
      attr.cursorId ??
      attr.command?.getMore?.$numberLong ??
      attr.command?.getMore ??
      '',
    )
    if (cursorId && getMoreMap[cursorId]?.originatingCmd) {
      const oc = getMoreMap[cursorId].originatingCmd
      return { cmd: oc, opType: inferOpTypeFromCommand(oc) }
    }
    return { cmd, opType: 'getmore' }
  }
  return { cmd, opType: ot || inferOpTypeFromCommand(cmd) }
}

/**
 * Extract the query filter object from a MongoDB command.
 */
export function extractQueryFilter(cmd, opType = '') {
  const c = parseCmd(cmd)
  if (!c) return null

  const op = String(opType || inferOpTypeFromCommand(c)).toLowerCase()
  let query = null

  if (op === 'aggregate') {
    const pipeline = c.pipeline || c.aggregate?.pipeline || []
    const stages = Array.isArray(pipeline) ? pipeline : []
    const matchStage = stages.find((s) => s && s.$match)
    query = matchStage ? matchStage.$match : stages[0] || {}
  } else if (op === 'find' || op === 'count') {
    query = c.filter ?? c.query ?? c.q ?? null
  } else if (op === 'update' || op === 'findandmodify') {
    query =
      c.filter ??
      c.query ??
      c.q ??
      (Array.isArray(c.updates) ? c.updates[0]?.q : null) ??
      null
  } else if (op === 'delete' || op === 'remove') {
    query =
      c.filter ??
      c.q ??
      (Array.isArray(c.deletes) ? c.deletes[0]?.q : null) ??
      null
  } else if (op === 'distinct') {
    return c.key ? { [String(c.key)]: 1 } : null
  } else if (op === 'getmore') {
    return null
  } else {
    query = c.filter ?? c.query ?? c.q ?? null
  }

  if (query && typeof query === 'object' && !Array.isArray(query)) {
    if (query.$query && typeof query.$query === 'object') query = query.$query
    else if (query.query && typeof query.query === 'object' && !query.filter) query = query.query
    return query
  }
  return null
}

function collectFilterFields(obj, depth = 0, out = new Set()) {
  if (!obj || typeof obj !== 'object' || depth > 6) return out
  if (Array.isArray(obj)) {
    for (const item of obj) collectFilterFields(item, depth + 1, out)
    return out
  }

  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith('$')) {
      if (key === '$or' || key === '$and' || key === '$nor') {
        if (Array.isArray(val)) {
          for (const sub of val) collectFilterFields(sub, depth + 1, out)
        }
      }
      continue
    }
    if (key !== '_id' && !COMMAND_META_KEYS.has(key)) out.add(key)
    if (val && typeof val === 'object' && !Array.isArray(val) && !key.startsWith('$')) {
      collectFilterFields(val, depth + 1, out)
    }
  }
  return out
}

/**
 * Collect depth-1 key names from a (possibly partial) brace block in a
 * MongoDB-shell-style string, starting at the index of the opening `{`.
 */
function collectTruncatedKeys(text, braceIdx, out) {
  let depth = 0
  let expectKey = false
  let inStr = null

  for (let i = braceIdx; i < text.length; i++) {
    const ch = text[i]

    if (inStr) {
      if (ch === '\\') { i++; continue }
      if (ch === inStr) inStr = null
      continue
    }

    if (ch === '"' || ch === "'") {
      if (depth === 1 && expectKey) {
        const close = text.indexOf(ch, i + 1)
        if (close === -1) return
        const key = text.slice(i + 1, close)
        if (key && key !== '_id' && !key.startsWith('$') && !COMMAND_META_KEYS.has(key)) out.add(key)
        expectKey = false
        i = close
        continue
      }
      inStr = ch
      continue
    }

    if (ch === '{') { depth++; if (depth === 1) expectKey = true; continue }
    if (ch === '[') { depth++; continue }
    if (ch === '}') { depth--; if (depth === 0) return; continue }
    if (ch === ']') { depth--; continue }

    if (depth === 1) {
      if (ch === ',') { expectKey = true; continue }
      if (expectKey && /[A-Za-z_]/.test(ch)) {
        const m = text.slice(i).match(/^([A-Za-z_][\w.]*)\s*:/)
        if (m) {
          const key = m[1]
          if (key !== '_id' && !COMMAND_META_KEYS.has(key)) out.add(key)
          expectKey = false
          i += m[1].length - 1
          continue
        }
      }
    }
  }
}

/**
 * Recover filter field names from a truncated command string that MongoDB
 * emits when a command document is too large to log in full ($truncated).
 */
export function extractFieldsFromTruncated(text) {
  if (typeof text !== 'string' || !text) return []
  const out = new Set()
  const anchors = [/\bfilter\s*:\s*\{/g, /\$match\s*:\s*\{/g, /\bq\s*:\s*\{/g, /\bquery\s*:\s*\{/g]
  for (const re of anchors) {
    let m
    while ((m = re.exec(text)) !== null) {
      collectTruncatedKeys(text, m.index + m[0].length - 1, out)
    }
  }
  return [...out].sort()
}

function findTruncatedString(c) {
  if (!c || typeof c !== 'object') return null
  if (typeof c.$truncated === 'string') return c.$truncated
  if (typeof c.command?.$truncated === 'string') return c.command.$truncated
  return null
}

/**
 * Return sorted field names suitable for a compound index spec.
 */
export function extractIndexableFields(cmd, opType = '') {
  const filter = extractQueryFilter(cmd, opType)
  if (filter) {
    const fields = [...collectFilterFields(filter)].sort()
    if (fields.length) return fields
  }
  const truncated = findTruncatedString(parseCmd(cmd))
  if (truncated) {
    const fields = extractFieldsFromTruncated(truncated)
    if (fields.length) return fields
  }
  return filter ? [...collectFilterFields(filter)].sort() : []
}

function buildIndexSpec(fields) {
  const spec = {}
  for (const f of fields) spec[f] = 1
  return spec
}

/**
 * Extract indexable field names from a normalized query pattern string
 * (as produced by parseLogFile extractQueryShape).
 */
export function extractFieldsFromQueryPattern(patternStr = '') {
  const text = String(patternStr || '').trim()
  if (!text || text === '{}') return []

  const distinct = text.match(/^\{\s*key:\s*"([^"]+)"\s*\}$/)
  if (distinct) return [distinct[1]]

  try {
    const obj = JSON.parse(text)
    return [...collectFilterFields(obj)].sort()
  } catch {
    const fields = new Set()
    for (const m of text.matchAll(/"(\$?\w+)":/g)) {
      const key = m[1]
      if (key !== '_id' && !key.startsWith('$') && !COMMAND_META_KEYS.has(key)) fields.add(key)
    }
    return [...fields].sort()
  }
}

function collectFieldsFromExamples(examples, out = new Set()) {
  for (const ex of examples) {
    const cmd = ex?.resolvedCmd ?? ex?.cmd
    const opType = ex?.opType ?? inferOpTypeFromCommand(cmd)
    for (const f of extractIndexableFields(cmd, opType)) out.add(f)
  }
  return out
}

function collectFieldsFromPatterns(queryPatterns, out = new Set()) {
  let topPattern = null
  for (const entry of queryPatterns) {
    const pattern = typeof entry === 'string' ? entry : entry?.pattern
    if (!pattern || pattern === '{}') continue
    const fields = extractFieldsFromQueryPattern(pattern)
    if (!fields.length) continue
    if (!topPattern) topPattern = pattern
    for (const f of fields) out.add(f)
  }
  return { fields: out, topPattern }
}

export const INDEX_VERIFY_NOTE =
  'Test in a lower environment first. Run explain("executionStats") on your query and confirm winningPlan uses IXSCAN (not COLLSCAN) before deploying to production.'

/**
 * Build index suggestion metadata from COLLSCAN examples and optional query patterns.
 */
export function buildIndexSuggestion(ns, examples = [], queryPatterns = []) {
  const dotIdx = ns.indexOf('.')
  if (dotIdx === -1) {
    return { cmd: null, hasFields: false, fields: [], queryPattern: null, source: 'none', db: '', coll: '' }
  }
  const db = ns.slice(0, dotIdx)
  const coll = ns.slice(dotIdx + 1)
  if (!coll) {
    return { cmd: null, hasFields: false, fields: [], queryPattern: null, source: 'none', db, coll: '' }
  }

  const fields = collectFieldsFromExamples(examples)
  let queryPattern = null
  let source = fields.size ? 'command' : 'none'

  if (!fields.size && queryPatterns.length) {
    const fromPatterns = collectFieldsFromPatterns(queryPatterns, fields)
    queryPattern = fromPatterns.topPattern
    if (fields.size) source = 'pattern'
  }

  const sorted = [...fields].sort()
  if (!sorted.length) {
    return {
      cmd: null,
      hasFields: false,
      fields: [],
      queryPattern: queryPatterns[0]?.pattern ?? queryPatterns[0] ?? null,
      source: 'none',
      db,
      coll,
    }
  }

  const spec = JSON.stringify(buildIndexSpec(sorted))
  return {
    cmd: `db.getSiblingDB("${db}").getCollection("${coll}").createIndex(${spec})`,
    hasFields: true,
    fields: sorted,
    queryPattern: queryPattern || null,
    source,
    db,
    coll,
  }
}

/**
 * Build a mongosh createIndex command from COLLSCAN examples.
 */
export function generateCreateIndexCmd(ns, examples = [], queryPatterns = []) {
  const result = buildIndexSuggestion(ns, examples, queryPatterns)
  if (result.cmd) return result.cmd
  return `// No query filter fields found in log for ${ns}\n// Review query patterns in Statistics tab or add indexes from your application queries`
}
