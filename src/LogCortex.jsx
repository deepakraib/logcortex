import { useState, useCallback, useEffect, useRef } from 'react'
import pako from 'pako'
import {
  Activity, Upload, Clock, AlertCircle, Database, BarChart2,
  Search, Hash, AlertTriangle, Lightbulb,
  Shield, ShieldOff, RefreshCw, X, ShieldAlert, Layers, TrendingUp, Download,
} from 'lucide-react'
import ServerInfoBar from './components/ui/ServerInfoBar'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend, ResponsiveContainer,
} from 'recharts'

import { parseLogFile } from './utils/parseLogFile'
import { maskString, resetObfuscationMaps } from './utils/pii'
import { COLORS, SEV_COLORS } from './utils/constants'
import { ChartTip } from './components/charts/ChartTip'
import SlowOpsTab from './components/tabs/SlowOpsTab'
import ErrorsTab from './components/tabs/ErrorsTab'
import IndexesTab from './components/tabs/IndexesTab'
import StatisticsTab from './components/tabs/StatisticsTab'
import LogSearchTab from './components/tabs/LogSearchTab'
import QueryScatterTab from './components/tabs/QueryScatterTab'
import AuditTab from './components/tabs/AuditTab'
import AppNamesTab from './components/tabs/AppNamesTab'
import ReslenTab from './components/tabs/ReslenTab'
import InsightsTab from './components/tabs/InsightsTab'
import AskLogPanel from './panels/AskLogPanel'

const TABS = [
  { id: 'insights', label: 'Insights', Icon: Lightbulb },
  { id: 'slowOps', label: 'Slow Ops', Icon: Clock },
  { id: 'errors', label: 'Errors', Icon: AlertCircle },
  { id: 'indexes', label: 'Indexes', Icon: Database },
  { id: 'audit', label: 'Audit', Icon: ShieldAlert },
  { id: 'appnames', label: 'Apps', Icon: Layers },
  { id: 'reslen', label: 'Large Results', Icon: TrendingUp },
  { id: 'stats', label: 'Statistics', Icon: BarChart2 },
  { id: 'search', label: 'Log Search', Icon: Search },
  { id: 'scatter', label: 'Query Scatter', Icon: Activity },
]

// Accept any file — format is detected by magic bytes at parse time,
// so .logs, .log, .tar, .gz, no-extension all work.
function isAccepted(filename) {
  const n = filename.toLowerCase()
  const rejected = ['.exe', '.dll', '.so']
  return !rejected.some(ext => n.endsWith(ext))
}

// ── Session persistence helpers (survives refresh, clears on tab close) ───────
const SESSION_KEY = 'logcortex_session_v1'
const SESSION_PREF_KEY = 'logcortex_persist_opt_in_v1'

function uint8ToB64(arr) {
  let binary = ''
  const chunk = 8192
  for (let i = 0; i < arr.length; i += chunk)
    binary += String.fromCharCode(...arr.subarray(i, i + chunk))
  return btoa(binary)
}

function b64ToUint8(b64) {
  const binary = atob(b64)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
  return arr
}

function saveSession(logData) {
  try {
    // Exclude rawLines — can be hundreds of MB; Log Search will show a re-upload note
    const { rawLines: _raw, ...saveable } = logData
    const json = JSON.stringify(saveable)
    const compressed = pako.deflate(json)
    sessionStorage.setItem(SESSION_KEY, uint8ToB64(compressed))
  } catch {
    try { sessionStorage.removeItem(SESSION_KEY) } catch {}
  }
}

function loadSession() {
  try {
    const b64 = sessionStorage.getItem(SESSION_KEY)
    if (!b64) return null
    const compressed = b64ToUint8(b64)
    const json = pako.inflate(compressed, { to: 'string' })
    return JSON.parse(json)
  } catch {
    try { sessionStorage.removeItem(SESSION_KEY) } catch {}
    return null
  }
}

function loadPersistPreference() {
  try {
    return sessionStorage.getItem(SESSION_PREF_KEY) === '1'
  } catch {
    return false
  }
}

function savePersistPreference(enabled) {
  try {
    if (enabled) sessionStorage.setItem(SESSION_PREF_KEY, '1')
    else sessionStorage.removeItem(SESSION_PREF_KEY)
  } catch {}
}

export default function LogCortex() {
  const [logData, setLogData] = useState(null)
  const [isParsing, setIsParsing] = useState(false)
  const [parseProgress, setParseProgress] = useState(0)
  const [parseError, setParseError] = useState(null)
  const [parseWarning, setParseWarning] = useState(null)
  const [activeTab, setActiveTab] = useState('insights')
  const [chatWidthPct, setChatWidthPct] = useState(38)
  const [isChatCollapsed, setIsChatCollapsed] = useState(false)
  const [isResizingChat, setIsResizingChat] = useState(false)
  const resizeFrameRef = useRef(null)
  const [piiEnabled, setPiiEnabled] = useState(false)
  const [maskNs, setMaskNs] = useState(false)
  const [maskIp, setMaskIp] = useState(false)
  const [maskHost, setMaskHost] = useState(false)
  const [maskRs, setMaskRs] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [sessionRestored, setSessionRestored] = useState(false)
  const [slowThreshold, setSlowThreshold] = useState(100) // ms
  const [persistSession, setPersistSession] = useState(() => loadPersistPreference())

  // ── Restore session on mount ──────────────────────────────────────────────
  useEffect(() => {
    if (!persistSession) return
    const saved = loadSession()
    if (saved) {
      setLogData(saved)
      setActiveTab('insights')
      setSessionRestored(true)
      setTimeout(() => setSessionRestored(false), 3000)
    }
  }, [persistSession])

  useEffect(() => {
    savePersistPreference(persistSession)
    if (!persistSession) {
      try { sessionStorage.removeItem(SESSION_KEY) } catch {}
    }
  }, [persistSession])

  // ── Save session whenever logData changes ─────────────────────────────────
  useEffect(() => {
    if (!persistSession) return
    if (logData) saveSession(logData)
    else try { sessionStorage.removeItem(SESSION_KEY) } catch {}
  }, [logData, persistSession])

  // Ask Log panel resize (drag divider between analysis and chat)
  useEffect(() => {
    if (!isResizingChat) return

    function onMouseMove(e) {
      if (resizeFrameRef.current) cancelAnimationFrame(resizeFrameRef.current)
      resizeFrameRef.current = requestAnimationFrame(() => {
        const next = Math.round((1 - (e.clientX / window.innerWidth)) * 100)
        const clamped = Math.min(55, Math.max(28, next))
        setChatWidthPct(clamped)
      })
    }

    function onMouseUp() {
      setIsResizingChat(false)
      if (resizeFrameRef.current) {
        cancelAnimationFrame(resizeFrameRef.current)
        resizeFrameRef.current = null
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizingChat])

  const mask = useCallback(
    (s) => maskString(s, piiEnabled, maskNs, maskIp, maskHost, maskRs),
    [piiEnabled, maskNs, maskIp, maskHost, maskRs]
  )

  const handleFile = useCallback(async (file) => {
    if (!file) return
    if (!isAccepted(file.name)) {
      setParseError(
        'Unsupported file type. Upload a MongoDB log as plain text or compressed archive ' +
        '(.log, .logs, .json, .txt, .gz, .zip, .tar, .tar.gz, .tgz). ' +
        'PDF and image files are not supported.'
      )
      setParseWarning(null)
      return
    }
    // Warn on large files, hard-stop on extremely large ones
    const MB = 1024 * 1024
    const GB = 1024 * MB
    const sizeMb = file.size / MB
    const sizeGb = (file.size / GB).toFixed(1)
    if (file.size > 5 * GB) {
      setParseError(`File too large (${sizeGb} GB). Maximum supported size is 5 GB for browser parsing. For larger files, extract a smaller time range first using grep or mongodump.`)
      setParseWarning(null)
      return
    }
    const largeFileWarning = file.size > 500 * MB
      ? `Large file (${sizeMb.toFixed(0)} MB). Parsing may be slow and memory-intensive — this is normal for files over 500 MB. Please be patient.`
      : null
    setParseError(null)
    setParseWarning(largeFileWarning)
    setIsParsing(true)
    setParseProgress(0)
    setLogData(null)
    setActiveTab('insights')
    resetObfuscationMaps()
    try {
      const data = await parseLogFile(file, setParseProgress, slowThreshold)
      setLogData(data)
      if (data?.metadata?.parsedLines === 0 && data?.metadata?.totalLines > 0) {
        setParseWarning(
          `Parsed ${data.metadata.totalLines.toLocaleString()} lines but found no MongoDB JSON log entries. ` +
          'Ensure this is a MongoDB 4.0+ JSON-format log (not a legacy text log or syslog).'
        )
      } else {
        setParseWarning(null)
      }
    } catch (e) {
      setParseError(`Failed to parse: ${e.message}`)
      setParseWarning(null)
    } finally {
      setIsParsing(false)
      setParseProgress(100)
    }
  }, [slowThreshold])

  const onDrop = useCallback(
    (e) => {
      e.preventDefault()
      setDragOver(false)
      handleFile(e.dataTransfer.files[0])
    },
    [handleFile]
  )

  function esc(s) {
    if (s == null) return ''
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/`/g, '&#96;')
      .replace(/\//g, '&#47;')
  }

  function exportHtmlReport() {
    if (!logData) return
    const m = logData.metadata
    const slowRows = logData.slowOps.slice(0, 50).map(r =>
      `<tr><td>${esc(r.ts?.slice(0,19))}</td><td>${esc(mask(r.ns))}</td><td>${esc(r.opType)}</td><td style="color:#F59E0B;font-weight:bold">${esc(r.dur)}</td><td>${esc(r.plan)}</td><td>${esc(r.docsEx??'')}</td><td>${esc(r.keysEx??'')}</td></tr>`
    ).join('')
    const errRows = [...logData.errors,...logData.warnings].slice(0,100).map(r =>
      `<tr><td>${esc(r.ts?.slice(0,19))}</td><td style="color:${r.s==='E'||r.s==='F'?'#EF4444':'#F59E0B'}">${esc(r.s)}</td><td>${esc(r.c)}</td><td>${esc(mask(r.msg))}${r.errMsg?` — ${esc(mask(r.errMsg))}`:''}` + `</td></tr>`
    ).join('')
    const auditRows = (logData.auditEvents||[]).map(r =>
      `<tr><td>${esc(r.ts?.slice(0,19))}</td><td style="color:${r.sev==='Critical'?'#EF4444':r.sev==='High'?'#F59E0B':'#EAB308'}">${esc(r.sev)}</td><td>${esc(r.type)}</td><td>${esc(mask(r.user))}</td><td>${esc(mask(r.msg))}</td></tr>`
    ).join('')
    const nsRows = logData.topNamespaces.slice(0,20).map(r =>
      `<tr><td>${esc(mask(r.ns))}</td><td>${r.count}</td><td>${r.avgMs||0}ms</td></tr>`
    ).join('')
    const appRows = (logData.appNames||[]).map(r =>
      `<tr><td>${esc(mask(r.name))}</td><td>${r.count}</td><td>${r.slowCount}</td><td>${r.errors}</td><td>${r.avgMs}ms</td></tr>`
    ).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>LogCortex Report — ${esc(m.filename)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,sans-serif;background:#0F1117;color:#E2E8F0;padding:2rem}
h1{color:#00D4AA;font-size:1.5rem;margin-bottom:.25rem}
h2{color:#00D4AA;font-size:1rem;margin:1.5rem 0 .75rem;border-bottom:1px solid #ffffff15;padding-bottom:.4rem}
.meta{color:#64748b;font-size:.8rem;margin-bottom:2rem;font-family:monospace}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:2rem}
.card{background:#161B22;border:1px solid #ffffff0f;border-radius:.75rem;padding:1rem}
.card-label{font-size:.7rem;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.25rem}
.card-value{font-size:1.5rem;font-weight:700}
.accent{color:#00D4AA}.danger{color:#EF4444}.warning{color:#F59E0B}.caution{color:#EAB308}
table{width:100%;border-collapse:collapse;font-size:.75rem;margin-bottom:1.5rem}
thead tr{background:#1C2333}
th{text-align:left;padding:.5rem .75rem;color:#64748b;font-weight:500;text-transform:uppercase;font-size:.65rem;letter-spacing:.05em}
td{padding:.4rem .75rem;border-top:1px solid #ffffff08;font-family:monospace}
tr:hover td{background:#ffffff05}
footer{margin-top:3rem;color:#64748b;font-size:.7rem;text-align:center}
</style></head><body>
<h1>LogCortex — MongoDB Log Analysis Report</h1>
<div class="meta">
File: ${esc(m.filename)} | MongoDB ${esc(m.version)} | Storage: ${esc(m.storage)}<br>
Time range: ${esc(m.startTime)||'?'} → ${esc(m.endTime)||'?'}<br>
Lines: ${m.totalLines.toLocaleString()} total | ${m.parsedLines.toLocaleString()} parsed | ${m.skippedLines} skipped<br>
Generated: ${new Date().toISOString()}
</div>
<div class="cards">
  <div class="card"><div class="card-label">Total Operations</div><div class="card-value accent">${m.parsedLines.toLocaleString()}</div></div>
  <div class="card"><div class="card-label">Slow Queries &gt;${m.slowThresholdMs ?? slowThreshold}ms</div><div class="card-value warning">${logData.slowOps.length.toLocaleString()}</div></div>
  <div class="card"><div class="card-label">Errors</div><div class="card-value danger">${logData.errors.length.toLocaleString()}</div></div>
  <div class="card"><div class="card-label">Security Events</div><div class="card-value caution">${(logData.auditEvents||[]).length}</div></div>
</div>
<h2>Top Slow Operations</h2>
<table><thead><tr><th>Time</th><th>Namespace</th><th>Op</th><th>Duration</th><th>Plan</th><th>Docs Ex.</th><th>Keys Ex.</th></tr></thead><tbody>${slowRows}</tbody></table>
<h2>Errors &amp; Warnings</h2>
<table><thead><tr><th>Time</th><th>Sev</th><th>Component</th><th>Message</th></tr></thead><tbody>${errRows}</tbody></table>
<h2>Security Audit Events</h2>
${auditRows ? `<table><thead><tr><th>Time</th><th>Severity</th><th>Event</th><th>User</th><th>Message</th></tr></thead><tbody>${auditRows}</tbody></table>` : '<p style="color:#64748b;font-size:.8rem">No security events detected.</p>'}
<h2>Top Namespaces</h2>
<table><thead><tr><th>Namespace</th><th>Operations</th><th>Avg Duration</th></tr></thead><tbody>${nsRows}</tbody></table>
<h2>Application Breakdown</h2>
${appRows ? `<table><thead><tr><th>App / Driver</th><th>Total Ops</th><th>Slow Ops</th><th>Errors</th><th>Avg Duration</th></tr></thead><tbody>${appRows}</tbody></table>` : '<p style="color:#64748b;font-size:.8rem">No appName data found in log.</p>'}
<footer>Generated by LogCortex — MongoDB Log Analyzer</footer>
</body></html>`

    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `logcortex-report-${m.filename.replace(/[^a-z0-9]/gi, '_')}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const stats = logData
    ? [
        { label: 'DB Operations', value: (logData.metadata.opsCount || logData.metadata.parsedLines).toLocaleString(), sub: 'COMMAND/QUERY/WRITE', Icon: Hash, color: 'text-accent', bg: 'bg-accent/10' },
        { label: 'Slow Queries', value: logData.slowOps.length.toLocaleString(), sub: `>${slowThreshold}ms`, Icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
        { label: 'Errors', value: logData.errors.length.toLocaleString(), Icon: AlertCircle, color: 'text-danger', bg: 'bg-danger/10' },
        { label: 'Warnings', value: logData.warnings.length.toLocaleString(), Icon: AlertTriangle, color: 'text-caution', bg: 'bg-caution/10' },
      ]
    : []

  return (
    <div className="flex h-screen bg-base text-white font-ui overflow-hidden">

      {/* Main analysis panel */}
      <div
        className="flex flex-col border-r border-white/5 overflow-hidden min-w-0"
        style={{ width: isChatCollapsed ? 'calc(100% - 3rem)' : `calc(100% - ${chatWidthPct}% - 0.25rem)` }}
      >

        {/* Header */}
        <div className="flex-shrink-0 p-4 border-b border-white/5 bg-surface">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-accent/15 flex items-center justify-center">
                <Activity size={20} className="text-accent" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">LogCortex</h1>
                <p className="text-xs text-white/40">MongoDB Log Analyzer</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-white/40">
                <Clock size={12} className="text-white/30" />
                Slow &gt;
                <input
                  type="number"
                  value={slowThreshold}
                  onChange={e => setSlowThreshold(Math.max(1, parseInt(e.target.value) || 100))}
                  className="w-14 bg-elevated border border-white/10 rounded px-2 py-1 text-xs font-mono text-white text-center focus:outline-none focus:border-accent/50"
                  min="1"
                />
                ms
              </label>
              <button
                onClick={() => setPiiEnabled((e) => !e)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  piiEnabled
                    ? 'bg-accent/20 text-accent border border-accent/30'
                    : 'bg-white/5 text-white/40 hover:text-white/70 border border-white/10'
                }`}
                title="Toggle PII masking"
              >
                {piiEnabled ? <Shield size={13} /> : <ShieldOff size={13} />}
                {piiEnabled ? 'Masking ON' : 'Mask PII'}
              </button>
              <label className="flex items-center gap-1 text-xs text-white/40 cursor-pointer">
                <input
                  type="checkbox"
                  checked={persistSession}
                  onChange={(e) => setPersistSession(e.target.checked)}
                  className="accent-accent"
                />
                Remember session
              </label>
              {piiEnabled && (
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-xs text-white/40 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={maskNs}
                      onChange={(e) => setMaskNs(e.target.checked)}
                      className="accent-accent"
                    />
                    NS
                  </label>
                  <label className="flex items-center gap-1 text-xs text-white/40 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={maskIp}
                      onChange={(e) => setMaskIp(e.target.checked)}
                      className="accent-accent"
                    />
                    IP
                  </label>
                  <label className="flex items-center gap-1 text-xs text-white/40 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={maskHost}
                      onChange={(e) => setMaskHost(e.target.checked)}
                      className="accent-accent"
                    />
                    Host
                  </label>
                  <label className="flex items-center gap-1 text-xs text-white/40 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={maskRs}
                      onChange={(e) => setMaskRs(e.target.checked)}
                      className="accent-accent"
                    />
                    RS
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* Upload zone */}
          {!logData && !isParsing && (
            <div
              className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                dragOver
                  ? 'border-accent bg-accent/10'
                  : 'border-white/10 hover:border-accent/50 hover:bg-white/2'
              }`}
              onDrop={onDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => document.getElementById('fileInput').click()}
            >
              <input
                id="fileInput"
                type="file"
                accept="*"
                className="hidden"
                onChange={(e) => {
                  handleFile(e.target.files[0])
                  e.target.value = ''
                }}
              />
              <Upload size={28} className={`mx-auto mb-2 ${dragOver ? 'text-accent' : 'text-white/20'}`} />
              <p className="text-sm text-white/60 font-medium">Drop your MongoDB log file here</p>
              <p className="text-xs text-white/30 mt-1">
                .log · .logs · .json · .gz · .zip · .tar · .tar.gz · .tgz · any MongoDB log
              </p>
            </div>
          )}

          {/* Progress bar */}
          {isParsing && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-white/40 mb-1">
                <span className="flex items-center gap-1.5">
                  <RefreshCw size={11} className="animate-spin text-accent" />
                  Parsing log file…
                </span>
                <span>{parseProgress}%</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-200 rounded-full"
                  style={{ width: `${parseProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* File meta bar */}
          {logData && (
            <div className="flex items-center gap-4 text-xs font-mono mt-1 flex-wrap">
              <span className="text-accent font-medium truncate max-w-48">
                {logData.metadata.filename}
              </span>
              <span className="text-white/40">{logData.metadata.totalLines.toLocaleString()} lines</span>
              <span className="text-white/40">{logData.metadata.parsedLines.toLocaleString()} parsed</span>
              {logData.metadata.startTime && (
                <span className="text-white/30 text-[10px]">
                  {logData.metadata.startTime?.slice(0, 19)} → {logData.metadata.endTime?.slice(0, 19)}
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <button onClick={exportHtmlReport}
                  className="flex items-center gap-1 px-2 py-1 bg-accent/10 hover:bg-accent/20 border border-accent/20 rounded text-[11px] text-accent transition-colors">
                  <Download size={11} />Export HTML
                </button>
                <button onClick={() => { setLogData(null); try { sessionStorage.removeItem(SESSION_KEY) } catch {} }} className="text-white/30 hover:text-danger transition-colors">
                  <X size={13} />
                </button>
              </div>
            </div>
          )}

          {parseError && (
            <div className="mt-2 text-xs text-danger bg-danger/10 rounded px-3 py-2">
              {parseError}
            </div>
          )}
          {parseWarning && (
            <div className="mt-2 text-xs text-warning bg-warning/10 border border-warning/20 rounded px-3 py-2">
              {parseWarning}
            </div>
          )}
          {sessionRestored && (
            <div className="mt-2 text-xs text-success bg-success/10 border border-success/20 rounded px-3 py-2 flex items-center gap-1.5">
              <RefreshCw size={11} className="text-success" />
              Session restored — aggregated stats are available. Re-upload the log file to use Log Search.
            </div>
          )}
        </div>

        {/* Server info bar — shown once a log is loaded */}
        {logData && <ServerInfoBar logData={logData} mask={mask} />}

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          {!logData && !isParsing ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 opacity-40">
              <Activity size={56} className="text-accent mb-4" />
              <h2 className="text-lg font-semibold text-white mb-2">No log file loaded</h2>
              <p className="text-sm text-white/60 max-w-xs">
                Upload a MongoDB JSON log to begin analyzing performance, errors, and index usage.
              </p>
            </div>
          ) : logData ? (
            <div className="p-4 space-y-4">

              {/* Stat cards */}
              <div className="grid grid-cols-4 gap-3">
                {stats.map((s) => (
                  <div key={s.label} className={`rounded-xl p-3 ${s.bg} border border-white/5`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-white/40">{s.label}</span>
                      <s.Icon size={14} className={s.color} />
                    </div>
                    <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                    {s.sub && <div className="text-xs text-white/30 mt-0.5">{s.sub}</div>}
                  </div>
                ))}
              </div>

              {/* Overview charts */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface rounded-xl p-3 border border-white/5">
                  <h3 className="text-xs font-medium text-white/50 mb-2 uppercase tracking-wider">
                    Operations Timeline
                  </h3>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={logData.timelineData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                      <XAxis dataKey="minute" tick={{ fontSize: 9, fill: '#64748b' }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 9, fill: '#64748b' }} />
                      <Tooltip content={<ChartTip />} />
                      <Bar dataKey="count" fill="#00D4AA" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-surface rounded-xl p-3 border border-white/5">
                  <h3 className="text-xs font-medium text-white/50 mb-2 uppercase tracking-wider">
                    Operation Types
                  </h3>
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie
                        data={logData.operationTypes}
                        dataKey="count"
                        nameKey="op"
                        cx="50%"
                        cy="50%"
                        outerRadius={55}
                        innerRadius={25}
                      >
                        {logData.operationTypes.map((entry) => (
                          <Cell key={entry.op} fill={COLORS[entry.op] || COLORS.other} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTip />} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-surface rounded-xl p-3 border border-white/5">
                  <h3 className="text-xs font-medium text-white/50 mb-2 uppercase tracking-wider">
                    Slowest Namespaces (avg ms)
                  </h3>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart
                      data={logData.topSlowNs}
                      layout="vertical"
                      margin={{ top: 0, right: 10, bottom: 0, left: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                      <XAxis type="number" tick={{ fontSize: 9, fill: '#64748b' }} />
                      <YAxis
                        type="category"
                        dataKey="ns"
                        width={90}
                        tick={{ fontSize: 8, fill: '#64748b' }}
                        tickFormatter={(v) => {
                          const masked = mask(v)
                          return masked.length > 14 ? masked.slice(-14) : masked
                        }}
                      />
                      <Tooltip content={<ChartTip />} />
                      <Bar dataKey="avgMs" fill="#F59E0B" radius={[0, 2, 2, 0]} name="avg ms" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-surface rounded-xl p-3 border border-white/5">
                  <h3 className="text-xs font-medium text-white/50 mb-2 uppercase tracking-wider">
                    Severity Distribution
                  </h3>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart
                      data={logData.severityDist}
                      margin={{ top: 0, right: 0, bottom: 0, left: -20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#64748b' }} />
                      <YAxis tick={{ fontSize: 9, fill: '#64748b' }} />
                      <Tooltip content={<ChartTip />} />
                      <Bar dataKey="count" radius={[2, 2, 0, 0]} name="count">
                        {logData.severityDist.map((entry) => (
                          <Cell key={entry.s} fill={SEV_COLORS[entry.s] || '#64748b'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Tab bar */}
              <div className="flex border-b border-white/5 gap-0.5 overflow-x-auto">
                {TABS.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t transition-colors ${
                      activeTab === id
                        ? 'text-accent border-b-2 border-accent bg-accent/5'
                        : 'text-white/40 hover:text-white/70'
                    }`}
                  >
                    <Icon size={12} />{label}
                  </button>
                ))}
              </div>

              {/* Tab content — each tab manages its own state */}
              {activeTab === 'insights' && <InsightsTab logData={logData} mask={mask} />}
              {activeTab === 'slowOps' && <SlowOpsTab logData={logData} mask={mask} />}
              {activeTab === 'errors' && <ErrorsTab logData={logData} mask={mask} />}
              {activeTab === 'indexes' && <IndexesTab logData={logData} mask={mask} />}
              {activeTab === 'audit' && <AuditTab logData={logData} mask={mask} />}
              {activeTab === 'appnames' && <AppNamesTab logData={logData} mask={mask} />}
              {activeTab === 'reslen' && <ReslenTab logData={logData} mask={mask} />}
              {activeTab === 'stats' && <StatisticsTab logData={logData} mask={mask} />}
              {activeTab === 'search' && <LogSearchTab logData={logData} mask={mask} />}
              {activeTab === 'scatter' && <QueryScatterTab logData={logData} mask={mask} />}

            </div>
          ) : null}
        </div>
      </div>

      {!isChatCollapsed && (
        <div
          className={`w-1 flex-shrink-0 bg-white/5 hover:bg-accent/30 transition-colors cursor-col-resize ${isResizingChat ? 'bg-accent/50' : ''}`}
          onMouseDown={() => setIsResizingChat(true)}
          title="Drag to resize Ask Log panel"
        />
      )}

      <AskLogPanel
        logData={logData}
        mask={mask}
        collapsed={isChatCollapsed}
        widthPct={chatWidthPct}
        onToggleCollapse={() => setIsChatCollapsed((v) => !v)}
      />
    </div>
  )
}
