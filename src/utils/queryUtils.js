/**
 * Recursively normalizes a query object to a shape-only representation
 * (replaces all leaf values with 1) for pattern matching.
 */
export function normalizeQuery(obj, depth = 0) {
  if (depth > 5 || obj === null || obj === undefined) return 1
  if (typeof obj !== 'object') return 1
  if (Array.isArray(obj)) return [1]
  const out = {}
  Object.keys(obj)
    .sort()
    .forEach((k) => {
      out[k] = normalizeQuery(obj[k], depth + 1)
    })
  return out
}

/** Returns a stable JSON string representing the structural shape of a command. */
export function queryShape(cmd) {
  try {
    const o = typeof cmd === 'string' ? JSON.parse(cmd) : cmd
    return JSON.stringify(normalizeQuery(o))
  } catch {
    return '{}'
  }
}

/** Returns the 95th-percentile value from an array of numbers. */
export function p95(arr) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.ceil(0.95 * s.length) - 1]
}

/**
 * Returns a sorted copy of an array by a given key and direction.
 * Null/undefined values sort to the end.
 */
export function sortArr(arr, { key, dir }) {
  return [...arr].sort((a, b) => {
    let av = a[key]
    let bv = b[key]
    if (typeof av === 'string') av = av.toLowerCase()
    if (typeof bv === 'string') bv = bv.toLowerCase()
    if (av == null) av = dir === 'asc' ? Infinity : -Infinity
    if (bv == null) bv = dir === 'asc' ? Infinity : -Infinity
    return dir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
  })
}

/**
 * Returns a sort toggle handler for a given setState setter.
 * Toggles asc/desc when the same column is clicked again.
 */
export function mkSort(set) {
  return (col) =>
    set((s) => ({
      key: col,
      dir: s.key === col && s.dir === 'asc' ? 'desc' : 'asc',
    }))
}
