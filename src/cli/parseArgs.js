const BOOL_ALIASES = {
  true: true,
  false: false,
  '1': true,
  '0': false,
  yes: true,
  no: false,
}

/**
 * @typedef {Object} CliOptions
 * @property {string[]} _positional
 * @property {string|null} file
 * @property {string} command
 * @property {boolean} help
 * @property {boolean} json
 * @property {boolean} mask
 * @property {boolean} maskNs
 * @property {boolean} maskIp
 * @property {boolean} maskHost
 * @property {boolean} maskRs
 * @property {number} slowThreshold
 * @property {boolean} queries
 * @property {boolean} collectionscan
 * @property {boolean} slow
 * @property {boolean} errors
 * @property {boolean} audit
 * @property {string[]} word
 * @property {string|null} from
 * @property {string|null} to
 * @property {string|null} component
 * @property {string|null} severity
 * @property {string|null} out
 * @property {boolean} human
 * @property {string} type
 * @property {string} group
 * @property {number} gap
 * @property {number} limit
 */

export function parseBool(value, fallback = false) {
  if (value == null) return fallback
  const key = String(value).trim().toLowerCase()
  if (key in BOOL_ALIASES) return BOOL_ALIASES[key]
  return fallback
}

/**
 * @param {string[]} argv process.argv slice after node + script
 * @returns {CliOptions}
 */
export function parseCliArgs(argv) {
  /** @type {Record<string, unknown>} */
  const opts = {
    _positional: [],
    file: null,
    command: 'info',
    help: false,
    json: false,
    mask: false,
    maskNs: false,
    maskIp: false,
    maskHost: false,
    maskRs: false,
    slowThreshold: 100,
    queries: false,
    collectionscan: false,
    slow: false,
    errors: false,
    audit: false,
    word: [],
    from: null,
    to: null,
    component: null,
    severity: null,
    out: null,
    human: false,
    type: 'range',
    group: 'operation',
    gap: 600,
    limit: 50,
  }

  let i = 0
  while (i < argv.length) {
    const arg = argv[i]

    if (arg === '--help' || arg === '-h') {
      opts.help = true
      i++
      continue
    }

    if (arg === '--json') {
      opts.json = true
      i++
      continue
    }

    if (arg === '--file' || arg === '-f') {
      opts.file = argv[++i] ?? null
      i++
      continue
    }

    if (arg.startsWith('--file=')) {
      opts.file = arg.slice('--file='.length)
      i++
      continue
    }

    if (arg.startsWith('--mask') || arg.startsWith('--masking')) {
      const eq = arg.indexOf('=')
      if (eq > -1) {
        opts.mask = parseBool(arg.slice(eq + 1), true)
      } else if (arg === '--mask-ns') {
        opts.maskNs = true
      } else if (arg === '--mask-ip') {
        opts.maskIp = true
      } else if (arg === '--mask-host') {
        opts.maskHost = true
      } else if (arg === '--mask-rs') {
        opts.maskRs = true
      } else {
        opts.mask = true
      }
      i++
      continue
    }

    if (arg === '--mask-ns') { opts.maskNs = true; i++; continue }
    if (arg === '--mask-ip') { opts.maskIp = true; i++; continue }
    if (arg === '--mask-host') { opts.maskHost = true; i++; continue }
    if (arg === '--mask-rs') { opts.maskRs = true; i++; continue }

    if (arg === '--queries') { opts.queries = true; i++; continue }
    if (arg === '--collectionscan' || arg === '--collscan') { opts.collectionscan = true; i++; continue }
    if (arg === '--slow') { opts.slow = true; i++; continue }
    if (arg === '--errors') { opts.errors = true; i++; continue }
    if (arg === '--audit') { opts.audit = true; i++; continue }
    if (arg === '--human') { opts.human = true; i++; continue }

    if (arg === '--json') { opts.json = true; i++; continue }

    if (arg === '--word' || arg === '--words') {
      i++
      while (i < argv.length && !argv[i].startsWith('-')) {
        opts.word.push(argv[i])
        i++
      }
      continue
    }

    if (arg === '--from') { opts.from = argv[++i] ?? null; i++; continue }
    if (arg === '--to') { opts.to = argv[++i] ?? null; i++; continue }
    if (arg === '--component') { opts.component = argv[++i] ?? null; i++; continue }
    if (arg === '--severity' || arg === '--sev') { opts.severity = argv[++i] ?? null; i++; continue }
    if (arg === '--out' || arg === '-o') { opts.out = argv[++i] ?? null; i++; continue }
    if (arg === '--type') { opts.type = argv[++i] ?? 'range'; i++; continue }
    if (arg === '--group') { opts.group = argv[++i] ?? 'operation'; i++; continue }
    if (arg === '--gap') { opts.gap = Number(argv[++i] ?? 600); i++; continue }
    if (arg === '--limit') { opts.limit = Number(argv[++i] ?? 50); i++; continue }
    if (arg === '--slow-threshold') { opts.slowThreshold = Number(argv[++i] ?? 100); i++; continue }

    if (arg.startsWith('--slow-threshold=')) {
      opts.slowThreshold = Number(arg.slice('--slow-threshold='.length))
      i++
      continue
    }

    if (arg.startsWith('-') && arg.includes('=')) {
      const [key, val] = arg.slice(2).split('=')
      if (key === 'file' || key === 'f') opts.file = val
      else if (key === 'mask' || key === 'masking') opts.mask = parseBool(val, true)
      i++
      continue
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`)
    }

    opts._positional.push(arg)
    i++
  }

  const commands = new Set([
    'info', 'filter', 'plot', 'open', 'help',
    'mloginfo', 'mlogfilter', 'mplotqueries',
  ])
  if (opts._positional.length > 0 && commands.has(opts._positional[0])) {
    opts.command = opts._positional.shift()
  }

  if (!opts.file && opts._positional.length > 0) {
    const maybeFile = opts._positional[opts._positional.length - 1]
    if (maybeFile && !maybeFile.startsWith('-')) {
      opts.file = maybeFile
      opts._positional.pop()
    }
  }

  if (opts.mask) {
    opts.maskIp = opts.maskIp || true
    opts.maskHost = opts.maskHost || true
  }

  return /** @type {CliOptions} */ (opts)
}

export function resolveLogFile(opts) {
  if (opts.file) return opts.file
  const fromPos = opts._positional.find((p) => !p.startsWith('-'))
  return fromPos ?? null
}
