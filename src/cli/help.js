export function printHelp() {
  const text = `
LogCortex CLI — MongoDB log analysis from the terminal
Inspired by mtools (mloginfo, mlogfilter, mplotqueries).
Use --json with any command to emit structured output for scripts and tooling.
https://rueckstiess.github.io/mtools/

USAGE
  logcortex [command] <logfile> [options]
  logcortex --file <logfile> [options]

COMMANDS
  info      Log summary and optional sections (default)
  filter    Filter log lines to stdout or --out file
  plot      Time-bucketed slow-op plot data (text/JSON)
  open      Print steps to analyze the file in the web UI
  help      Show this help

  Aliases: mloginfo → info, mlogfilter → filter, mplotqueries → plot

GLOBAL OPTIONS
  -f, --file <path>           Log file (.log, .json, .gz, .zip, .tar, .tar.gz)
  --mask, --masking=true      Redact PII (IPs, emails, conn strings, query values)
  --mask-ns                   Also mask db.collection namespaces
  --mask-ip                   Mask IP addresses
  --mask-host                 Mask hostnames
  --mask-rs                   Mask replica set names in JSON
  --slow-threshold <ms>       Slow query threshold (default: 100)
  --json                      JSON output
  -h, --help                  Show help

INFO (mloginfo-style)
  logcortex info mongod.log
  logcortex --file mongod.log --mask
  logcortex info mongod.log --queries
  logcortex info mongod.log --queries --collectionscan
  logcortex info mongod.log --slow --errors --audit --json

FILTER (mlogfilter-style)
  logcortex filter mongod.log --word assert warning error
  logcortex filter mongod.log --slow --human
  logcortex filter mongod.log --severity E --out errors.jsonl --mask

  --word <terms...>           Match message/component (multiple words = OR)
  --slow                      Only lines with duration >= threshold
  --human                     Human-readable lines instead of raw JSON
  --from / --to <iso>         Time range filter
  --component <name>          e.g. COMMAND, QUERY, ACCESS
  --severity / --sev <I|W|E|F>
  -o, --out <file>            Write matches to file instead of stdout

PLOT (mplotqueries-style, text buckets; charts in web UI)
  logcortex plot mongod.log --type range --group operation --gap 600
  logcortex plot mongod.log --type scatter --limit 30 --mask

  --type range|scatter        Default: range
  --group operation|namespace Default: operation
  --gap <seconds>             Bucket size (default: 600)
  --limit <n>                 Max rows/points (default: 50)

EXAMPLES
  logcortex mongod.log
  logcortex --file /var/log/mongodb/mongod.log --masking=true --queries
  logcortex mlogfilter mongod.log --word assert warning error --human
  logcortex mloginfo mongod.log --queries --collectionscan --mask
`
  process.stdout.write(text.trimStart() + '\n')
}
