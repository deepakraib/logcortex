import { ChevronUp, ChevronDown } from 'lucide-react'

export default function SortTh({ label, col, sortCfg, onSort, className = '' }) {
  const active = sortCfg.key === col
  return (
    <th
      className={`px-3 py-2 text-left text-xs font-medium text-white/50 uppercase tracking-wider cursor-pointer select-none hover:text-accent transition-colors whitespace-nowrap ${className}`}
      onClick={() => onSort(col)}
    >
      <span className="flex items-center gap-1">
        {label}
        {active
          ? sortCfg.dir === 'asc'
            ? <ChevronUp size={12} className="text-accent" />
            : <ChevronDown size={12} className="text-accent" />
          : <ChevronDown size={12} className="opacity-20" />}
      </span>
    </th>
  )
}
