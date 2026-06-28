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
export function resolveCollscanCommand(attr = {}, cmd, opType = '') {
  const ot = String(opType || '').toLowerCase()
  if (ot === 'getmore' && attr.originatingCommand) {
    return {
      cmd: attr.originatingCommand,
      opType: inferOpTypeFromCommand(attr.originatingCommand),
    }
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

  if (query && typeof query === 'object' && !Array.isArray(query)) return query
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
 * Return sorted field names suitable for a compound index spec.
 */
export function extractIndexableFields(cmd, opType = '') {
  const filter = extractQueryFilter(cmd, opType)
  if (!filter) return []
  return [...collectFilterFields(filter)].sort()
}

function buildIndexSpec(fields) {
  const spec = {}
  for (const f of fields) spec[f] = 1
  return spec
}

/**
 * Build a mongosh createIndex command from COLLSCAN examples.
 */
export function generateCreateIndexCmd(ns, examples = []) {
  const dotIdx = ns.indexOf('.')
  if (dotIdx === -1) return `// Could not parse namespace: ${ns}`
  const db = ns.slice(0, dotIdx)
  const coll = ns.slice(dotIdx + 1)
  if (!coll) return `// Could not parse namespace: ${ns}`

  const fields = new Set()
  for (const ex of examples) {
    const cmd = ex?.resolvedCmd ?? ex?.cmd
    const opType = ex?.opType ?? inferOpTypeFromCommand(cmd)
    for (const f of extractIndexableFields(cmd, opType)) fields.add(f)
  }

  const sorted = [...fields].sort()
  const fStr = sorted.length
    ? JSON.stringify(buildIndexSpec(sorted))
    : '{ /* add query filter fields from your application */ }'

  return `db.getSiblingDB("${db}").getCollection("${coll}").createIndex(${fStr})`
}
