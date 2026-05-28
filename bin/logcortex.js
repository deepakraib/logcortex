#!/usr/bin/env node
import { runCli } from '../src/cli/index.js'

runCli(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`logcortex: ${err.message}\n`)
    if (process.env.LOGCORTEX_DEBUG) console.error(err)
    process.exit(1)
  })
