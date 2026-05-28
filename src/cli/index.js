import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { parseCliArgs, resolveLogFile } from './parseArgs.js'
import { printHelp } from './help.js'
import { runInfo } from './commands/info.js'
import { runFilter } from './commands/filter.js'
import { runPlot } from './commands/plot.js'

const ALIASES = {
  mloginfo: 'info',
  mlogfilter: 'filter',
  mplotqueries: 'plot',
}

async function assertReadable(filePath) {
  await access(filePath, constants.R_OK)
}

export async function runCli(argv) {
  const opts = parseCliArgs(argv)

  if (ALIASES[opts.command]) {
    opts.command = ALIASES[opts.command]
  }

  if (opts.help || opts.command === 'help') {
    printHelp()
    return 0
  }

  const filePath = resolveLogFile(opts)

  if (opts.command === 'open') {
    if (!filePath) {
      process.stderr.write('logcortex open: provide a log file path.\n')
      return 1
    }
    process.stdout.write(
      `Analyze "${filePath}" in the LogCortex UI:\n\n` +
      '  npm run dev\n' +
      '  Open http://localhost:5173 and drop the file\n\n' +
      'CLI (with PII masking):\n' +
      `  logcortex info "${filePath}" --mask\n` +
      `  logcortex filter "${filePath}" --slow --human --mask\n`
    )
    return 0
  }

  if (!filePath) {
    printHelp()
    process.stderr.write('\nError: missing log file. Use --file <path> or pass the file as the last argument.\n')
    return 1
  }

  await assertReadable(filePath)

  const cmd = opts.command === 'info' ? runInfo
    : opts.command === 'filter' ? runFilter
      : opts.command === 'plot' ? runPlot
        : null

  if (!cmd) {
    process.stderr.write(`Unknown command: ${opts.command}\n`)
    return 1
  }

  if (opts.command !== 'filter') {
    process.stderr.write(`Parsing ${filePath}...\n`)
  }

  await cmd(filePath, opts)
  return 0
}
