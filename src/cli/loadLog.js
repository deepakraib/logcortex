import { parseLogFile } from '../utils/parseLogFile.js'
import { openPathFile } from './pathFile.js'
import { createMaskFn } from './mask.js'

export async function loadParsedLog(filePath, opts, onProgress) {
  const file = await openPathFile(filePath)
  const progress = onProgress || (() => {})
  const logData = await parseLogFile(file, progress, opts.slowThreshold ?? 100)
  const mask = createMaskFn(opts)
  return { logData, mask, file }
}
