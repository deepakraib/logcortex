/**
 * Minimal browser-side TAR parser.
 * Supports POSIX ustar and GNU tar formats.
 * Returns an array of { name, data: Uint8Array } for regular files.
 */
const MAX_TAR_ENTRY_SIZE = 512 * 1024 * 1024  // 512 MB per entry
const MAX_TAR_TOTAL_SIZE = 1024 * 1024 * 1024 // 1 GB total extracted

export function parseTar(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const files = []
  let offset = 0
  let totalExtracted = 0

  const dec = new TextDecoder('utf-8')
  const readStr = (start, len) => dec.decode(bytes.slice(start, start + len)).replace(/\0/g, '').trim()
  const readOctal = (start, len) => parseInt(readStr(start, len) || '0', 8)

  while (offset + 512 <= bytes.length) {
    const header = bytes.slice(offset, offset + 512)

    // Check for end-of-archive (two consecutive zero blocks)
    if (header.every(b => b === 0)) { offset += 512; continue }

    // Filename: may use ustar prefix (offset 345, 155 bytes) + name (offset 0, 100 bytes)
    const prefix = readStr(offset + 345, 155)
    const name = readStr(offset + 0, 100)
    const fullName = prefix ? `${prefix}/${name}` : name

    const size = readOctal(offset + 124, 12)
    if (!isFinite(size) || size < 0 || size > MAX_TAR_ENTRY_SIZE) {
      break // corrupt or malicious header — stop parsing
    }
    const typeFlag = readStr(offset + 156, 1)

    offset += 512 // move past header

    // typeFlag: '0' or '' = regular file, '5' = directory, 'L' = GNU long name
    if (typeFlag === '5' || typeFlag === 'd') {
      // directory — skip, no data blocks
    } else if (typeFlag === 'L') {
      // GNU long filename — next block(s) contain the real filename; skip for now
      offset += Math.ceil(size / 512) * 512
    } else if (typeFlag === '0' || typeFlag === '' || typeFlag === '\0') {
      if (size > 0) {
        totalExtracted += size
        if (totalExtracted > MAX_TAR_TOTAL_SIZE) break // tar bomb guard
        const data = bytes.slice(offset, offset + size)
        files.push({ name: fullName, data })
      }
      offset += Math.ceil(size / 512) * 512
    } else {
      // Other special types (symlinks, etc.) — skip data blocks
      offset += Math.ceil(size / 512) * 512
    }
  }

  return files
}

/**
 * Picks the best MongoDB log file from a list of tar entries.
 * Priority: .log > .json > any text file, preferring mongod/mongodb in name.
 */
export function pickLogFile(entries) {
  const logExts = ['.log', '.json', '.log.gz', '.json.gz']
  const isLog = f => logExts.some(ext => f.name.endsWith(ext)) ||
    f.name.includes('mongod') || f.name.includes('mongodb')

  // Filter to likely log files
  const candidates = entries.filter(isLog)
  if (!candidates.length) {
    // Fall back to any non-directory entry with text-like content
    const fallback = entries.find(f => !f.name.endsWith('/') && f.data.length > 0)
    return fallback || null
  }

  // Prefer files with 'mongod' or 'mongodb' in name
  const preferred = candidates.find(f => f.name.includes('mongod') || f.name.includes('mongodb'))
  return preferred || candidates[0]
}
