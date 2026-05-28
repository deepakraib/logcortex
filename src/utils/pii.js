/**
 * PII / obfuscation utilities.
 *
 * Two modes:
 *   maskString()   — simple redaction with [REDACTED] tokens
 *   obfuscate()    — consistent replacement: same value always maps to the same fake
 *                    replacement within a session, making log correlation possible
 *                    without exposing real data.
 */

// ─── Consistent obfuscation maps (session-scoped, in-memory) ─────────────────
const _ipMap = new Map()
const _hostMap = new Map()
const _emailMap = new Map()
const _nsMap = new Map()
const _userMap = new Map()

const FAKE_IPS = [
  '10.0.0.1','10.0.0.2','10.0.0.3','10.0.0.4','10.0.0.5',
  '172.16.0.1','172.16.0.2','172.16.0.3','172.16.0.4','172.16.0.5',
]
const FAKE_HOSTS = ['alpha','bravo','charlie','delta','echo','foxtrot','golf','hotel','india','juliet']
const FAKE_EMAILS = ['user1@example.com','user2@example.com','user3@example.com','user4@example.com','user5@example.com']
const FAKE_USERS = ['admin1','svc_account1','app_user1','read_user1','write_user1']

function getOrSet(map, key, pool) {
  if (!map.has(key)) map.set(key, pool[map.size % pool.length])
  return map.get(key)
}

/** Consistent obfuscation — same input always → same fake value within a session */
export function obfuscate(str, maskNs = false) {
  if (typeof str !== 'string') return str
  return str
    // IPv4 — consistent replacement
    .replace(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g,
      (_, ip) => getOrSet(_ipMap, ip, FAKE_IPS))
    // IPv6
    .replace(/[0-9a-f]{4}:[0-9a-f:]{4,}/gi, '[IPv6]')
    // Email — consistent
    .replace(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi,
      (_, em) => getOrSet(_emailMap, em, FAKE_EMAILS))
    // MongoDB connection string
    .replace(/mongodb(\+srv)?:\/\/[^\s"']*/gi, 'mongodb://[REDACTED]')
    // SSN pattern: XXX-XX-XXXX
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]')
    // Credit card: 16-digit groups
    .replace(/\b(?:\d{4}[- ]){3}\d{4}\b/g, '[CARD]')
    // Phone: +X-XXX-XXX-XXXX or (XXX) XXX-XXXX
    .replace(/(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '[PHONE]')
    // User field — consistent
    .replace(/"user"\s*:\s*"([^"]+)"/gi,
      (_, u) => `"user":"${getOrSet(_userMap, u, FAKE_USERS)}"`)
    // Hostname (word.word.word pattern not already replaced)
    .replace(/\b([a-z][a-z0-9-]+\.[a-z][a-z0-9-]+\.[a-z]{2,})\b/gi,
      (_, h) => `${getOrSet(_hostMap, h, FAKE_HOSTS)}.example.com`)
    // Namespace masking (optional)
    .replace(/(["']?)([a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*)\1/g,
      maskNs ? (_, q, ns) => {
        const fake = getOrSet(_nsMap, ns, ['db1.col1','db1.col2','db2.col1','db2.col2','db3.col1'])
        return `${q}${fake}${q}`
      } : '$&')
}

/** Resets the consistent obfuscation maps (call when a new file is loaded) */
export function resetObfuscationMaps() {
  _ipMap.clear(); _hostMap.clear(); _emailMap.clear()
  _nsMap.clear(); _userMap.clear()
}

/** Simple masking — replaces with [REDACTED] tokens, no consistency */
export function maskString(str, enabled, maskNs = false, maskIp = false, maskHost = false, maskRs = false) {
  if (!enabled || typeof str !== 'string') return str
  let result = str

  if (maskIp) {
    result = result
      .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP_REDACTED]')
      .replace(/[0-9a-f]{4}:[0-9a-f:]{4,}/gi, '[IPv6_REDACTED]')
  }

  result = result
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[EMAIL_REDACTED]')
    .replace(/mongodb(\+srv)?:\/\/[^\s"']*/gi, '[CONN_STR_REDACTED]')
    .replace(/"user"\s*:\s*"[^"]+"/gi, '"user":"[USER_REDACTED]"')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN_REDACTED]')
    .replace(/\b(?:\d{4}[- ]){3}\d{4}\b/g, '[CARD_REDACTED]')
    .replace(/:\s*"([^"]{4,})"/g, (_, v) =>
      /^\d{4}-/.test(v) ? `: "${v}"` : ': "[VALUE_REDACTED]"'
    )

  // maskNs: replace db.collection patterns with [NS_REDACTED]
  if (maskNs) {
    result = result.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_.]*)\b/g, '[NS_REDACTED]')
  }

  // maskHost: replace common hostname patterns
  if (maskHost) {
    result = result.replace(/\b([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\b/g, '[HOST_REDACTED]')
  }

  // maskRs: replace replica set name patterns (common in logs as rsName: or "rs")
  if (maskRs) {
    // This is a bit heuristic, usually RS names are alphanumeric
    // We look for patterns like "setName": "rs0" or similar in JSON
    result = result.replace(/"setName"\s*:\s*"[^"]+"/gi, '"setName":"[RS_REDACTED]"')
  }

  return result
}
