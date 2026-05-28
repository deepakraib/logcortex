/**
 * Generates up to 10,000 unique MongoDB log-analysis questions from templates.
 * Each question maps to an existing intentId — answers still come from parsed logData.
 */

/** @typedef {{ intentId: string, category: string, question: string }} BankEntry */

export const TARGET_QUESTION_COUNT = 10000

/** @type {Record<string, { category: string, subjects: string[], verbs?: string[], openers?: string[], suffixes?: string[] }>} */
const INTENT_TEMPLATES = {
  health_summary: {
    category: 'Overview',
    openers: ['Summarize', 'Give me a summary of', 'Provide an overview of', 'Quick summary of', 'Executive summary of', 'Report on', 'High-level summary of', 'Brief overview of', 'Analyze', 'Review'],
    subjects: ['this log', 'the log file', 'my MongoDB log', 'the uploaded log', 'this mongod log', 'the database log', 'today\'s log', 'this diagnostic log'],
    suffixes: ['', 'please', 'for me', 'in plain language'],
  },
  performance_issues: {
    category: 'Overview',
    openers: ['Why is', 'What makes', 'Explain', 'Diagnose', 'What causes'],
    subjects: ['it slow', 'the database slow', 'MongoDB slow', 'performance bad', 'latency high', 'response time poor', 'this cluster slow', 'the server slow'],
    suffixes: ['?', 'in this log', 'according to this log'],
  },
  recommendations: {
    category: 'Overview',
    openers: ['What are your', 'Give me', 'List', 'Show', 'What should I', 'Top'],
    subjects: ['recommendations', 'action items', 'next steps', 'priorities', 'fixes', 'things to fix', 'improvements', 'remediation steps'],
    suffixes: ['', 'from this log', 'based on this log'],
  },
  version: {
    category: 'Version & topology',
    openers: ['What', 'Which', 'Tell me the', 'Show the', 'Report the'],
    subjects: ['MongoDB version', 'database version', 'server version', 'release version', 'MongoDB edition', 'build version', 'mongod version'],
    suffixes: ['?', 'in this log', 'is running'],
  },
  build_info: {
    category: 'Version & topology',
    openers: ['What is the', 'Show', 'List', 'Report'],
    subjects: ['git version', 'OpenSSL version', 'allocator', 'build info', 'compiler used', 'process id', 'architecture', 'platform'],
    suffixes: ['?', 'from startup', 'in the log'],
  },
  topology: {
    category: 'Version & topology',
    openers: ['Is this', 'What is the', 'Describe the', 'Show the', 'Tell me the'],
    subjects: ['topology', 'deployment type', 'replica set name', 'sharded cluster', 'shard topology', 'replSet name', 'cluster layout', 'deployment model'],
    suffixes: ['?', 'in this log'],
  },
  primary_role: {
    category: 'Version & topology',
    openers: ['Am I', 'Is this node', 'What is the', 'Show the', 'Current'],
    subjects: ['primary', 'a secondary', 'the primary', 'node role', 'member role', 'replica role', 'PRIMARY', 'read preference target'],
    suffixes: ['?', 'in the replica set'],
  },
  replica_members: {
    category: 'Version & topology',
    openers: ['List', 'Show', 'Who are', 'Enumerate', 'Display'],
    subjects: ['replica set members', 'RS members', 'replica members', 'cluster members', 'replSet members', 'all members', 'member hosts'],
    suffixes: ['?', 'in this log'],
  },
  host: {
    category: 'Version & topology',
    openers: ['What is the', 'Show', 'Report', 'Tell me the'],
    subjects: ['hostname', 'host and port', 'server address', 'bind IP', 'dbPath', 'listening port', 'server identity', 'mongod host'],
    suffixes: ['?', 'from the log'],
  },
  storage: {
    category: 'Version & topology',
    openers: ['What', 'Which', 'Is the'],
    subjects: ['storage engine', 'engine in use', 'WiredTiger status', 'storage backend', 'data storage engine'],
    suffixes: ['?', 'for this server'],
  },
  storage_stats: {
    category: 'Version & topology',
    openers: ['Show', 'Report', 'What are', 'List'],
    subjects: ['WiredTiger cache stats', 'storage statistics', 'cache size', 'cache pressure', 'storage engine metrics', 'ticket availability'],
    suffixes: ['?', 'in the log'],
  },
  atlas: {
    category: 'Version & topology',
    openers: ['Is this', 'Are we on', 'What is the', 'Show'],
    subjects: ['Atlas', 'MongoDB Atlas', 'cloud provider', 'AWS region', 'Azure region', 'GCP region', 'cloud deployment'],
    suffixes: ['?', 'in this log'],
  },
  slow_count: {
    category: 'Performance',
    openers: ['How many', 'Count', 'What is the number of', 'Total', 'Give me the count of'],
    subjects: ['slow queries', 'slow operations', 'slow ops', 'queries over threshold', 'long running operations', 'slow commands', 'slow requests'],
    suffixes: ['?', 'in this log', 'in the log file'],
  },
  slowest: {
    category: 'Performance',
    openers: ['What is the', 'Show', 'List', 'Top', 'Which is the', 'Find the'],
    subjects: ['slowest query', 'slowest operation', 'worst query', 'longest running query', 'max duration query', 'top slow op', 'highest latency operation'],
    suffixes: ['?', 'in this log'],
  },
  slow_total_time: {
    category: 'Performance',
    openers: ['What is the', 'How much', 'Total', 'Sum of'],
    subjects: ['time in slow ops', 'slow query time', 'cumulative slow duration', 'wasted time on slow queries', 'total slow operation time'],
    suffixes: ['?', 'in this log'],
  },
  query_patterns: {
    category: 'Performance',
    openers: ['What are the', 'Show', 'List', 'Top'],
    subjects: ['query patterns', 'common query shapes', 'frequent slow patterns', 'repeated query patterns', 'hot query shapes', 'slow query templates'],
    suffixes: ['?', 'in this log'],
  },
  top_namespaces: {
    category: 'Performance',
    openers: ['What is the', 'Which is the', 'Show', 'Top'],
    subjects: ['busiest namespace', 'hottest collection', 'top namespace by traffic', 'most active database', 'namespace with most ops', 'busiest collection'],
    suffixes: ['?', 'in this log'],
  },
  slowest_namespaces: {
    category: 'Performance',
    openers: ['Which', 'What are the', 'Show', 'List'],
    subjects: ['slowest namespaces', 'slowest collections', 'namespaces by avg duration', 'collections with highest avg ms', 'top slow namespaces'],
    suffixes: ['?', 'in this log'],
  },
  operation_types: {
    category: 'Performance',
    openers: ['What is the', 'Show', 'Break down', 'Distribution of'],
    subjects: ['operation types', 'read vs write ratio', 'command vs query count', 'insert update delete breakdown', 'operation mix', 'op type distribution'],
    suffixes: ['?', 'in this log'],
  },
  timeline: {
    category: 'Performance',
    openers: ['When was', 'What was', 'Show', 'Busiest'],
    subjects: ['traffic highest', 'the busiest period', 'ops per minute', 'operation timeline', 'load over time', 'peak traffic time', 'activity timeline'],
    suffixes: ['?', 'in this log'],
  },
  inefficient_queries: {
    category: 'Performance',
    openers: ['Any', 'Show', 'List', 'Find'],
    subjects: ['inefficient queries', 'high docs examined', 'queries scanning too many docs', 'low keys examined high docs', 'bad examination ratio', 'expensive collection scans'],
    suffixes: ['?', 'in slow ops'],
  },
  ixscan: {
    category: 'Performance',
    openers: ['How many', 'Any', 'Count', 'Show'],
    subjects: ['IXSCAN operations', 'index scans', 'queries using indexes', 'IXSCAN in slow ops', 'index-based plans'],
    suffixes: ['?', 'in this log'],
  },
  large_results: {
    category: 'Performance',
    openers: ['Any', 'Show', 'List', 'Were there'],
    subjects: ['large result sets', 'responses over 16MB', 'huge reslen', 'big query results', 'oversized responses', 'reslen violations'],
    suffixes: ['?', 'in this log'],
  },
  collscan: {
    category: 'Indexes & COLLSCAN',
    openers: ['Any', 'Were there', 'Show', 'List', 'Count', 'How many'],
    subjects: ['COLLSCAN operations', 'collection scans', 'full collection scans', 'missing index scans', 'COLLSCAN in the log', 'table scans'],
    suffixes: ['?', 'in this log'],
  },
  collscan_internal: {
    category: 'Indexes & COLLSCAN',
    openers: ['Any', 'Show', 'List'],
    subjects: ['internal COLLSCAN', 'config namespace scans', 'system collection scans', 'COLLSCAN on config', 'sharding internal scans'],
    suffixes: ['?', 'in this log'],
  },
  index_suggestions: {
    category: 'Indexes & COLLSCAN',
    openers: ['What', 'Which', 'Suggest', 'Recommend', 'What indexes should I'],
    subjects: ['indexes to add', 'index recommendations', 'createIndex suggestions', 'missing indexes', 'index advice', 'indexes to create'],
    suffixes: ['?', 'from this log'],
  },
  error_count: {
    category: 'Errors & warnings',
    openers: ['How many', 'Count', 'What is the number of', 'Total'],
    subjects: ['errors', 'error lines', 'severity E lines', 'fatal errors', 'error events'],
    suffixes: ['?', 'in this log'],
  },
  warning_count: {
    category: 'Errors & warnings',
    openers: ['How many', 'Count', 'What is the number of'],
    subjects: ['warnings', 'warning lines', 'severity W lines', 'warn events'],
    suffixes: ['?', 'in this log'],
  },
  top_errors: {
    category: 'Errors & warnings',
    openers: ['What are the', 'Show', 'List', 'Top', 'Recent', 'Display'],
    subjects: ['errors', 'top errors', 'recent errors', 'common errors', 'error messages', 'failures', 'fatal messages'],
    suffixes: ['?', 'in this log'],
  },
  top_warnings: {
    category: 'Errors & warnings',
    openers: ['What are the', 'Show', 'List', 'Top', 'Recent'],
    subjects: ['warnings', 'top warnings', 'recent warnings', 'warning messages'],
    suffixes: ['?', 'in this log'],
  },
  severity_dist: {
    category: 'Errors & warnings',
    openers: ['What is the', 'Show', 'Break down', 'Distribution of'],
    subjects: ['severity distribution', 'info warning error counts', 'log level breakdown', 'severity breakdown', 'I W E F counts'],
    suffixes: ['?', 'in this log'],
  },
  error_fix: {
    category: 'Errors & warnings',
    openers: ['How to fix', 'Remediation for', 'Fix', 'Resolve', 'What causes'],
    subjects: ['auth errors', 'timeouts', 'OOM errors', 'write conflicts', 'assertions', 'tripwire', 'connection failures', 'duplicate key errors'],
    suffixes: ['?', 'in this log'],
  },
  audit: {
    category: 'Security',
    openers: ['Any', 'Show', 'List', 'Were there', 'Report'],
    subjects: ['security issues', 'audit events', 'auth failures', 'unauthorized access', 'TLS problems', 'SSL errors', 'shutdown signals', 'authentication failures'],
    suffixes: ['?', 'in this log'],
  },
  apps: {
    category: 'Applications & drivers',
    openers: ['Which', 'What', 'Show', 'List'],
    subjects: ['applications connect', 'appName values', 'client applications', 'apps hitting the server', 'application breakdown', 'connecting apps'],
    suffixes: ['?', 'in this log'],
  },
  drivers: {
    category: 'Applications & drivers',
    openers: ['What', 'Which', 'Show', 'List'],
    subjects: ['driver versions', 'client drivers', 'Java driver version', 'Node driver version', 'Python driver', 'Go driver'],
    suffixes: ['?', 'in this log'],
  },
  connections: {
    category: 'Connections',
    openers: ['What was', 'Show', 'Report', 'Peak'],
    subjects: ['peak connections', 'connection count', 'open connections', 'connection pool usage', 'active connections', 'connection stats'],
    suffixes: ['?', 'in this log'],
  },
  client_ips: {
    category: 'Connections',
    openers: ['Which', 'What are the', 'Show', 'Top', 'List'],
    subjects: ['client IPs', 'connecting IP addresses', 'source IPs', 'remote IPs', 'client addresses'],
    suffixes: ['?', 'in this log'],
  },
  long_connections: {
    category: 'Connections',
    openers: ['Any', 'Show', 'List', 'Were there'],
    subjects: ['long-lived connections', 'stale connections', 'idle connections', 'long running sessions', 'connections open too long'],
    suffixes: ['?', 'in this log'],
  },
  conn_timeline: {
    category: 'Connections',
    openers: ['Show', 'Graph', 'Connection'],
    subjects: ['connection timeline', 'connections over time', 'open close events', 'connection activity timeline'],
    suffixes: ['?', 'in this log'],
  },
  time_range: {
    category: 'Time & coverage',
    openers: ['What is the', 'Show', 'Report'],
    subjects: ['log time range', 'start and end time', 'time span', 'log duration', 'coverage period', 'first and last timestamp'],
    suffixes: ['?', 'of this file'],
  },
  line_counts: {
    category: 'Time & coverage',
    openers: ['How many', 'What is the', 'Count of'],
    subjects: ['lines in the log', 'parsed lines', 'skipped lines', 'total lines', 'lines parsed'],
    suffixes: ['?', 'in this file'],
  },
  db_operations: {
    category: 'Time & coverage',
    openers: ['How many', 'Count', 'What is the number of'],
    subjects: ['database operations', 'DB ops parsed', 'operations in log', 'command operations', 'total ops'],
    suffixes: ['?', 'in this log'],
  },
  restarts: {
    category: 'Time & coverage',
    openers: ['Any', 'Were there', 'Did the', 'Count'],
    subjects: ['restarts', 'server restarts', 'mongod restarts', 'startup events', 'RS state changes', 'failover events'],
    suffixes: ['?', 'in this log'],
  },
  restart_detail: {
    category: 'Time & coverage',
    openers: ['When did', 'Show', 'List', 'Last'],
    subjects: ['the server restart', 'restart events', 'startup times', 'last restart', 'mongod startup'],
    suffixes: ['?', 'in this log'],
  },
  rs_state_detail: {
    category: 'Time & coverage',
    openers: ['List', 'Show', 'Any'],
    subjects: ['RS state changes', 'stepdown events', 'election events', 'role changes', 'became primary events'],
    suffixes: ['?', 'in this log'],
  },
  distinct_messages: {
    category: 'Search & log content',
    openers: ['What are the', 'Most common', 'Top', 'List'],
    subjects: ['log messages', 'distinct messages', 'message templates', 'unique msg fields', 'frequent log lines'],
    suffixes: ['?', 'in this log'],
  },
  log_components: {
    category: 'Search & log content',
    openers: ['Which', 'What', 'Show', 'List'],
    subjects: ['log components appear', 'COMMAND component lines', 'QUERY component volume', 'component breakdown', 'logging components'],
    suffixes: ['?', 'in this log'],
  },
  help: {
    category: 'Help',
    openers: ['What can you', 'What questions can I', 'How do I use', 'List', 'Show me'],
    subjects: ['answer', 'ask about this log', 'do with this tool', 'questions are supported', 'capabilities'],
    suffixes: ['?', ''],
  },
  knowledge_inventory: {
    category: 'Help',
    openers: ['What', 'List', 'Show'],
    subjects: ['data was extracted', 'information is in the log', 'fields are available', 'categories you parsed', 'extracted metrics'],
    suffixes: ['?', 'from this file'],
  },
  tab_guide: {
    category: 'Help',
    openers: ['Where do I find', 'Which tab shows', 'How to open', 'Where is'],
    subjects: ['slow queries in the UI', 'errors tab', 'indexes tab', 'audit events', 'statistics', 'log search', 'large results', 'query scatter'],
    suffixes: ['?', ''],
  },
  export_context: {
    category: 'Help',
    openers: ['Export', 'Copy', 'Give me', 'Download'],
    subjects: ['JSON context', 'structured summary', 'machine readable export', 'masked log summary', 'parsed data export'],
    suffixes: ['', 'for external analysis'],
  },
}

const MODIFIERS = [
  '',
  'from this log',
  'in this log',
  'in the uploaded file',
  'according to the parsed log',
  'for this mongod',
  'for troubleshooting',
  'for performance review',
  'for the DBA review',
  'please',
]

/**
 * @param {string} intentId
 * @param {{ category: string, subjects: string[], openers?: string[], suffixes?: string[] }} tpl
 * @returns {BankEntry[]}
 */
function generateForIntent(intentId, tpl) {
  const openers = tpl.openers || ['Show']
  const subjects = tpl.subjects || ['this log']
  const suffixes = tpl.suffixes || ['?']
  const out = []

  for (const opener of openers) {
    for (const subject of subjects) {
      for (const suffix of suffixes) {
        for (const mod of MODIFIERS) {
          const parts = [opener, subject, suffix, mod].filter(Boolean)
          let q = parts.join(' ').replace(/\s+/g, ' ').trim()
          if (!q.endsWith('?') && !q.endsWith('.') && !q.endsWith('!')) q += '?'
          out.push({ intentId, category: tpl.category, question: q })
        }
      }
    }
  }
  return out
}

/**
 * @param {BankEntry[]} coreEntries — hand-curated questions (listed first)
 * @param {number} [target]
 * @returns {BankEntry[]}
 */
export function generateQuestionBank(coreEntries, target = TARGET_QUESTION_COUNT) {
  const seen = new Set()
  const bank = []

  function add(entry) {
    const key = entry.question.toLowerCase().replace(/\s+/g, ' ').trim()
    if (seen.has(key)) return false
    seen.add(key)
    bank.push(entry)
    return true
  }

  for (const e of coreEntries) add(e)

  const generated = []
  for (const [intentId, tpl] of Object.entries(INTENT_TEMPLATES)) {
    generated.push(...generateForIntent(intentId, tpl))
  }

  // Round-robin across intents so the bank balances topics (deterministic)
  const byIntent = {}
  for (const e of generated) {
    if (!byIntent[e.intentId]) byIntent[e.intentId] = []
    byIntent[e.intentId].push(e)
  }
  const intentIds = Object.keys(byIntent)
  let round = 0
  while (bank.length < target && round < 20000) {
    for (const id of intentIds) {
      const list = byIntent[id]
      const item = list[round % list.length]
      if (item) add(item)
      if (bank.length >= target) break
    }
    round++
  }

  return bank.slice(0, target)
}
