/**
 * Ask Log question bank: hand-curated core + generated templates (10,000 total).
 * Patterns live on intents in questionCatalog.js.
 */

import { generateQuestionBank, TARGET_QUESTION_COUNT } from './questionGenerator.js'

/** @typedef {{ intentId: string, category: string, question: string }} BankEntry */

/** Hand-picked high-quality phrasings (always included first). */
export const CORE_QUESTION_BANK = [
  // ── Overview ──
  { intentId: 'health_summary', category: 'Overview', question: 'Summarize this log' },
  { intentId: 'health_summary', category: 'Overview', question: 'Give me an overview' },
  { intentId: 'health_summary', category: 'Overview', question: 'Overall health of the database?' },
  { intentId: 'health_summary', category: 'Overview', question: 'Quick report on this log' },
  { intentId: 'health_summary', category: 'Overview', question: 'Tell me about this log file' },
  { intentId: 'health_summary', category: 'Overview', question: 'Executive summary' },
  { intentId: 'performance_issues', category: 'Overview', question: 'Why is it slow?' },
  { intentId: 'performance_issues', category: 'Overview', question: "What's wrong with this cluster?" },
  { intentId: 'performance_issues', category: 'Overview', question: 'Performance problems?' },
  { intentId: 'recommendations', category: 'Overview', question: 'What should I fix first?' },
  { intentId: 'recommendations', category: 'Overview', question: 'What are your recommendations?' },
  { intentId: 'recommendations', category: 'Overview', question: 'Action items from this log' },
  { intentId: 'recommendations', category: 'Overview', question: 'What needs attention?' },

  // ── Version & topology ──
  { intentId: 'version', category: 'Version & topology', question: 'What MongoDB version?' },
  { intentId: 'version', category: 'Version & topology', question: 'Which edition is this?' },
  { intentId: 'version', category: 'Version & topology', question: 'Is this enterprise or community?' },
  { intentId: 'version', category: 'Version & topology', question: 'MongoDB release and build' },
  { intentId: 'build_info', category: 'Version & topology', question: 'Git version and build info?' },
  { intentId: 'build_info', category: 'Version & topology', question: 'OpenSSL and allocator?' },
  { intentId: 'topology', category: 'Version & topology', question: 'Is this a replica set?' },
  { intentId: 'topology', category: 'Version & topology', question: 'Is this sharded?' },
  { intentId: 'topology', category: 'Version & topology', question: 'Replica set name?' },
  { intentId: 'topology', category: 'Version & topology', question: 'What topology is this?' },
  { intentId: 'primary_role', category: 'Version & topology', question: 'Am I primary?' },
  { intentId: 'primary_role', category: 'Version & topology', question: 'Current node role?' },
  { intentId: 'replica_members', category: 'Version & topology', question: 'List replica set members' },
  { intentId: 'replica_members', category: 'Version & topology', question: 'Who are the RS members?' },
  { intentId: 'host', category: 'Version & topology', question: 'Hostname and port?' },
  { intentId: 'host', category: 'Version & topology', question: 'Where is this server?' },
  { intentId: 'host', category: 'Version & topology', question: 'dbPath and bind IP?' },
  { intentId: 'storage', category: 'Version & topology', question: 'Storage engine?' },
  { intentId: 'storage', category: 'Version & topology', question: 'Is this WiredTiger?' },
  { intentId: 'storage_stats', category: 'Version & topology', question: 'WiredTiger cache stats?' },
  { intentId: 'storage_stats', category: 'Version & topology', question: 'Storage engine statistics' },
  { intentId: 'atlas', category: 'Version & topology', question: 'Is this Atlas?' },
  { intentId: 'atlas', category: 'Version & topology', question: 'Cloud provider and region?' },

  // ── Performance ──
  { intentId: 'slow_count', category: 'Performance', question: 'How many slow queries?' },
  { intentId: 'slow_count', category: 'Performance', question: 'Count of slow operations' },
  { intentId: 'slowest', category: 'Performance', question: 'Slowest query?' },
  { intentId: 'slowest', category: 'Performance', question: 'Top 5 slow operations' },
  { intentId: 'slowest', category: 'Performance', question: 'Show slow queries' },
  { intentId: 'slowest', category: 'Performance', question: 'Worst performing query?' },
  { intentId: 'slow_total_time', category: 'Performance', question: 'Total time in slow ops?' },
  { intentId: 'slow_total_time', category: 'Performance', question: 'How much time wasted on slow queries?' },
  { intentId: 'query_patterns', category: 'Performance', question: 'Top query patterns?' },
  { intentId: 'query_patterns', category: 'Performance', question: 'Most common slow query shapes?' },
  { intentId: 'top_namespaces', category: 'Performance', question: 'Busiest namespace?' },
  { intentId: 'top_namespaces', category: 'Performance', question: 'Top collections by traffic' },
  { intentId: 'slowest_namespaces', category: 'Performance', question: 'Slowest namespaces by avg duration?' },
  { intentId: 'slowest_namespaces', category: 'Performance', question: 'Which collection is slowest on average?' },
  { intentId: 'operation_types', category: 'Performance', question: 'Operation type breakdown?' },
  { intentId: 'operation_types', category: 'Performance', question: 'Reads vs writes distribution?' },
  { intentId: 'large_results', category: 'Performance', question: 'Large result sets over 16MB?' },
  { intentId: 'large_results', category: 'Performance', question: 'Any huge reslen responses?' },
  { intentId: 'inefficient_queries', category: 'Performance', question: 'Queries examining too many documents?' },
  { intentId: 'inefficient_queries', category: 'Performance', question: 'High docs examined vs keys examined?' },
  { intentId: 'ixscan', category: 'Performance', question: 'How many IXSCAN operations?' },
  { intentId: 'ixscan', category: 'Performance', question: 'Index scans in slow ops?' },
  { intentId: 'timeline', category: 'Performance', question: 'Busiest time period?' },
  { intentId: 'timeline', category: 'Performance', question: 'Operations over time?' },
  { intentId: 'timeline', category: 'Performance', question: 'Traffic timeline' },

  // ── Indexes & COLLSCAN ──
  { intentId: 'collscan', category: 'Indexes & COLLSCAN', question: 'Any COLLSCAN?' },
  { intentId: 'collscan', category: 'Indexes & COLLSCAN', question: 'Collection scans in the log?' },
  { intentId: 'collscan', category: 'Indexes & COLLSCAN', question: 'Missing indexes?' },
  { intentId: 'collscan_internal', category: 'Indexes & COLLSCAN', question: 'Internal COLLSCAN on config?' },
  { intentId: 'collscan_internal', category: 'Indexes & COLLSCAN', question: 'System namespace scans?' },
  { intentId: 'index_suggestions', category: 'Indexes & COLLSCAN', question: 'What indexes should I add?' },
  { intentId: 'index_suggestions', category: 'Indexes & COLLSCAN', question: 'Index recommendations' },
  { intentId: 'index_suggestions', category: 'Indexes & COLLSCAN', question: 'createIndex suggestions' },

  // ── Errors & warnings ──
  { intentId: 'error_count', category: 'Errors & warnings', question: 'How many errors?' },
  { intentId: 'error_count', category: 'Errors & warnings', question: 'Error count in log' },
  { intentId: 'top_errors', category: 'Errors & warnings', question: 'Top errors?' },
  { intentId: 'top_errors', category: 'Errors & warnings', question: 'Show me the errors' },
  { intentId: 'top_errors', category: 'Errors & warnings', question: 'List recent errors' },
  { intentId: 'top_errors', category: 'Errors & warnings', question: 'What failed?' },
  { intentId: 'warning_count', category: 'Errors & warnings', question: 'How many warnings?' },
  { intentId: 'top_warnings', category: 'Errors & warnings', question: 'Top warnings?' },
  { intentId: 'top_warnings', category: 'Errors & warnings', question: 'Show warnings' },
  { intentId: 'severity_dist', category: 'Errors & warnings', question: 'Severity distribution?' },
  { intentId: 'severity_dist', category: 'Errors & warnings', question: 'Info vs warning vs error counts?' },
  { intentId: 'error_fix', category: 'Errors & warnings', question: 'How to fix auth errors?' },
  { intentId: 'error_fix', category: 'Errors & warnings', question: 'Fix suggestions for errors' },
  { intentId: 'error_fix', category: 'Errors & warnings', question: 'OOM or timeout remediation?' },

  // ── Security ──
  { intentId: 'audit', category: 'Security', question: 'Security issues?' },
  { intentId: 'audit', category: 'Security', question: 'Auth failures?' },
  { intentId: 'audit', category: 'Security', question: 'Audit events summary' },
  { intentId: 'audit', category: 'Security', question: 'TLS or SSL problems?' },
  { intentId: 'audit', category: 'Security', question: 'Unauthorized access attempts?' },

  // ── Applications & drivers ──
  { intentId: 'apps', category: 'Applications & drivers', question: 'Which applications connect?' },
  { intentId: 'apps', category: 'Applications & drivers', question: 'appName breakdown' },
  { intentId: 'apps', category: 'Applications & drivers', question: 'Which app causes slow queries?' },
  { intentId: 'drivers', category: 'Applications & drivers', question: 'Driver versions?' },
  { intentId: 'drivers', category: 'Applications & drivers', question: 'Java or Node driver version?' },

  // ── Connections ──
  { intentId: 'connections', category: 'Connections', question: 'Peak connections?' },
  { intentId: 'connections', category: 'Connections', question: 'Connection count and pool stats?' },
  { intentId: 'client_ips', category: 'Connections', question: 'Top client IP addresses?' },
  { intentId: 'client_ips', category: 'Connections', question: 'Which IPs connect?' },
  { intentId: 'long_connections', category: 'Connections', question: 'Long-lived connections?' },
  { intentId: 'long_connections', category: 'Connections', question: 'Stale connections?' },
  { intentId: 'conn_timeline', category: 'Connections', question: 'Connection open close timeline?' },

  // ── Time & coverage ──
  { intentId: 'time_range', category: 'Time & coverage', question: 'Log time range?' },
  { intentId: 'time_range', category: 'Time & coverage', question: 'Start and end timestamp?' },
  { intentId: 'line_counts', category: 'Time & coverage', question: 'How many lines parsed?' },
  { intentId: 'line_counts', category: 'Time & coverage', question: 'Skipped lines count?' },
  { intentId: 'db_operations', category: 'Time & coverage', question: 'How many database operations?' },
  { intentId: 'restarts', category: 'Time & coverage', question: 'Any restarts?' },
  { intentId: 'restarts', category: 'Time & coverage', question: 'Replica set state changes?' },
  { intentId: 'restart_detail', category: 'Time & coverage', question: 'When did the server restart?' },
  { intentId: 'rs_state_detail', category: 'Time & coverage', question: 'List RS state change events' },

  // ── Search & components ──
  { intentId: 'distinct_messages', category: 'Search & log content', question: 'Most common log messages?' },
  { intentId: 'distinct_messages', category: 'Search & log content', question: 'Distinct message types?' },
  { intentId: 'log_components', category: 'Search & log content', question: 'Which log components appear?' },
  { intentId: 'log_components', category: 'Search & log content', question: 'COMMAND vs QUERY component volume?' },

  // ── Help & navigation ──
  { intentId: 'help', category: 'Help', question: 'What can you answer?' },
  { intentId: 'help', category: 'Help', question: 'List all questions I can ask' },
  { intentId: 'help', category: 'Help', question: 'Help' },
  { intentId: 'knowledge_inventory', category: 'Help', question: 'What data was extracted from this log?' },
  { intentId: 'knowledge_inventory', category: 'Help', question: 'What information is in this log?' },
  { intentId: 'tab_guide', category: 'Help', question: 'Where do I find slow queries in the UI?' },
  { intentId: 'tab_guide', category: 'Help', question: 'Which tab shows indexes?' },
  { intentId: 'export_context', category: 'Help', question: 'Export JSON context' },
  { intentId: 'export_context', category: 'Help', question: 'Copy structured summary' },
]

/** Full bank: core + generated templates up to {@link TARGET_QUESTION_COUNT}. */
export const QUESTION_BANK = generateQuestionBank(CORE_QUESTION_BANK, TARGET_QUESTION_COUNT)

/** @param {string} q */
function bankQuestionKey(q) {
  return String(q || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** intentId for exact bank question text (panel clicks / catalog phrasing). */
const BANK_INTENT_BY_QUESTION = new Map(
  QUESTION_BANK.map((e) => [bankQuestionKey(e.question), e.intentId])
)

/**
 * Resolve intent from a question-bank entry (exact match after trim/normalize).
 * @param {string} question
 * @returns {string|null}
 */
export function lookupQuestionIntent(question) {
  return BANK_INTENT_BY_QUESTION.get(bankQuestionKey(question)) ?? null
}

/** @type {Record<string, string[]>} */
export const EXTRA_PATTERNS = {
  recommendations: [/\b(recommend|action item|fix first|priorit|what should i)\b/],
  build_info: [/\b(git version|openssl|allocator|build info|compiler)\b/],
  primary_role: [/\b(am i primary|current role|node role|primary or secondary)\b/],
  replica_members: [/\b(replica.*member|rs member|member list|members of)\b/],
  slowest_namespaces: [/\b(slowest namespace|slowest collection|avg.*namespace|namespace.*avg)\b/],
  top_warnings: [/\b(top warn|show warn|list warn|recent warn)\b/],
  severity_dist: [/\b(severity|info.*warn.*error|distribution.*severity)\b/],
  timeline: [/\b(timeline|over time|busiest (minute|period|hour)|traffic pattern)\b/],
  storage_stats: [/\b(wiredtiger.*cache|cache size|storage stat|ticket|cache pressure)\b/],
  long_connections: [/\b(long.?lived|long.?running conn|stale conn|idle conn)\b/],
  client_ips: [/\b(client ip|source ip|connecting ip|which ip)\b/],
  conn_timeline: [/\b(conn.*timeline|connection.*over time|open.*close.*event)\b/],
  inefficient_queries: [/\b(docs examined|keys examined|inefficient|examined too many|collscan.*docs)\b/],
  ixscan: [/\b(ixscan|index scan|using index)\b/],
  distinct_messages: [/\b(distinct message|common message|message template|unique msg)\b/],
  log_components: [/\b(log component|which component|component breakdown)\b/],
  db_operations: [/\b(db operation|database operation|ops count|how many ops)\b/],
  restart_detail: [/\b(when.*restart|restart event|startup event|last restart)\b/],
  rs_state_detail: [/\b(state change|stepdown|election|became primary)\b/],
  tab_guide: [/\b(which tab|where.*find|where.*see|open.*tab|ui.*tab)\b/],
}

/**
 * Merge bank examples into intent definitions.
 * @param {import('./questionCatalog.js').QuestionIntent[]} baseIntents
 */
const MAX_EXAMPLES_PER_INTENT = 48

export function enrichIntentsFromBank(baseIntents) {
  const byId = new Map(baseIntents.map((i) => [i.id, { ...i, examples: [...i.examples] }]))

  for (const { intentId, question } of QUESTION_BANK) {
    const intent = byId.get(intentId)
    if (!intent || intent.examples.length >= MAX_EXAMPLES_PER_INTENT) continue
    if (!intent.examples.includes(question)) intent.examples.push(question)
  }

  for (const [id, patterns] of Object.entries(EXTRA_PATTERNS)) {
    const intent = byId.get(id)
    if (!intent) continue
    intent.patterns = [...intent.patterns, ...patterns]
  }

  return [...byId.values()]
}

/** All example questions grouped by category (for UI). */
export function getFullQuestionBank() {
  const map = new Map()
  for (const { category, question, intentId } of QUESTION_BANK) {
    if (!map.has(category)) map.set(category, [])
    map.get(category).push({ question, intentId })
  }
  return [...map.entries()]
}

/** Flat unique questions for chips. */
export function getBankQuestionsFlat(limit = 200) {
  const seen = new Set()
  const out = []
  for (const { question, intentId } of QUESTION_BANK) {
    if (seen.has(question)) continue
    seen.add(question)
    out.push({ text: question, intentId })
    if (out.length >= limit) return out
  }
  return out
}

/**
 * Search the question bank (for UI filter).
 * @param {string} query
 * @param {number} [limit]
 */
/**
 * Filter question bank by category or question text (no limit).
 * @param {string} query
 */
export function filterQuestionBankGrouped(query) {
  const q = String(query || '').toLowerCase().trim()
  if (!q) return getFullQuestionBank()
  return getFullQuestionBank()
    .map(([category, items]) => [
      category,
      items.filter(
        (item) =>
          item.question.toLowerCase().includes(q) ||
          category.toLowerCase().includes(q) ||
          item.intentId.toLowerCase().includes(q)
      ),
    ])
    .filter(([, items]) => items.length > 0)
}

export function searchQuestionBank(query, limit = 500) {
  const q = String(query || '').toLowerCase().trim()
  if (!q) return getBankQuestionsFlat(limit)
  const out = []
  for (const { question, intentId, category } of QUESTION_BANK) {
    if (question.toLowerCase().includes(q) || category.toLowerCase().includes(q)) {
      out.push({ text: question, intentId, category })
      if (out.length >= limit) return out
    }
  }
  return out
}

export function getQuestionBankSize() {
  return QUESTION_BANK.length
}

export { TARGET_QUESTION_COUNT }
