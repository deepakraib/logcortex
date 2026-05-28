# LogCortex Ask Log — knowledge base

This document describes what information MongoDB logs provide and what questions the **Ask Log** panel can answer. The assistant runs **entirely in your browser** using parsed `logData` — no API key, no cloud.

## What a MongoDB JSON log contains

MongoDB 4.4+ logs one JSON object per line with fields such as:

| Field | Meaning |
|-------|---------|
| `t` | Timestamp |
| `s` | Severity: I, W, E, F |
| `c` | Component: COMMAND, QUERY, ACCESS, REPL, … |
| `msg` | Human-readable message |
| `attr` | Structured attributes (ns, durationMillis, planSummary, command, …) |

Slow query lines (`msg: "Slow query"`) include namespace, duration, plan, docs/keys examined, and often the full command document.

## What LogCortex extracts (19 categories)

See `src/assistant/logKnowledge.js` → `LOG_DATA_CATALOG` for the full list. Summary:

1. **Server metadata** — version, edition, storage, topology, replica set, role, host, port, OS, cloud region  
2. **Slow operations** — individual slow queries with plan and command shape  
3. **Query patterns** — aggregated shapes with count and latency stats  
4. **COLLSCAN** — actionable vs internal namespaces  
5. **Errors & warnings** — severity E/F/W with component and message  
6. **Security audit** — auth failures, TLS, shutdown events  
7. **Applications** — appName breakdown  
8. **Drivers** — client driver name/version  
9. **Connections** — peak, per-IP stats, long sessions  
10. **Namespaces & operation types** — traffic distribution  
11. **Timeline & severity charts**  
12. **Large results** — reslen > 16MB  
13. **Restarts & RS state changes**  
14. **Raw lines** — for search/filter  
15. **Storage stats** — when present in log  

## Example questions (by topic)

### Overview
- Summarize this log  
- Overall health?  
- What information is in this log?  

### Version & topology
- What MongoDB version?  
- Is this sharded? Replica set name?  
- Am I primary?  
- Hostname and port?  
- Storage engine?  
- Is this Atlas?  

### Performance
- How many slow queries?  
- Slowest query?  
- Total time in slow ops?  
- Top query patterns?  
- Busiest namespace?  
- Large result sets?  

### Indexes
- Any COLLSCAN?  
- What indexes should I add?  
- Internal COLLSCAN on config?  

### Errors
- How many errors / warnings?  
- Top errors?  
- How to fix auth errors?  

### Security
- Security issues? Audit events?  

### Clients
- Which applications connect?  
- Driver versions?  
- Connection peak?  

### Time
- Time range of the log?  
- How many lines parsed?  
- Any restarts?  

### Export
- Export JSON context for external assistant  

## How matching works

`src/assistant/questionCatalog.js` defines **intents** with regex patterns and example phrases.  
`src/assistant/answerEngine.js` scores the user question against intents and builds an answer from `logData`.

For downstream analysis tools, use **Copy masked JSON** in the Ask Log panel or CLI:

```bash
logcortex info mongod.log --json --mask
```
