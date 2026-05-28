export const COLORS = {
  find: '#00D4AA',
  update: '#3B82F6',
  insert: '#8B5CF6',
  delete: '#EF4444',
  aggregate: '#F59E0B',
  command: '#64748B',
  getmore: '#EC4899',
  other: '#6B7280',
}

export const SEV_COLORS = {
  I: '#00D4AA',
  W: '#F59E0B',
  E: '#EF4444',
  F: '#DC2626',
  D: '#64748B',
}

export const SEV_LABELS = {
  I: 'Info',
  W: 'Warning',
  E: 'Error',
  F: 'Fatal',
  D: 'Debug',
}

export const TABS = [
  { id: 'slowOps', label: 'Slow Ops', iconName: 'Clock' },
  { id: 'errors', label: 'Errors', iconName: 'AlertCircle' },
  { id: 'indexes', label: 'Indexes', iconName: 'Database' },
  { id: 'stats', label: 'Statistics', iconName: 'BarChart2' },
  { id: 'search', label: 'Log Search', iconName: 'Search' },
  { id: 'scatter', label: 'Query Scatter', iconName: 'Activity' },
]
