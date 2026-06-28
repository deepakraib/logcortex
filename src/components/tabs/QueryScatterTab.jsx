import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Brush,
} from 'recharts'
import { Activity } from 'lucide-react'
import { ScatterTip } from '../charts/ScatterTip'
import { COLORS } from '../../utils/constants'

export default function QueryScatterTab({ logData, mask }) {
  const [plotOpTypes, setPlotOpTypes] = useState({})
  const slowThresholdMs = logData?.metadata?.slowThresholdMs ?? 100

  // Initialise toggled op-types whenever logData changes
  useEffect(() => {
    if (!logData) return
    const initial = {}
    logData.operationTypes.forEach(({ op }) => { initial[op] = true })
    setPlotOpTypes(initial)
  }, [logData])

  // Pre-group all ops by opType once — avoids O(n×k) per-series filter in render
  const groupedByOp = useMemo(() => {
    if (!logData) return {}
    const groups = {}
    logData.allOperations.forEach((op) => {
      if (!groups[op.opType]) groups[op.opType] = []
      groups[op.opType].push({
        x: new Date(op.ts).getTime(),
        y: op.dur,
        ns: op.ns,
        op: op.opType,
        plan: op.plan,
        docsEx: op.docsEx,
        keysEx: op.keysEx,
      })
    })
    return groups
  }, [logData])

  // Wrap ScatterTip to inject mask without breaking Recharts' prop passing
  const ScatterTooltip = useCallback(
    (props) => <ScatterTip {...props} mask={mask} />,
    [mask]
  )

  return (
    <div className="space-y-3">
      <div className="bg-surface rounded-xl p-4 border border-white/5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-xs text-accent font-mono uppercase tracking-wider flex items-center gap-1.5">
              <Activity size={12} />Query Scatter — Slow Op Duration Over Time
            </h3>
            <p className="text-[10px] text-white/30 mt-0.5">Showing operations &gt;{slowThresholdMs}ms only — all ops below threshold are excluded</p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap mb-3">
          {logData.operationTypes.map(({ op }) => (
            <button
              key={op}
              onClick={() => setPlotOpTypes((p) => ({ ...p, [op]: !p[op] }))}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border"
              style={
                plotOpTypes[op]
                  ? {
                      background: `${COLORS[op] || COLORS.other}22`,
                      color: COLORS[op] || COLORS.other,
                      borderColor: `${COLORS[op] || COLORS.other}44`,
                    }
                  : { background: 'transparent', color: '#64748b', borderColor: '#ffffff15' }
              }
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: COLORS[op] || COLORS.other }} />
              {op}
            </button>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={320}>
          <ScatterChart margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
            <XAxis
              dataKey="x"
              type="number"
              domain={['auto', 'auto']}
              name="time"
              tickFormatter={(v) => new Date(v).toISOString().slice(11, 16)}
              tick={{ fontSize: 9, fill: '#64748b' }}
              label={{ value: 'Time', position: 'insideBottom', offset: -10, fill: '#64748b', fontSize: 10 }}
            />
            <YAxis
              dataKey="y"
              name="duration ms"
              tick={{ fontSize: 9, fill: '#64748b' }}
              label={{ value: 'ms', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }}
            />
            <Tooltip content={<ScatterTooltip />} />
            <ReferenceLine y={slowThresholdMs} stroke="#EAB308" strokeDasharray="4 4" label={{ value: `${slowThresholdMs}ms`, fill: '#EAB308', fontSize: 9 }} />
            <ReferenceLine y={500} stroke="#F59E0B" strokeDasharray="4 4" label={{ value: '500ms', fill: '#F59E0B', fontSize: 9 }} />
            <ReferenceLine y={1000} stroke="#EF4444" strokeDasharray="4 4" label={{ value: '1s', fill: '#EF4444', fontSize: 9 }} />
            {Object.entries(groupedByOp)
              .filter(([op]) => plotOpTypes[op])
              .map(([op, data]) => (
                <Scatter
                  key={op}
                  name={op}
                  data={data}
                  fill={COLORS[op] || COLORS.other}
                  opacity={0.7}
                />
              ))}
            <Brush
              dataKey="x"
              height={20}
              stroke="#ffffff15"
              fill="#161B22"
              tickFormatter={(v) => new Date(v).toISOString().slice(11, 16)}
            />
          </ScatterChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-white/20 mt-1 text-center">
          Drag the brush below the chart to zoom into a time range
        </p>
      </div>
    </div>
  )
}
