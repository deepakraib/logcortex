/** Tooltip for the Query Scatter chart. Receives mask as a prop. */
export function ScatterTip({ active, payload, mask }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="bg-surface border border-white/10 rounded p-2 text-xs font-mono text-white/80 shadow-xl max-w-xs">
      <div className="text-accent mb-1">
        {new Date(d.x).toISOString().slice(0, 19).replace('T', ' ')}
      </div>
      <div>ns: <span className="text-white">{mask(d.ns) || '—'}</span></div>
      <div>op: <span className="text-white">{d.op}</span></div>
      <div>duration: <span className="text-warning">{d.y} ms</span></div>
      {d.plan && <div>plan: <span className="text-white">{d.plan}</span></div>}
      {d.docsEx != null && <div>docs examined: <span className="text-white">{d.docsEx}</span></div>}
      {d.keysEx != null && <div>keys examined: <span className="text-white">{d.keysEx}</span></div>}
    </div>
  )
}
