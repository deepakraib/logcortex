import { QUESTION_INTENTS } from './questionCatalog.js'

/** @typedef {{ intent: import('./questionCatalog.js').QuestionIntent, score: number }} ScoredIntent */

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'between',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'it', 'its', 'this', 'that',
  'these', 'those', 'what', 'which', 'who', 'whom', 'whose', 'when', 'where',
  'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'just', 'please', 'tell', 'give', 'want', 'know', 'about',
  'any', 'there', 'here', 'also', 'then', 'than', 'out', 'up', 'down',
])

/** Phrase expansions applied before tokenization (order matters). */
const PHRASE_EXPANSIONS = [
  [/what should i fix first/gi, 'recommendations action items priority'],
  [/what(?:'s| is) wrong/gi, 'what failed problem overview'],
  [/what(?:'s| is) the problem/gi, 'what failed problem overview'],
  [/why(?:'s| is) (?:it |my |the )?(?:db |database |mongo(?:db)? )?slow/gi, 'why slow performance bottleneck'],
  [/performance (?:issue|problem)/gi, 'slow performance bottleneck'],
  [/full table scan/gi, 'collscan collection scan'],
  [/missing indexes?/gi, 'missing index collscan'],
  [/no index/gi, 'missing index collscan'],
  [/show (?:me )?(?:the )?errors?/gi, 'show list top errors'],
  [/list (?:the )?errors?/gi, 'show list top errors'],
  [/display (?:the )?errors?/gi, 'show list top errors'],
  [/see (?:the )?errors?/gi, 'show list top errors'],
  [/show (?:me )?(?:the )?slow/gi, 'show slowest top slow'],
  [/mongo(?:db)? version/gi, 'mongodb version'],
  [/how do i fix/gi, 'how to fix'],
  [/auth(?:entication)? fail(?:ure|ed)?/gi, 'auth fail unauthorized'],
  [/replica ?set/gi, 'replica set replset'],
  [/primary node/gi, 'primary role'],
  [/secondary node/gi, 'secondary role'],
  [/operation types?/gi, 'operation type breakdown read write'],
  [/engine in use/gi, 'storage engine wiredtiger'],
  [/host and port/gi, 'hostname port bind'],
  [/a secondary/gi, 'secondary role node'],
  [/mongodb atlas/gi, 'atlas cloud deployment'],
]

/** Extra terms per intent for token overlap (intent id → keywords). */
const INTENT_KEYWORDS = {
  help: ['help', 'questions', 'ask', 'capabilities', 'commands'],
  knowledge_inventory: ['information', 'data', 'extracted', 'fields', 'catalog', 'categories'],
  version: ['version', 'release', 'edition', 'mongodb', 'build', 'upgrade', 'eol'],
  topology: ['topology', 'sharded', 'shard', 'replica', 'replset', 'primary', 'secondary', 'mongos', 'role'],
  host: ['hostname', 'host', 'port', 'bind', 'server', 'address'],
  storage: ['storage', 'wiredtiger', 'rocksdb', 'engine'],
  atlas: ['atlas', 'cloud', 'aws', 'azure', 'gcp', 'region', 'provider'],
  time_range: ['time', 'range', 'start', 'end', 'duration', 'span', 'window', 'period'],
  line_counts: ['lines', 'parsed', 'skipped', 'total', 'parse'],
  slow_count: ['slow', 'count', 'many', 'number'],
  slowest: ['slowest', 'worst', 'longest', 'top', 'max', 'highest', 'show', 'list'],
  slow_total_time: ['total', 'slow', 'sum', 'cumulative', 'wasted', 'time'],
  query_patterns: ['pattern', 'query', 'common', 'frequent', 'shapes'],
  top_namespaces: ['namespace', 'collection', 'busiest', 'hottest', 'top', 'traffic'],
  operation_types: ['operation', 'read', 'write', 'insert', 'update', 'delete', 'command', 'getmore'],
  collscan: ['collscan', 'scan', 'index', 'missing', 'full'],
  collscan_internal: ['internal', 'config', 'system', 'collscan'],
  index_suggestions: ['index', 'create', 'suggest', 'add', 'recommend'],
  error_count: ['error', 'count', 'many', 'number'],
  warning_count: ['warning', 'warn', 'count', 'many'],
  top_errors: ['error', 'errors', 'failed', 'failure', 'fatal', 'exception', 'top', 'list', 'show', 'recent', 'common'],
  error_fix: ['fix', 'resolve', 'remediation', 'tripwire', 'assert', 'oom', 'timeout', 'conflict'],
  audit: ['security', 'audit', 'auth', 'unauthorized', 'tls', 'ssl'],
  apps: ['application', 'appname', 'client', 'connects', 'who'],
  drivers: ['driver', 'pymongo', 'java', 'node', 'go'],
  connections: ['connection', 'connections', 'peak', 'pool', 'ip', 'clients'],
  large_results: ['reslen', 'large', 'result', '16mb', 'response', 'big'],
  restarts: ['restart', 'startup', 'election', 'stepdown', 'state'],
  health_summary: ['summarize', 'summary', 'overview', 'health', 'overall', 'problem', 'failed', 'report'],
  performance_issues: ['slow', 'why', 'performance', 'bottleneck', 'lag', 'latency', 'problem'],
  export_context: ['export', 'json', 'copy', 'context', 'structured', 'machine'],
  recommendations: ['recommend', 'action', 'fix', 'priority', 'attention', 'should'],
  build_info: ['git', 'openssl', 'allocator', 'build', 'compiler', 'pid'],
  primary_role: ['primary', 'secondary', 'role', 'arbiter'],
  replica_members: ['member', 'members', 'replica', 'rs'],
  slowest_namespaces: ['namespace', 'slowest', 'average', 'avg'],
  top_warnings: ['warning', 'warn', 'top', 'list', 'show'],
  severity_dist: ['severity', 'info', 'warning', 'error', 'fatal', 'distribution'],
  timeline: ['timeline', 'time', 'busiest', 'traffic', 'minute'],
  storage_stats: ['wiredtiger', 'cache', 'ticket', 'storage', 'stats'],
  long_connections: ['long', 'lived', 'stale', 'idle', 'connection'],
  client_ips: ['ip', 'client', 'source', 'connecting'],
  conn_timeline: ['timeline', 'connection', 'open', 'close'],
  inefficient_queries: ['docs', 'examined', 'keys', 'inefficient'],
  ixscan: ['ixscan', 'index', 'scan'],
  distinct_messages: ['message', 'distinct', 'common', 'template'],
  log_components: ['component', 'command', 'query', 'access', 'repl'],
  db_operations: ['operations', 'ops', 'parsed', 'database'],
  restart_detail: ['restart', 'startup', 'when'],
  rs_state_detail: ['state', 'change', 'stepdown', 'election', 'primary'],
  tab_guide: ['tab', 'where', 'find', 'ui', 'panel'],
  greeting: ['hello', 'hi', 'hey', 'thanks', 'bye'],
}

/** Minimum length for fuzzy example substring matching (avoids "hi" ⊂ "sharded"). */
const MIN_FUZZY_EXAMPLE_LEN = 12

/** Greetings and small talk — not log analysis. */
const CHITCHAT_PATTERNS = [
  /^(hi|hey|hello|howdy|yo|sup|greetings|hiya)[!.?\s]*$/i,
  /^good\s+(morning|afternoon|evening|night)[!.?\s]*$/i,
  /^how\s+are\s+you\b/i,
  /^how\s+is\s+it\s+going\b/i,
  /^what'?s\s+up\b/i,
  /^how\s+do\s+you\s+do\b/i,
  /^(thanks|thank\s+you|thx|ty|cheers)[!.?\s]*$/i,
  /^(bye|goodbye|see\s+ya|later)[!.?\s]*$/i,
  /^nice\s+to\s+meet\s+you\b/i,
]

/** MongoDB/log-related tokens — if none present, question may be off-topic. */
const LOG_TOPIC_RE =
  /\b(mongo|mongodb|mongod|log|slow|query|error|warn|collscan|index|replica|shard|topology|version|connection|namespace|collection|primary|secondary|wiredtiger|atlas|audit|auth|tls|ssl|ops|throughput|latency|dur|ms|reslen|appname|driver|restart|election|stepdown|summarize|summary|overview|recommend|fix|performance|bottleneck|traffic|timeline|component|export|help)\b/i

/**
 * @param {string} raw — original user text (before normalize)
 */
export function isChitchat(raw) {
  const t = String(raw || '').trim()
  if (!t) return false
  return CHITCHAT_PATTERNS.some((re) => re.test(t))
}

/**
 * True when the question is too short/vague to safely match log intents.
 * @param {string} text — normalized question
 * @param {string[]} tokens — content tokens after stop-word removal
 */
export function isLowSignalQuestion(text, tokens) {
  if (isChitchat(text)) return true
  if (!text || text.length < 3) return true
  if (tokens.length === 0 && text.length < 24 && !LOG_TOPIC_RE.test(text)) return true
  return false
}

/**
 * @param {string} text
 * @param {string} exNorm
 * @param {string[]} tokens
 */
function scoreExampleMatch(text, exNorm, tokens) {
  if (text === exNorm) return 6
  if (text.length < MIN_FUZZY_EXAMPLE_LEN && exNorm.length < MIN_FUZZY_EXAMPLE_LEN) {
    return text === exNorm ? 6 : 0
  }
  if (text.length >= MIN_FUZZY_EXAMPLE_LEN && text.includes(exNorm) && exNorm.length >= MIN_FUZZY_EXAMPLE_LEN) {
    return 4
  }
  if (exNorm.length >= MIN_FUZZY_EXAMPLE_LEN && exNorm.includes(text) && text.length >= MIN_FUZZY_EXAMPLE_LEN) {
    return 4
  }
  const exTokens = tokenize(exNorm)
  const overlap = tokenOverlap(tokens, exTokens)
  if (overlap >= 3) return 3
  if (overlap >= 2) return 2
  return 0
}

/** Boost/penalize intent scores based on question shape. */
const DISAMBIGUATION_RULES = [
  {
    test: /\b(show|list|display|see|get|what are|tell me the)\b.*\b(error|fail|failure|exception)/,
    boost: 'top_errors',
    penalize: ['error_count', 'warning_count'],
    amount: 4,
  },
  {
    test: /\b(how many|count|number of|total)\b.*\b(error)/,
    boost: 'error_count',
    penalize: ['top_errors'],
    amount: 4,
  },
  {
    test: /\b(show|list|display|top)\b.*\b(slow|slowest|longest)/,
    boost: 'slowest',
    penalize: ['slow_count'],
    amount: 3,
  },
  {
    test: /\b(how many|count|number of)\b.*\b(slow)/,
    boost: 'slow_count',
    penalize: ['slowest'],
    amount: 3,
  },
  {
    test: /\b(why|bottleneck|performance problem|what.?s wrong)\b/,
    boost: 'performance_issues',
    penalize: ['health_summary'],
    amount: 2,
  },
  {
    test: /\b(summarize|summary|overview|overall)\b/,
    boost: 'health_summary',
    penalize: ['performance_issues'],
    amount: 2,
  },
  {
    test: /\b(show|list|display|top)\b.*\b(warn)/,
    boost: 'top_warnings',
    penalize: ['warning_count', 'top_errors'],
    amount: 4,
  },
  {
    test: /\b(how many|count|number of)\b.*\b(warn)/,
    boost: 'warning_count',
    penalize: ['top_warnings'],
    amount: 4,
  },
  {
    test: /\b(recommend|action item|what should i fix|fix first|next steps|priorit)\b/,
    boost: 'recommendations',
    penalize: ['help', 'error_fix'],
    amount: 5,
  },
  {
    test: /\b(how to fix|remediation|tripwire|assert|write conflict)\b/,
    boost: 'error_fix',
    penalize: ['recommendations'],
    amount: 4,
  },
]

/**
 * @param {string} q
 */
export function normalizeQuestion(q) {
  let text = String(q || '').toLowerCase()
  for (const [re, replacement] of PHRASE_EXPANSIONS) {
    text = text.replace(re, replacement)
  }
  return text
    .replace(/[?!.,;:()[\]{}'"]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * @param {string} text
 */
export function tokenize(text) {
  return text
    .split(/\s+/)
    .map((t) => t.replace(/ies$/, 'y').replace(/s$/, ''))
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
}

/**
 * @param {string[]} tokensA
 * @param {string[]} tokensB
 */
function tokenOverlap(tokensA, tokensB) {
  let score = 0
  for (const a of tokensA) {
    for (const b of tokensB) {
      if (a === b) score += 2
      else if (a.length > 3 && b.length > 3 && (a.startsWith(b) || b.startsWith(a))) score += 1
    }
  }
  return score
}

/**
 * @param {string} text
 * @param {string[]} tokens
 * @param {string} intentId
 */
function keywordScore(text, tokens, intentId) {
  const keywords = INTENT_KEYWORDS[intentId]
  if (!keywords?.length) return 0
  let score = 0
  for (const kw of keywords) {
    const kwTokens = kw.split(/\s+/)
    const boundary = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
    if (boundary.test(text)) score += 2
    else if (kwTokens.every((kt) => tokens.includes(kt))) score += 1.5
    else score += tokenOverlap(tokens, kwTokens) * 0.5
  }
  return score
}

/**
 * @param {string} text
 * @returns {ScoredIntent[]}
 */
export function matchIntents(text) {
  const tokens = tokenize(text)
  const scored = /** @type {Map<string, ScoredIntent>} */ (new Map())

  for (const intent of QUESTION_INTENTS) {
    let score = 0

    for (const pat of intent.patterns) {
      if (pat.test(text)) score += 3
    }

    for (const ex of intent.examples) {
      const exNorm = normalizeQuestion(ex)
      score += scoreExampleMatch(text, exNorm, tokens)
    }

    score += keywordScore(text, tokens, intent.id)

    if (score > 0) {
      scored.set(intent.id, { intent, score })
    }
  }

  for (const rule of DISAMBIGUATION_RULES) {
    if (!rule.test.test(text)) continue
    const boosted = scored.get(rule.boost)
    if (boosted) boosted.score += rule.amount
    for (const pid of rule.penalize) {
      const penalized = scored.get(pid)
      if (penalized) penalized.score = Math.max(0, penalized.score - rule.amount)
    }
  }

  return [...scored.values()]
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
}

/**
 * Pick a fallback intent when nothing scored well.
 * @param {string} text
 * @param {object|null} logData
 */
export function inferFallbackIntent(text, logData) {
  if (!logData) return null

  if (/\b(slow|latency|duration|ms|performance|bottleneck)\b/.test(text)) {
    if (/\b(how many|count|number)\b/.test(text)) return 'slow_count'
    return 'slowest'
  }
  if (/\b(error|fail|fatal|exception)\b/.test(text)) {
    if (/\b(how many|count|number)\b/.test(text)) return 'error_count'
    return 'top_errors'
  }
  if (/\b(warn)\b/.test(text)) return 'warning_count'
  if (/\b(collscan|scan|index|missing index)\b/.test(text)) return 'collscan'
  if (/\b(version|release|edition)\b/.test(text)) return 'version'
  if (/\b(summarize|summary|overview|wrong|problem|health)\b/.test(text)) return 'health_summary'
  if (/\b(warn)\b/.test(text)) {
    if (/\b(how many|count)\b/.test(text)) return 'warning_count'
    return 'top_warnings'
  }
  if (/\b(recommend|action item|fix first)\b/.test(text)) return 'recommendations'
  if (/\b(namespace|collection)\b/.test(text) && /\b(slow|avg)\b/.test(text)) return 'slowest_namespaces'
  if (/\b(timeline|busiest|over time)\b/.test(text)) return 'timeline'
  if (/\b(component)\b/.test(text)) return 'log_components'
  if (/\b(which tab|where.*find)\b/.test(text)) return 'tab_guide'

  return null
}

/**
 * @param {string} text
 * @param {object|null} logData
 */
export function findNamespaceInQuestion(text, logData) {
  if (!logData || !text) return null
  const candidates = new Set()
  for (const op of logData.slowOps || []) if (op.ns) candidates.add(op.ns.toLowerCase())
  for (const n of logData.topNamespaces || []) if (n.ns) candidates.add(n.ns.toLowerCase())
  for (const [ns] of Object.entries(logData.indexWarnings || {})) candidates.add(ns.toLowerCase())

  const sorted = [...candidates].sort((a, b) => b.length - a.length)
  for (const ns of sorted) {
    if (text.includes(ns)) return ns
    const short = ns.includes('.') ? ns.split('.').pop() : ns
    if (short && short.length > 2 && text.includes(short)) return ns
  }
  return null
}
