/** Shared tooltip for Recharts bar/line/pie charts. */
export function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-white/10 rounded p-2 text-xs font-mono text-white/80 shadow-xl">
      {label && <div className="text-accent mb-1">{label}</div>}
      {payload.map((p, i) => (
        <div key={i}>
          {p.name}:{' '}
          <span className="text-white">
            {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}
