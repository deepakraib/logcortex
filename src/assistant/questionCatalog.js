/**
 * Question intents the Ask Log assistant can answer from parsed logData.
 * Examples are extended from questionBank.js for full log-analysis coverage.
 */

import { enrichIntentsFromBank } from './questionBank.js'

/** @typedef {{ id: string, category: string, examples: string[], patterns: RegExp[], needsLog?: boolean }} QuestionIntent */

export const QUESTION_CATEGORIES = [
  'Overview',
  'Version & topology',
  'Performance',
  'Indexes & COLLSCAN',
  'Errors & warnings',
  'Security',
  'Applications & drivers',
  'Connections',
  'Time & coverage',
  'Search & log content',
  'Help',
]

const BASE_INTENTS = [
  {
    id: 'greeting',
    category: 'Help',
    examples: ['Hi', 'Hello', 'How are you?'],
    patterns: [
      /^(hi|hey|hello|howdy|yo|sup|greetings)\b/i,
      /^how\s+are\s+you\b/i,
      /^what'?s\s+up\b/i,
      /^(thanks|thank\s+you|bye|goodbye)\b/i,
    ],
    needsLog: false,
  },
  {
    id: 'help',
    category: 'Help',
    examples: ['What can you answer?', 'Help'],
    patterns: [/\b(what can you|what questions|help me|how do i use|list all questions)\b/, /^help\b/],
    needsLog: false,
  },
  {
    id: 'knowledge_inventory',
    category: 'Help',
    examples: ['What information is in this log?'],
    patterns: [/\b(what information|what data|what do you have|list.*extract|fields available)\b/],
    needsLog: false,
  },
  {
    id: 'tab_guide',
    category: 'Help',
    examples: ['Which tab shows slow queries?'],
    patterns: [/\b(which tab|where.*find|where.*see|open.*tab)\b/],
    needsLog: false,
  },
  {
    id: 'export_context',
    category: 'Help',
    examples: ['Export JSON context'],
    patterns: [/\b(export.*json|copy.*context|assistant context|machine readable|structured export)\b/],
  },
  {
    id: 'health_summary',
    category: 'Overview',
    examples: ['Summarize this log', 'Overall health?'],
    patterns: [/\b(summarize|summary|overview|overall health|executive|tell me about|quick report)\b/],
  },
  {
    id: 'performance_issues',
    category: 'Overview',
    examples: ['Why is it slow?'],
    patterns: [/\b(why.*slow|performance (issue|problem)|bottleneck|lagging|high latency)\b/],
  },
  {
    id: 'recommendations',
    category: 'Overview',
    examples: ['What are your recommendations?'],
    patterns: [/\b(recommend|action item|needs attention|what should i fix)\b/],
  },
  {
    id: 'version',
    category: 'Version & topology',
    examples: ['What MongoDB version?'],
    patterns: [/\b(version|edition|mongodb v|what release|enterprise|community|psmdb)\b/],
  },
  {
    id: 'build_info',
    category: 'Version & topology',
    examples: ['Git version and build info?'],
    patterns: [/\b(git version|openssl|allocator|build info|compiler|pid)\b/],
  },
  {
    id: 'topology',
    category: 'Version & topology',
    examples: ['Is this sharded?', 'Replica set name?'],
    patterns: [/\b(topology|sharded|shard|replica set|replset|mongos|standalone)\b/],
  },
  {
    id: 'primary_role',
    category: 'Version & topology',
    examples: ['Am I primary?'],
    patterns: [/\b(am i primary|current role|node role|primary or secondary)\b/],
  },
  {
    id: 'replica_members',
    category: 'Version & topology',
    examples: ['List replica set members'],
    patterns: [/\b(replica.*member|rs member|member list)\b/],
  },
  {
    id: 'host',
    category: 'Version & topology',
    examples: ['Hostname and port?'],
    patterns: [/\b(hostname|host name|which host|what port|server name|bind|dbpath)\b/],
  },
  {
    id: 'storage',
    category: 'Version & topology',
    examples: ['Storage engine?'],
    patterns: [/\b(storage engine|wiredtiger|rocksdb)\b/],
  },
  {
    id: 'storage_stats',
    category: 'Version & topology',
    examples: ['WiredTiger cache stats?'],
    patterns: [/\b(wiredtiger.*cache|cache size|storage stat|ticket)\b/],
  },
  {
    id: 'atlas',
    category: 'Version & topology',
    examples: ['Is this Atlas?'],
    patterns: [/\b(atlas|cloud|aws|azure|gcp|region|provider)\b/],
  },
  {
    id: 'time_range',
    category: 'Time & coverage',
    examples: ['Log time range?'],
    patterns: [/\b(time range|how long|start time|end time|duration of log|span|timestamp)\b/],
  },
  {
    id: 'line_counts',
    category: 'Time & coverage',
    examples: ['How many lines parsed?'],
    patterns: [/\b(how many lines|total lines|parsed lines|skipped)\b/],
  },
  {
    id: 'db_operations',
    category: 'Time & coverage',
    examples: ['How many database operations?'],
    patterns: [/\b(db operation|database operation|ops count|how many ops|parsed as)\b/],
  },
  {
    id: 'slow_count',
    category: 'Performance',
    examples: ['How many slow queries?'],
    patterns: [/\b(how many slow|slow quer|slow op|number of slow|count.*slow)\b/],
  },
  {
    id: 'slowest',
    category: 'Performance',
    examples: ['Slowest query?', 'Show slow queries'],
    patterns: [/\b(slowest|top slow|worst quer|longest quer|max duration|show.*slow|list.*slow)\b/],
  },
  {
    id: 'slow_total_time',
    category: 'Performance',
    examples: ['Total time in slow ops?'],
    patterns: [/\b(total.*slow|wasted time|sum of slow|cumulative slow)\b/],
  },
  {
    id: 'query_patterns',
    category: 'Performance',
    examples: ['Top query patterns?'],
    patterns: [/\b(query pattern|common quer|frequent quer|slow pattern|query shape)\b/],
  },
  {
    id: 'top_namespaces',
    category: 'Performance',
    examples: ['Busiest namespace?'],
    patterns: [/\b(top namespace|busiest|hottest collection|most operations|top ns|by traffic)\b/],
  },
  {
    id: 'slowest_namespaces',
    category: 'Performance',
    examples: ['Slowest namespaces by avg duration?'],
    patterns: [/\b(slowest namespace|slowest collection|avg.*namespace|namespace.*avg|top slow ns)\b/],
  },
  {
    id: 'operation_types',
    category: 'Performance',
    examples: ['Operation type breakdown?'],
    patterns: [/\b(operation type|reads vs writes|command vs query|getmore|insert|update|delete)\b/],
  },
  {
    id: 'timeline',
    category: 'Performance',
    examples: ['Operations over time?'],
    patterns: [/\b(timeline|over time|busiest (minute|period|hour)|traffic pattern|ops per)\b/],
  },
  {
    id: 'inefficient_queries',
    category: 'Performance',
    examples: ['Queries examining too many documents?'],
    patterns: [/\b(docs examined|keys examined|inefficient|examined too many|high docs)\b/],
  },
  {
    id: 'ixscan',
    category: 'Performance',
    examples: ['How many IXSCAN operations?'],
    patterns: [/\b(ixscan|index scan)\b/],
  },
  {
    id: 'large_results',
    category: 'Performance',
    examples: ['Large result sets over 16MB?'],
    patterns: [/\b(large result|reslen|big response|16\s*mb|huge response)\b/],
  },
  {
    id: 'collscan',
    category: 'Indexes & COLLSCAN',
    examples: ['Any COLLSCAN?', 'Missing indexes?'],
    patterns: [/\b(collscan|collection scan|missing index|full scan)\b/],
  },
  {
    id: 'collscan_internal',
    category: 'Indexes & COLLSCAN',
    examples: ['Internal COLLSCAN?'],
    patterns: [/\b(internal collscan|config\.|system collscan)\b/],
  },
  {
    id: 'index_suggestions',
    category: 'Indexes & COLLSCAN',
    examples: ['What indexes should I add?'],
    patterns: [/\b(index suggest|create index|what index|should i index|index recommend)\b/],
  },
  {
    id: 'error_count',
    category: 'Errors & warnings',
    examples: ['How many errors?'],
    patterns: [/\b(how many error|error count|number of error|count.*error)\b/],
  },
  {
    id: 'warning_count',
    category: 'Errors & warnings',
    examples: ['How many warnings?'],
    patterns: [/\b(how many warn|warning count)\b/],
  },
  {
    id: 'top_errors',
    category: 'Errors & warnings',
    examples: ['Top errors?', 'Show me the errors'],
    patterns: [/\b(top error|common error|recent error|what failed|fatal|show.*error|list.*error)\b/],
  },
  {
    id: 'top_warnings',
    category: 'Errors & warnings',
    examples: ['Top warnings?', 'Show warnings'],
    patterns: [/\b(top warn|show warn|list warn|recent warn|common warn)\b/],
  },
  {
    id: 'severity_dist',
    category: 'Errors & warnings',
    examples: ['Severity distribution?'],
    patterns: [/\b(severity dist|info.*warn.*error|severity breakdown|how many info)\b/],
  },
  {
    id: 'error_fix',
    category: 'Errors & warnings',
    examples: ['How to fix auth errors?'],
    patterns: [/\b(how to fix|fix suggestion|tripwire|assert|write conflict|oom|timeout|remediation)\b/],
  },
  {
    id: 'audit',
    category: 'Security',
    examples: ['Security issues?', 'Auth failures?'],
    patterns: [/\b(security|audit|auth fail|unauthorized|tls|ssl|shutdown)\b/],
  },
  {
    id: 'apps',
    category: 'Applications & drivers',
    examples: ['Which applications connect?'],
    patterns: [/\b(application|appname|app name|which client|who connect)\b/],
  },
  {
    id: 'drivers',
    category: 'Applications & drivers',
    examples: ['Driver versions?'],
    patterns: [/\b(driver|mongo-go|pymongo|node driver|java driver)\b/],
  },
  {
    id: 'connections',
    category: 'Connections',
    examples: ['Peak connections?'],
    patterns: [/\b(connection|peak conn|unique ip|conn pool|open.*close)\b/],
  },
  {
    id: 'client_ips',
    category: 'Connections',
    examples: ['Top client IP addresses?'],
    patterns: [/\b(client ip|source ip|connecting ip|which ip|top ip)\b/],
  },
  {
    id: 'long_connections',
    category: 'Connections',
    examples: ['Long-lived connections?'],
    patterns: [/\b(long.?lived|long.?running conn|stale conn|idle conn)\b/],
  },
  {
    id: 'conn_timeline',
    category: 'Connections',
    examples: ['Connection timeline?'],
    patterns: [/\b(conn.*timeline|connection.*over time)\b/],
  },
  {
    id: 'restarts',
    category: 'Time & coverage',
    examples: ['Any restarts?'],
    patterns: [/\b(restart|startup|rs state|stepdown|election)\b/],
  },
  {
    id: 'restart_detail',
    category: 'Time & coverage',
    examples: ['When did the server restart?'],
    patterns: [/\b(when.*restart|restart event|startup event|last restart)\b/],
  },
  {
    id: 'rs_state_detail',
    category: 'Time & coverage',
    examples: ['List RS state change events'],
    patterns: [/\b(state change event|stepdown event|election event|became primary)\b/],
  },
  {
    id: 'distinct_messages',
    category: 'Search & log content',
    examples: ['Most common log messages?'],
    patterns: [/\b(distinct message|common message|message template|unique msg)\b/],
  },
  {
    id: 'log_components',
    category: 'Search & log content',
    examples: ['Which log components appear?'],
    patterns: [/\b(log component|which component|component breakdown|COMMAND component)\b/],
  },
]

export const QUESTION_INTENTS = enrichIntentsFromBank(BASE_INTENTS)

/** Flat list of example questions for UI chips (deduped). */
export function getSuggestedQuestions(limit = 24) {
  const seen = new Set()
  const out = []
  for (const intent of QUESTION_INTENTS) {
    for (const ex of intent.examples) {
      if (!seen.has(ex) && out.length < limit) {
        seen.add(ex)
        out.push({ text: ex, intentId: intent.id })
      }
    }
  }
  return out
}

/** Group examples by category for the knowledge panel. */
export function getQuestionsByCategory() {
  const map = new Map()
  for (const cat of QUESTION_CATEGORIES) map.set(cat, [])
  for (const intent of QUESTION_INTENTS) {
    if (!map.has(intent.category)) map.set(intent.category, [])
    for (const ex of intent.examples) {
      map.get(intent.category).push({ question: ex, intentId: intent.id })
    }
  }
  return [...map.entries()].filter(([, items]) => items.length > 0)
}
