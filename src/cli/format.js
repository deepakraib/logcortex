export function padEnd(str, len) {
  const s = String(str ?? '')
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length)
}

export function padStartNum(n, len) {
  return String(n).padStart(len, ' ')
}

export function formatTable(headers, rows) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length))
  )
  const headerLine = headers.map((h, i) => padEnd(h, widths[i])).join('  ')
  const sep = widths.map((w) => '-'.repeat(w)).join('  ')
  const body = rows.map((row) =>
    row.map((cell, i) => padEnd(cell, widths[i])).join('  ')
  )
  return [headerLine, sep, ...body].join('\n')
}

export function printJson(data) {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`)
}
