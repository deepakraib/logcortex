import { describe, expect, it } from 'vitest'
import { parseCliArgs, parseBool, resolveLogFile } from '../src/cli/parseArgs.js'

describe('parseCliArgs', () => {
  it('parses --file and masking=true', () => {
    const opts = parseCliArgs(['--file', 'mongo.log', '--masking=true'])
    expect(opts.file).toBe('mongo.log')
    expect(opts.mask).toBe(true)
    expect(opts.command).toBe('info')
  })

  it('parses logcortex info mongod.log --queries', () => {
    const opts = parseCliArgs(['info', 'mongod.log', '--queries'])
    expect(opts.command).toBe('info')
    expect(opts.file).toBe('mongod.log')
    expect(opts.queries).toBe(true)
  })

  it('parses filter with multiple --word terms', () => {
    const opts = parseCliArgs(['filter', 'mongod.log', '--word', 'assert', 'warning', 'error'])
    expect(opts.command).toBe('filter')
    expect(opts.word).toEqual(['assert', 'warning', 'error'])
  })

  it('resolves file from positional when --file omitted', () => {
    const opts = parseCliArgs(['plot', 'a.log', '--gap', '300'])
    expect(resolveLogFile(opts)).toBe('a.log')
    expect(opts.gap).toBe(300)
  })
})

describe('parseBool', () => {
  it('accepts common truthy strings', () => {
    expect(parseBool('true')).toBe(true)
    expect(parseBool('1')).toBe(true)
    expect(parseBool('false')).toBe(false)
  })
})
