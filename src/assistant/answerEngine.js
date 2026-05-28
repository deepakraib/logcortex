import { buildAssistantContext, formatKnowledgeInventory, LOG_DATA_CATALOG } from './logKnowledge.js'
import { getQuestionsByCategory } from './questionCatalog.js'
import { getFullQuestionBank, lookupQuestionIntent } from './questionBank.js'
import {
  normalizeQuestion,
  matchIntents,
  inferFallbackIntent,
  findNamespaceInQuestion,
  isChitchat,
  isLowSignalQuestion,
  tokenize,
} from './intentMatcher.js'

function fmtMs(ms) {
  if (ms == null) return '—'
  if (ms >= 3600000) return `${(ms / 3600000).toFixed(1)}h`
  if (ms >= 60000) return `${(ms / 60000).toFixed(0)}m`
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}

function editionLabel(module) {
  if (module === 'enterprise') return 'Enterprise'
  if (module === 'psmdb') return 'PSMDB-compatible'
  return 'Community'
}

/**
 * @param {string} intentId
 * @param {object|null} logData
 * @param {(s: string) => string} mask
 * @param {string} [questionText]
 */
function answerForIntent(intentId, logData, mask, questionText = '') {
  if (!logData) {
    if (intentId === 'help' || intentId === 'knowledge_inventory') {
      return answerForIntent(intentId, { metadata: {} }, mask)
    }
    return {
      text: 'Upload a MongoDB log file first — then I can answer questions about version, slow queries, errors, COLLSCAN, security, and more.',
      followUps: getQuestionsByCategory().flatMap(([, items]) => items.slice(0, 1).map((i) => i.question)).slice(0, 4),
    }
  }

  const m = logData.metadata
  const maskNs = (s) => mask(s || '')

  switch (intentId) {
    case 'greeting': {
      const loaded = Boolean(logData?.metadata?.filename)
      return {
        text: loaded
          ? "Hi — I'm the **Ask Log** assistant. I answer questions about **your loaded MongoDB log** (version, slow ops, errors, indexes, and more). I don't handle general chat.\n\nTry **Summarize this log**, open **Example questions**, or ask something like **How many slow queries?**"
          : "Hi — load a MongoDB log file first, then ask about slow queries, errors, COLLSCAN, version, topology, and more.",
        followUps: loaded
          ? ['Summarize this log', 'What can you answer?', 'How many slow queries?', 'Any COLLSCAN?']
          : ['What can you answer?', 'Help'],
      }
    }

    case 'help': {
      const bank = getFullQuestionBank()
      const lines = bank.map(([cat, items]) => {
        const sample = items.slice(0, 4).map((i) => i.question).join(' · ')
        return `**${cat}:** ${sample}`
      })
      return {
        text: `I answer log-analysis questions from your parsed data — local only, no cloud.\n\n${lines.join('\n\n')}\n\nExpand **Example questions** in the panel or type any phrasing close to the examples.`,
        followUps: ['Summarize this log', 'How many slow queries?', 'Any COLLSCAN?', 'What MongoDB version?'],
      }
    }

    case 'tab_guide': {
      const guides = [
        { re: /\b(slow|query pattern|scatter)\b/, tab: '**Slow Ops** / **Query Scatter**', hint: 'slow operations table and charts' },
        { re: /\b(error|warn|fix|assert|oom)\b/, tab: '**Errors**', hint: 'grouped errors with remediation' },
        { re: /\b(index|collscan)\b/, tab: '**Indexes**', hint: 'COLLSCAN namespaces and createIndex examples' },
        { re: /\b(audit|security|auth|tls)\b/, tab: '**Audit**', hint: 'security audit events' },
        { re: /\b(app|driver|client)\b/, tab: '**Apps**', hint: 'appName breakdown' },
        { re: /\b(reslen|large result|16)\b/, tab: '**Large Results**', hint: 'responses over 16MB' },
        { re: /\b(stat|connection|storage|overview)\b/, tab: '**Statistics** / **Insights**', hint: 'terminal-style stats and narrative insights' },
        { re: /\b(search|grep|filter|raw)\b/, tab: '**Log Search**', hint: 'filter raw log lines' },
      ]
      const q = normalizeQuestion(questionText)
      const hit = guides.find((g) => g.re.test(q))
      if (hit) {
        return {
          text: `For that topic, open the ${hit.tab} tab — ${hit.hint}.`,
          followUps: ['Summarize this log', 'Top errors?', 'Any COLLSCAN?'],
        }
      }
      return {
        text: [
          '**LogCortex tabs:**',
          '· **Insights** — narrative summary',
          '· **Slow Ops** — slow queries and patterns',
          '· **Errors** — errors/warnings with fixes',
          '· **Indexes** — COLLSCAN and index suggestions',
          '· **Audit** — security events',
          '· **Apps** — appName traffic',
          '· **Large Results** — reslen > 16MB',
          '· **Statistics** — CLI-style stats',
          '· **Log Search** — filter raw lines',
          '· **Query Scatter** — duration chart',
          '',
          'Ask e.g. "where do I find slow queries?" for a specific pointer.',
        ].join('\n'),
        followUps: ['Where do I find slow queries in the UI?', 'Which tab shows indexes?'],
      }
    }

    case 'knowledge_inventory':
      return {
        text: `After parsing, LogCortex holds **${LOG_DATA_CATALOG.length} categories** of data:\n\n${formatKnowledgeInventory()}`,
        followUps: ['What MongoDB version?', 'Any missing indexes?', 'Security issues?'],
      }

    case 'export_context': {
      const ctx = buildAssistantContext(logData, maskNs)
      return {
        text: 'Here is a **masked JSON summary** you can copy into another analysis workflow:\n\n```json\n' + JSON.stringify(ctx, null, 2) + '\n```',
        followUps: ['Summarize this log', 'Top errors?'],
        exportJson: ctx,
      }
    }

    case 'health_summary': {
      const slow = logData.slowOps?.length ?? 0
      const err = logData.errors?.length ?? 0
      const warn = logData.warnings?.length ?? 0
      const coll = Object.keys(logData.indexWarnings || {}).length
      const audit = logData.auditEvents?.length ?? 0
      let health = 'healthy'
      if (err > 50 || coll > 5) health = 'needs attention'
      if (err > 500 || slow > 5000) health = 'critical'
      return {
        text: [
          `**Overview** — log looks **${health}** for ${maskNs(m.filename)}.`,
          `**Server:** ${editionLabel(m.module)} MongoDB **${m.version || '?'}** · ${m.topology || '?'}${m.replSetName ? ` · rs/${m.replSetName}` : ''} · role **${m.currentRole || '?'}**`,
          `**Window:** ${m.startTime?.slice(0, 19) || '?'} → ${m.endTime?.slice(0, 19) || '?'} (${(m.parsedLines || 0).toLocaleString()} ops parsed)`,
          `**Counts:** ${slow.toLocaleString()} slow (>${100}ms default) · ${err.toLocaleString()} errors · ${warn.toLocaleString()} warnings · ${coll} namespaces with actionable COLLSCAN · ${audit} security events`,
          slow > 0 ? `**Slowest:** ${fmtMs(logData.slowOps[0]?.dur)} on \`${maskNs(logData.slowOps[0]?.ns) || '?'}\` (${logData.slowOps[0]?.plan || '?'})` : 'No slow operations above threshold.',
        ].join('\n\n'),
        followUps: ['Slowest query?', 'Top errors?', 'Which apps connect?'],
      }
    }

    case 'version':
      return {
        text: `**MongoDB ${m.version || 'unknown'}** (${editionLabel(m.module)} edition) · storage **${m.storage || '?'}**${m.gitVersion ? ` · git ${m.gitVersion}` : ''}${m.arch ? ` · ${m.arch}` : ''}${m.os ? ` · ${m.os}` : ''}.`,
        followUps: ['Is this end of life?', 'Topology?', 'Storage engine?'],
      }

    case 'topology':
      return {
        text: `**Topology:** ${m.topology || 'unknown'}${m.replSetName ? `\n**Replica set:** ${mask(m.replSetName)}` : ''}\n**Current role:** ${m.currentRole || 'unknown'}${m.rsMembers?.length ? `\n**Members seen:** ${m.rsMembers.length}` : ''}.`,
        followUps: ['Am I primary?', 'Any restarts?', 'Hostname?'],
      }

    case 'host':
      return {
        text: `**Host:** ${maskNs(m.hostname) || 'not detected'}${m.port ? `:${m.port}` : ''}${m.bindIp ? `\n**bindIp:** ${mask(m.bindIp)}` : ''}${m.dbPath ? `\n**dbPath:** ${m.dbPath}` : ''}.`,
        followUps: ['Which applications connect?', 'Connection peak?'],
      }

    case 'storage':
      return {
        text: `Storage engine: **${m.storage || 'unknown'}**${logData.storageStats?.length ? ` (${logData.storageStats.length} storage stat snapshots in log)` : ''}.`,
        followUps: ['Version?', 'Slow queries?'],
      }

    case 'atlas':
      if (m.provider || m.region) {
        return {
          text: `Cloud: **${m.provider || 'unknown'}** · region **${m.region || '?'}**.`,
          followUps: ['Summarize this log'],
        }
      }
      return { text: 'No Atlas/cloud provider markers detected — likely self-hosted or not logged.', followUps: ['Hostname?', 'Topology?'] }

    case 'time_range': {
      const start = m.startTime ? new Date(m.startTime) : null
      const end = m.endTime ? new Date(m.endTime) : null
      const dur = start && end ? end - start : null
      return {
        text: `**From** ${m.startTime?.slice(0, 19) || '?'} **to** ${m.endTime?.slice(0, 19) || '?'}${dur != null ? ` (**${fmtMs(dur)}** span)` : ''}.`,
        followUps: ['How many slow queries?', 'Any restarts?'],
      }
    }

    case 'line_counts':
      return {
        text: `**${(m.totalLines || 0).toLocaleString()}** total lines · **${(m.parsedLines || 0).toLocaleString()}** parsed as DB operations · **${m.skippedLines || 0}** skipped.`,
        followUps: ['Summarize this log', 'Slowest query?'],
      }

    case 'slow_count':
      return {
        text: `**${(logData.slowOps?.length ?? 0).toLocaleString()}** slow operations (threshold applies from UI/CLI).`,
        followUps: ['Slowest query?', 'Top query patterns?'],
      }

    case 'slowest': {
      const top = (logData.slowOps || []).slice(0, 5)
      if (!top.length) return { text: 'No slow operations found above the current threshold.', followUps: ['Lower slow threshold in header'] }
      const lines = top.map((r, i) => `${i + 1}. **${fmtMs(r.dur)}** · \`${maskNs(r.ns)}\` · ${r.opType} · plan: ${r.plan || '—'} · docs: ${r.docsEx ?? '—'}`)
      return { text: `**Top slow operations:**\n\n${lines.join('\n')}`, followUps: ['Total slow time?', 'Any COLLSCAN?'] }
    }

    case 'slow_total_time': {
      const total = (logData.slowOps || []).reduce((a, r) => a + (r.dur || 0), 0)
      return {
        text: `Combined duration of slow ops: **${fmtMs(total)}** across **${(logData.slowOps?.length ?? 0).toLocaleString()}** operations.`,
        followUps: ['Slowest query?', 'Top namespaces?'],
      }
    }

    case 'query_patterns': {
      const qp = (logData.queryPatterns || []).slice(0, 8)
      if (!qp.length) return { text: 'No aggregated query patterns (need slow ops in log).', followUps: ['How many slow queries?'] }
      const lines = qp.map((q) => `· \`${maskNs(q.ns)}\` ${q.op} \`${q.pattern}\` — **${q.count}×** avg **${q.mean}ms** p95 **${q.p95}ms**`)
      return { text: `**Top query patterns:**\n\n${lines.join('\n')}`, followUps: ['Any COLLSCAN?', 'Busiest namespace?'] }
    }

    case 'top_namespaces': {
      const ns = (logData.topNamespaces || []).slice(0, 8)
      const lines = ns.map((n) => `· \`${maskNs(n.ns)}\` — **${n.count.toLocaleString()}** ops · avg **${n.avgMs || 0}ms**`)
      return { text: `**Top namespaces by operation count:**\n\n${lines.join('\n')}`, followUps: ['Slowest namespaces?', 'Query patterns?'] }
    }

    case 'operation_types': {
      const ops = logData.operationTypes || []
      const lines = ops.map((o) => `· **${o.op}** — ${o.count.toLocaleString()}`)
      return { text: `**Operation breakdown:**\n\n${lines.join('\n')}`, followUps: ['How many slow queries?'] }
    }

    case 'collscan': {
      const all = Object.entries(logData.allCollscans || {})
      const actionable = Object.entries(logData.indexWarnings || {})
      if (!all.length) return { text: '**No COLLSCAN** plan summaries found in this log.', followUps: ['Top slow queries?', 'Summarize this log'] }
      const lines = all
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([ns, v]) => `· \`${maskNs(ns)}\` — **${v.count}** scans${v.internal ? ' _(internal)_' : ' _(actionable)_'}`)
      return {
        text: `**COLLSCAN namespaces:** ${all.length} total (${actionable.length} actionable for index review)\n\n${lines.join('\n')}`,
        followUps: ['What indexes should I add?', 'Internal COLLSCAN only?'],
      }
    }

    case 'collscan_internal': {
      const internal = Object.entries(logData.allCollscans || {}).filter(([, v]) => v.internal)
      if (!internal.length) return { text: 'No internal-namespace COLLSCAN recorded.', followUps: ['Any COLLSCAN?'] }
      const lines = internal.map(([ns, v]) => `· \`${maskNs(ns)}\` — ${v.count}`)
      return { text: `**Internal COLLSCAN** (config/local/system — indexes usually not recommended):\n\n${lines.join('\n')}`, followUps: ['Actionable COLLSCAN?'] }
    }

    case 'index_suggestions': {
      const actionable = Object.entries(logData.indexWarnings || {})
      if (!actionable.length) {
        return {
          text: 'No actionable COLLSCAN on user collections. Check **Indexes** tab for internal scans only.',
          followUps: ['Any COLLSCAN at all?', 'Top slow queries?'],
        }
      }
      const lines = actionable
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5)
        .map(([ns, v]) => `· \`${maskNs(ns)}\` — ${v.count} COLLSCAN(s). Review example commands in the **Indexes** tab.`)
      return {
        text: `**Index candidates** (user namespaces with COLLSCAN):\n\n${lines.join('\n')}\n\nOpen the **Indexes** tab for example queries and suggested \`createIndex\` shapes.`,
        followUps: ['Slowest on these namespaces?'],
      }
    }

    case 'error_count':
      return {
        text: `**${(logData.errors?.length ?? 0).toLocaleString()}** error lines (severity E/F).`,
        followUps: ['Top errors?', 'How many warnings?'],
      }

    case 'warning_count':
      return {
        text: `**${(logData.warnings?.length ?? 0).toLocaleString()}** warning lines (severity W).`,
        followUps: ['Top errors?', 'Summarize this log'],
      }

    case 'top_errors': {
      const errs = [...(logData.errors || [])].slice(0, 8)
      if (!errs.length) return { text: 'No errors in this log.', followUps: ['Warnings?', 'Summarize'] }
      const lines = errs.map((e) => `· ${e.ts?.slice(0, 19)} **[${e.s}]** ${e.c}: ${maskNs(e.msg)}${e.errMsg ? ` — ${maskNs(e.errMsg)}` : ''}`)
      return { text: `**Recent errors:**\n\n${lines.join('\n')}\n\nSee **Errors** tab for pattern-matched fix suggestions.`, followUps: ['How to fix auth errors?'] }
    }

    case 'error_fix':
      return {
        text: 'Open the **Errors** tab — it groups messages (auth, timeouts, OOM, write conflicts, assertions) with causes and copy-ready remediation commands. Ask me **"top errors"** for a quick list from this log.',
        followUps: ['Top errors?', 'How many errors?'],
      }

    case 'audit': {
      const summary = logData.auditSummary || []
      if (!summary.length) return { text: 'No security audit events detected.', followUps: ['Summarize this log'] }
      const lines = summary.map((a) => `· **${a.type}** (${a.sev}) — ${a.count}`)
      return {
        text: `**Security audit summary:**\n\n${lines.join('\n')}\n\nDetails in the **Audit** tab.`,
        followUps: ['Auth failures?', 'Summarize'],
      }
    }

    case 'apps': {
      const apps = (logData.appNames || []).slice(0, 10)
      if (!apps.length) return { text: 'No appName metadata in slow/command lines.', followUps: ['Driver versions?'] }
      const lines = apps.map((a) => `· **${maskNs(a.name)}** — ${a.count} ops · ${a.slowCount} slow · ${a.errors} errors · avg ${a.avgMs}ms`)
      return { text: `**Applications (appName):**\n\n${lines.join('\n')}`, followUps: ['Driver versions?', 'Top slow queries?'] }
    }

    case 'drivers': {
      const dr = logData.drivers || []
      if (!dr.length) return { text: 'No driver version strings detected.', followUps: ['Which applications?'] }
      const lines = dr.map((d) => `· **${d.name}** ${d.version || ''}`)
      return { text: `**Drivers seen:**\n\n${lines.join('\n')}`, followUps: ['Applications?'] }
    }

    case 'connections': {
      const cs = logData.connectionStats || {}
      const ips = (logData.ipStats || []).slice(0, 5)
      const ipLines = ips.map((i) => `· ${maskNs(i.ip)} — ${i.accepted} accepted`)
      return {
        text: `**Connections:** peak **${cs.peak ?? '?'}** · open events **${cs.open ?? 0}** · close **${cs.close ?? 0}** · unique IPs **${cs.uniqueIPs ?? 0}**${ipLines.length ? `\n\n**Top client IPs:**\n${ipLines.join('\n')}` : ''}`,
        followUps: ['Long connections?', 'Which apps?'],
      }
    }

    case 'large_results': {
      const big = (logData.topReslen || []).slice(0, 5)
      if (!big.length) return { text: 'No operations with reslen > 16MB detected.', followUps: ['Slow queries?'] }
      const lines = big.map((r) => `· ${r.ts?.slice(0, 19)} \`${maskNs(r.ns)}\` — **${(r.reslen / 1024 / 1024).toFixed(1)} MB** · ${fmtMs(r.dur)}`)
      return { text: `**Large result sets (>16MB):**\n\n${lines.join('\n')}`, followUps: ['Top slow queries?'] }
    }

    case 'restarts': {
      const r = logData.restartEvents?.length ?? 0
      const rs = logData.rsStateChanges?.length ?? 0
      return {
        text: `**Restart/startup events:** ${r} · **Replica set state changes:** ${rs}.`,
        followUps: ['When did the server restart?', 'List RS state change events'],
      }
    }

    case 'restart_detail': {
      const events = logData.restartEvents || []
      if (!events.length) return { text: 'No restart/startup events detected.', followUps: ['Any restarts?'] }
      const lines = events.slice(0, 6).map((e) => `· ${e.ts?.slice(0, 19) || '?'} — ${maskNs(e.msg || e.type || 'startup')}`)
      return { text: `**Restart / startup events:**\n\n${lines.join('\n')}`, followUps: ['Current role?', 'Time range?'] }
    }

    case 'rs_state_detail': {
      const events = logData.rsStateChanges || []
      if (!events.length) return { text: 'No replica set state changes logged.', followUps: ['Replica set name?'] }
      const lines = events.slice(0, 8).map((e) => `· ${e.ts?.slice(0, 19) || '?'} — ${e.stateBefore || '?'} → ${e.stateAfter || '?'}`)
      return { text: `**Replica set state changes:**\n\n${lines.join('\n')}`, followUps: ['Am I primary?', 'Any restarts?'] }
    }

    case 'db_operations':
      return {
        text: `**${(m.opsCount || m.parsedLines || 0).toLocaleString()}** database operations parsed from **${(m.parsedLines || 0).toLocaleString()}** log lines (${(m.totalLines || 0).toLocaleString()} total lines in file).`,
        followUps: ['How many slow queries?', 'Busiest namespace?'],
      }

    case 'build_info':
      return {
        text: [
          `**Version:** ${m.version || '?'}`,
          m.gitVersion ? `**Git:** ${m.gitVersion}` : null,
          m.openssl ? `**OpenSSL:** ${m.openssl}` : null,
          m.allocator ? `**Allocator:** ${m.allocator}` : null,
          m.pid ? `**PID:** ${m.pid}` : null,
          m.arch ? `**Arch:** ${m.arch}` : null,
          m.os ? `**OS:** ${m.os}` : null,
        ].filter(Boolean).join('\n'),
        followUps: ['Storage engine?', 'Topology?'],
      }

    case 'primary_role':
      return {
        text: `This node is **${m.currentRole || 'unknown'}**${m.replSetName ? ` in replica set **${mask(m.replSetName)}**` : ''} (${m.topology || 'topology unknown'}).`,
        followUps: ['List replica set members', 'Any restarts?'],
      }

    case 'replica_members': {
      const members = m.rsMembers || []
      if (!members.length) return { text: 'No replica set members detected in log.', followUps: ['Topology?'] }
      const lines = members.map((mb) => `· id **${mb.id}** — \`${mask(mb.host)}\`${mb.hidden ? ' (hidden)' : ''}${mb.arbiter ? ' (arbiter)' : ''}`)
      return { text: `**Replica set members (${members.length}):**\n\n${lines.join('\n')}`, followUps: ['Am I primary?', 'Hostname?'] }
    }

    case 'slowest_namespaces': {
      const ns = (logData.topSlowNs || []).slice(0, 8)
      if (!ns.length) return { text: 'No namespace duration stats available.', followUps: ['Busiest namespace?'] }
      const lines = ns.map((n) => `· \`${maskNs(n.ns)}\` — avg **${n.avgMs ?? n.avg ?? 0}ms**`)
      return { text: `**Slowest namespaces (by average duration):**\n\n${lines.join('\n')}`, followUps: ['Slowest query?', 'Top query patterns?'] }
    }

    case 'top_warnings': {
      const warns = [...(logData.warnings || [])].slice(0, 8)
      if (!warns.length) return { text: 'No warnings in this log.', followUps: ['How many warnings?', 'Top errors?'] }
      const lines = warns.map((w) => `· ${w.ts?.slice(0, 19)} **[W]** ${w.c}: ${maskNs(w.msg)}`)
      return { text: `**Recent warnings:**\n\n${lines.join('\n')}`, followUps: ['Top errors?', 'Severity distribution?'] }
    }

    case 'severity_dist': {
      const dist = logData.severityDist || []
      if (!dist.length) return { text: 'No severity distribution computed.', followUps: ['How many errors?'] }
      const lines = dist.map((d) => `· **${d.label || d.s}** — ${d.count.toLocaleString()}`)
      return { text: `**Severity breakdown:**\n\n${lines.join('\n')}`, followUps: ['Top errors?', 'How many warnings?'] }
    }

    case 'timeline': {
      const tl = logData.timelineData || []
      if (!tl.length) return { text: 'No timeline buckets in parsed data.', followUps: ['Time range?'] }
      const peak = [...tl].sort((a, b) => (b.count || 0) - (a.count || 0))[0]
      const total = tl.reduce((a, b) => a + (b.count || 0), 0)
      const lines = tl.slice(-5).map((b) => `· ${b.minute} — **${b.count}** ops`)
      return {
        text: `**Operations timeline:** ${total.toLocaleString()} ops across **${tl.length}** buckets.\n**Busiest:** ${peak?.minute || '?'} (**${peak?.count || 0}** ops).\n\nRecent buckets:\n${lines.join('\n')}`,
        followUps: ['Busiest namespace?', 'How many slow queries?'],
      }
    }

    case 'storage_stats': {
      const stats = logData.storageStats || []
      if (!stats.length) return { text: 'No detailed storage engine statistics in this log.', followUps: ['Storage engine?'] }
      const last = stats[stats.length - 1]
      const lines = Object.entries(last || {})
        .slice(0, 12)
        .map(([k, v]) => `· **${k}:** ${typeof v === 'number' ? v.toLocaleString() : v}`)
      return {
        text: `**Latest storage snapshot** (${stats.length} in log):\n\n${lines.join('\n')}`,
        followUps: ['Storage engine?', 'Summarize this log'],
      }
    }

    case 'long_connections': {
      const long = logData.longConns || []
      if (!long.length) return { text: 'No long-lived connections flagged.', followUps: ['Peak connections?'] }
      const lines = long.slice(0, 6).map((c) => `· ${maskNs(c.ip || c.ctx)} — **${fmtMs(c.durMs || c.duration)}**`)
      return { text: `**Long-lived connections:**\n\n${lines.join('\n')}`, followUps: ['Top client IPs?', 'Which applications?'] }
    }

    case 'client_ips': {
      const ips = (logData.ipStats || []).slice(0, 10)
      if (!ips.length) return { text: 'No per-IP connection stats.', followUps: ['Peak connections?'] }
      const lines = ips.map((i) => `· \`${maskNs(i.ip)}\` — **${i.accepted}** accepted · **${i.closed ?? 0}** closed`)
      return { text: `**Client IPs:**\n\n${lines.join('\n')}`, followUps: ['Long-lived connections?', 'Which apps?'] }
    }

    case 'conn_timeline': {
      const ct = logData.connTimeline || []
      if (!ct.length) return { text: 'No connection timeline data.', followUps: ['Peak connections?'] }
      const lines = ct.slice(-6).map((b) => `· ${b.minute} — open **${b.open ?? 0}** · close **${b.close ?? 0}**`)
      return { text: `**Connection activity (recent):**\n\n${lines.join('\n')}`, followUps: ['Peak connections?', 'Top client IPs?'] }
    }

    case 'inefficient_queries': {
      const bad = (logData.slowOps || [])
        .filter((r) => (r.docsEx ?? 0) > 100 && (r.keysEx ?? 0) < 10)
        .slice(0, 6)
      if (!bad.length) {
        return { text: 'No obvious high-docs / low-keys examined patterns in slow ops.', followUps: ['Any COLLSCAN?', 'Slowest query?'] }
      }
      const lines = bad.map((r) => `· \`${maskNs(r.ns)}\` — docs **${r.docsEx}** · keys **${r.keysEx ?? 0}** · ${fmtMs(r.dur)} · ${r.plan || '—'}`)
      return { text: `**Likely inefficient scans (high docs examined, few keys):**\n\n${lines.join('\n')}`, followUps: ['Any COLLSCAN?', 'What indexes should I add?'] }
    }

    case 'ixscan': {
      const ix = (logData.slowOps || []).filter((r) => r.plan && /ixscan/i.test(r.plan))
      return {
        text: `**${ix.length.toLocaleString()}** slow operation(s) used **IXSCAN** (of ${(logData.slowOps?.length ?? 0).toLocaleString()} slow ops total).`,
        followUps: ['Any COLLSCAN?', 'Slowest query?'],
      }
    }

    case 'distinct_messages': {
      const msgs = (logData.distinctMessages || []).slice(0, 10)
      if (!msgs.length) return { text: 'No distinct message catalog (load a log with parsed lines).', followUps: ['Summarize this log'] }
      const lines = msgs.map((m) => `· **${m.count}×** — ${maskNs(m.msg)?.slice(0, 100)}`)
      return { text: `**Top distinct messages:**\n\n${lines.join('\n')}`, followUps: ['Top errors?', 'Log components?'] }
    }

    case 'log_components': {
      const comps = logData.componentList || []
      if (!comps.length) {
        const fromOps = {}
        for (const e of [...(logData.errors || []), ...(logData.warnings || [])].slice(0, 500)) {
          if (e.c) fromOps[e.c] = (fromOps[e.c] || 0) + 1
        }
        const lines = Object.entries(fromOps).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c, n]) => `· **${c}** — ${n}`)
        if (!lines.length) return { text: 'No component breakdown available.', followUps: ['Summarize this log'] }
        return { text: `**Components (from errors/warnings sample):**\n\n${lines.join('\n')}`, followUps: ['Top errors?'] }
      }
      const lines = comps.slice(0, 12).map((c) => `· **${c.name || c}**${c.count != null ? ` — ${c.count}` : ''}`)
      return { text: `**Log components:**\n\n${lines.join('\n')}`, followUps: ['Top errors?', 'Distinct messages?'] }
    }

    case 'recommendations': {
      const items = []
      const coll = Object.keys(logData.indexWarnings || {}).length
      const slow = logData.slowOps?.length ?? 0
      const err = logData.errors?.length ?? 0
      if (coll > 0) items.push(`Review **${coll}** namespace(s) with COLLSCAN — open **Indexes** tab`)
      if (slow > 100) items.push(`Investigate **${slow.toLocaleString()}** slow ops — start with **Slowest query?**`)
      else if (slow > 0) items.push(`Check **${slow}** slow operation(s) — see **Slow Ops** tab`)
      if (err > 0) items.push(`Triage **${err.toLocaleString()}** errors — **Errors** tab has fix patterns`)
      if ((logData.auditEvents?.length ?? 0) > 0) items.push('Review **Audit** tab for security events')
      if ((logData.topReslen?.length ?? 0) > 0) items.push('Check **Large Results** for >16MB responses')
      if (!items.length) items.push('No critical issues at default thresholds — run **Summarize this log** for details')
      return {
        text: `**Recommended next steps:**\n\n${items.map((x) => `· ${x}`).join('\n')}`,
        followUps: ['Summarize this log', 'Slowest query?', 'Any COLLSCAN?'],
      }
    }

    case 'performance_issues': {
      const slow = logData.slowOps?.length ?? 0
      const coll = Object.keys(logData.indexWarnings || {}).length
      const err = logData.errors?.length ?? 0
      const parts = [
        `**Performance snapshot** for ${maskNs(m.filename)}:`,
        `· **${slow.toLocaleString()}** slow operations`,
        `· **${coll}** namespace(s) with actionable COLLSCAN`,
        `· **${err.toLocaleString()}** error lines`,
      ]
      if (slow > 0) {
        const top = logData.slowOps[0]
        parts.push(`· Worst: **${fmtMs(top.dur)}** on \`${maskNs(top.ns)}\` (${top.plan || 'unknown plan'})`)
      }
      if (coll > 0) {
        const [ns, v] = Object.entries(logData.indexWarnings).sort((a, b) => b[1].count - a[1].count)[0]
        parts.push(`· Top COLLSCAN: \`${maskNs(ns)}\` (**${v.count}** scans) — review **Indexes** tab`)
      }
      if (err > 0) {
        const e = logData.errors[0]
        parts.push(`· Latest error: ${e.ts?.slice(0, 19)} — ${maskNs(e.msg)?.slice(0, 80)}`)
      }
      if (!slow && !coll && !err) {
        parts.push('No major slow ops, COLLSCAN, or errors detected at default thresholds.')
      }
      return {
        text: parts.join('\n'),
        followUps: ['Slowest query?', 'Any COLLSCAN?', 'Top errors?', 'Summarize this log'],
      }
    }

    default:
      return null
  }
}

/**
 * @param {string} nsLower
 * @param {object} logData
 */
function resolveNamespaceKey(nsLower, logData) {
  for (const op of logData.slowOps || []) {
    if (op.ns?.toLowerCase() === nsLower) return op.ns
  }
  for (const n of logData.topNamespaces || []) {
    if (n.ns?.toLowerCase() === nsLower) return n.ns
  }
  for (const key of Object.keys(logData.indexWarnings || {})) {
    if (key.toLowerCase() === nsLower) return key
  }
  return nsLower
}

/**
 * @param {string} text
 * @param {string} nsLower
 * @param {object} logData
 * @param {(s: string) => string} mask
 */
function answerForNamespace(text, nsLower, logData, mask) {
  const ns = resolveNamespaceKey(nsLower, logData)
  const maskNs = (s) => mask(s || '')
  const slowOnNs = (logData.slowOps || []).filter((o) => o.ns?.toLowerCase() === nsLower)
  const coll = logData.indexWarnings?.[ns] || logData.allCollscans?.[ns]
  const nsStats = (logData.topNamespaces || []).find((n) => n.ns?.toLowerCase() === nsLower)

  if (/\b(slow|latency|duration|performance)\b/.test(text)) {
    if (!slowOnNs.length) {
      return {
        text: `No slow operations above threshold on \`${maskNs(ns)}\`.`,
        followUps: ['Busiest namespace?', 'Summarize this log'],
      }
    }
    const lines = slowOnNs
      .slice(0, 5)
      .map((r, i) => `${i + 1}. **${fmtMs(r.dur)}** · ${r.opType} · plan: ${r.plan || '—'}`)
    return {
      text: `**Slow ops on \`${maskNs(ns)}\`:** ${slowOnNs.length}\n\n${lines.join('\n')}`,
      followUps: ['Any COLLSCAN?', 'Top errors?'],
    }
  }

  if (/\b(collscan|index|scan)\b/.test(text)) {
    if (!coll) {
      return { text: `No COLLSCAN recorded on \`${maskNs(ns)}\`.`, followUps: ['Any COLLSCAN?', 'Slowest query?'] }
    }
    return {
      text: `**\`${maskNs(ns)}\`:** ${coll.count} COLLSCAN(s)${coll.internal ? ' _(internal)_' : ' _(review indexes)_'}.`,
      followUps: ['What indexes should I add?', 'Slow ops on this namespace?'],
    }
  }

  if (nsStats) {
    return {
      text: `**\`${maskNs(ns)}\`:** ${nsStats.count.toLocaleString()} operations · avg **${nsStats.avgMs || 0}ms** · ${slowOnNs.length} slow op(s) in log.`,
      followUps: ['Slow ops on this namespace?', 'Any COLLSCAN?'],
    }
  }

  return {
    text: `Found namespace \`${maskNs(ns)}\` in your question but limited stats. Try **Slowest query?** or **Any COLLSCAN?**`,
    followUps: ['Summarize this log', 'Top namespaces?'],
  }
}

/**
 * Answer a natural-language question about the loaded log.
 * @param {string} question
 * @param {object|null} logData
 * @param {{ mask?: (s: string) => string, slowThreshold?: number }} [options]
 * @returns {{ text: string, intentId: string|null, confidence: 'high'|'medium'|'low', followUps: string[], exportJson?: object }}
 */
export function answerQuestion(question, logData, options = {}) {
  const mask = options.mask || ((s) => s)
  const raw = String(question || '').trim()
  const bankIntentId = lookupQuestionIntent(raw)
  if (bankIntentId) {
    const bankResult = answerForIntent(bankIntentId, logData, mask, raw)
    if (bankResult) {
      return {
        ...bankResult,
        intentId: bankIntentId,
        confidence: 'high',
      }
    }
  }

  const text = normalizeQuestion(question)
  if (!text) {
    return {
      text: 'Ask a question about your loaded log — for example: "What MongoDB version?" or "Any COLLSCAN?"',
      intentId: null,
      confidence: 'low',
      followUps: ['Summarize this log', 'What can you answer?'],
    }
  }

  if (isChitchat(raw)) {
    const r = answerForIntent('greeting', logData, mask, raw)
    if (r) return { ...r, intentId: 'greeting', confidence: 'high' }
  }

  const lowSignal = isLowSignalQuestion(text, tokenize(text))

  const nsInQuestion = findNamespaceInQuestion(text, logData)
  if (nsInQuestion && logData) {
    const nsResult = answerForNamespace(text, nsInQuestion, logData, mask)
    if (nsResult) {
      return { ...nsResult, intentId: 'namespace_focus', confidence: 'medium' }
    }
  }

  const matches = matchIntents(text)
  const best = matches[0]
  const second = matches[1]

  if (lowSignal) {
    const r = answerForIntent('greeting', logData, mask, raw)
    if (r) {
      return { ...r, intentId: 'greeting', confidence: 'high' }
    }
  }

  const minStrongScore = lowSignal ? 8 : 3
  const minWeakScore = lowSignal ? 6 : 2

  // Strong single match
  if (best && best.score >= minStrongScore) {
    const result = answerForIntent(best.intent.id, logData, mask, question)
    if (result) {
      return {
        ...result,
        intentId: best.intent.id,
        confidence: best.score >= 7 ? 'high' : best.score >= 4 ? 'medium' : 'low',
      }
    }
  }

  // Close second intent — combine when both are informative and user question is broad
  if (
    best &&
    second &&
    best.score >= 4 &&
    second.score >= 4 &&
    second.score >= best.score - 2 &&
    /\b(and|also|plus|as well)\b/.test(text)
  ) {
    const a = answerForIntent(best.intent.id, logData, mask, question)
    const b = answerForIntent(second.intent.id, logData, mask, question)
    if (a && b) {
      return {
        text: `${a.text}\n\n---\n\n${b.text}`,
        intentId: best.intent.id,
        confidence: 'medium',
        followUps: a.followUps || b.followUps || [],
      }
    }
  }

  // Weaker match — still try best effort
  if (best && best.score >= minWeakScore) {
    const result = answerForIntent(best.intent.id, logData, mask, question)
    if (result) {
      return {
        ...result,
        intentId: best.intent.id,
        confidence: 'low',
      }
    }
  }

  const fallbackId = inferFallbackIntent(text, logData)
  if (fallbackId) {
    const r = answerForIntent(fallbackId, logData, mask, question)
    if (r) return { ...r, intentId: fallbackId, confidence: 'low' }
  }

  const suggestions = matches.slice(0, 4).map((m) => m.intent.examples[0])
  const nearMatch = matches[0]
  const hint = nearMatch && nearMatch.score >= 1
    ? `\n\n_Closest topic: **${nearMatch.intent.category}** — try: "${nearMatch.intent.examples[0]}"_`
    : ''

  return {
    text: logData
      ? `I did not match that exactly.${hint}\n\nTry one of these:\n\n${(suggestions.length ? suggestions : ['Summarize this log', 'How many slow queries?', 'Show me the errors', 'Any COLLSCAN?', 'What can you answer?']).map((s) => `· ${s}`).join('\n')}`
      : 'Load a log file first, then ask about version, slow queries, errors, indexes, or security.',
    intentId: null,
    confidence: 'low',
    followUps: suggestions.length ? suggestions : ['What can you answer?', 'Summarize this log'],
  }
}
