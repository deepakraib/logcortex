import { maskString, resetObfuscationMaps } from '../utils/pii.js'

/**
 * Build a mask function from CLI flags (mtools-style --mask / --masking=true).
 */
export function createMaskFn(opts) {
  const enabled = Boolean(opts.mask || opts.maskNs || opts.maskIp || opts.maskHost || opts.maskRs)
  if (!enabled) return (s) => (s == null ? '' : String(s))

  resetObfuscationMaps()
  return (s) => maskString(
    s == null ? '' : String(s),
    true,
    opts.maskNs,
    opts.maskIp,
    opts.maskHost,
    opts.maskRs
  )
}
