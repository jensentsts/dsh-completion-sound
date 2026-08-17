/**
 * Package-owned invariant companion for `@jensentsts/dsh-completion-sound`.
 * @module @jensentsts/dsh-completion-sound/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@jensentsts/dsh-completion-sound'

/** Cordis companion plugin name. */
export const name = 'dsh-completion-sound-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a side-effectful completion cue (WebAudio chime plus
 * optional desktop notification) driven by the sessions list mirror. It emits
 * no cordis events and owns no cross-plugin mutable relation — reads of the
 * sessions snapshot and settings scope are one-way, so the package holds no
 * shared identity another plugin could observe.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
