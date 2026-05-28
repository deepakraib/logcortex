import { Layers, AlertCircle, Clock } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import SortTh from '../ui/SortTh'
import { mkSort, sortArr } from '../../utils/queryUtils'
import { useState } from 'react'

const PALETTE = ['#00D4AA','#3B82F6','#8B5CF6','#F59E0B','#EF4444','#EC4899','#10B981','#64748B']

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-white/10 rounded p-2 text-xs font-mono text-white/80 shadow-xl">
      {label && <div className="text-accent mb-1">{label}</div>}
      {payload.map((p, i) => (
        <div key={i}>{p.name}: <span className="text-white">{p.value?.toLocaleString()}</span></div>
      ))}
    </div>
  )
}

export default function AppNamesTab({ logData, mask }) {
  const [sort, setSort] = useState({ key: 'count', dir: 'desc' })

  if (!logData || !logData.appNames?.length) {
    return (
      <div className="flex flex-col items-center py-16 text-white/30">
        <Layers size={40} className="mb-3" />
        <p className="text-sm font-medium text-white/50">No application names found</p>
        <p className="text-xs text-white/30 mt-1 max-w-xs text-center">
          MongoDB drivers set <code className="font-mono text-green-300/60">appName</code> in the connection string.
          Upgrade your driver or add <code className="font-mono text-green-300/60">appname=MyApp</code> to the URI.
        </p>
      </div>
    )
  }

  const { appNames } = logData
  // Copy before sort — never mutate props array in-place
  const rows = sortArr([...appNames], sort)
  const chartData = [...appNames].sort((a, b) => b.count - a.count).slice(0, 10)
    .map(a => ({ name: mask(a.name).slice(0, 20), count: a.count, slowCount: a.slowCount }))

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-surface border border-white/5 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1"><Layers size={13} className="text-accent" /><span className="text-[10px] text-white/40 uppercase tracking-wider">Unique Apps</span></div>
          <div className="text-xl font-bold text-accent">{appNames.length}</div>
        </div>
        <div className="bg-surface border border-white/5 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1"><Clock size={13} className="text-warning" /><span className="text-[10px] text-white/40 uppercase tracking-wider">Most Slow Ops</span></div>
          <div className="text-sm font-bold text-warning font-mono truncate">{mask([...appNames].sort((a, b) => b.slowCount - a.slowCount)[0]?.name || '—')}</div>
        </div>
        <div className="bg-surface border border-white/5 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1"><AlertCircle size={13} className="text-danger" /><span className="text-[10px] text-white/40 uppercase tracking-wider">Most Errors</span></div>
          <div className="text-sm font-bold text-danger font-mono truncate">{mask([...appNames].sort((a, b) => b.errors - a.errors)[0]?.name || '—')}</div>
        </div>
      </div>

      {/* Bar chart: ops per app */}
      <div className="bg-surface rounded-xl p-4 border border-white/5">
        <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3">Operations by Application</h3>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
            <XAxis type="number" tick={{ fontSize: 9, fill: '#64748b' }} />
            <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 9, fill: '#64748b' }} />
            <Tooltip content={<ChartTip />} />
            <Bar dataKey="count" name="total ops" radius={[0, 2, 2, 0]}>
              {chartData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full text-xs">
          <thead className="bg-elevated/50">
            <tr>
              {[['name','App / Driver'],['count','Total Ops'],['slowCount','Slow Ops'],['errors','Errors'],['avgMs','Avg ms'],['p95Ms','p95 ms']].map(([col, label]) => (
                <SortTh key={col} col={col} label={label} sortCfg={sort} onSort={mkSort(setSort)} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((app, i) => (
              <tr key={i} className="border-t border-white/5 hover:bg-white/2">
                <td className="px-3 py-2 font-mono text-accent">{mask(app.name)}</td>
                <td className="px-3 py-2 text-white/70 text-right">{app.count.toLocaleString()}</td>
                <td className={`px-3 py-2 text-right font-mono font-bold ${app.slowCount > 0 ? 'text-warning' : 'text-white/30'}`}>{app.slowCount.toLocaleString()}</td>
                <td className={`px-3 py-2 text-right font-mono font-bold ${app.errors > 0 ? 'text-danger' : 'text-white/30'}`}>{app.errors}</td>
                <td className="px-3 py-2 text-white/50 text-right">{app.avgMs > 0 ? app.avgMs : '—'}</td>
                <td className="px-3 py-2 text-white/50 text-right">{app.p95Ms > 0 ? app.p95Ms : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tip */}
      <div className="bg-surface rounded-xl p-4 border border-accent/10 text-xs text-white/40 space-y-1">
        <p className="text-accent font-medium">Driver Tips</p>
        <p>Set app name in your connection string to enable this breakdown:</p>
        <pre className="font-mono text-green-300 bg-black/40 rounded px-3 py-2 mt-1">
{`// Node.js
MongoClient.connect('mongodb://host/db?appname=MyService')

// Python
MongoClient('mongodb://host/db', appname='MyService')

// Java
ConnectionString("mongodb://host/db?appName=MyService")`}
        </pre>
      </div>
    </div>
  )
}
