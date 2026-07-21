/**
 * the exact runtime class names a conformant cross-package error carries.
 *
 * these are *foreign wire strings*, matched structurally — deliberately NOT derived from our own
 * class objects (e.g. `SimpleCacheConditionError.name`). a backend in another package emits its own
 * class named 'SimpleCacheConditionError' regardless of whether we later rename ours, so a derived
 * reference would *stop* matching conformant backends the moment we rename — the opposite of the
 * goal. a derived reference would also adopt our own mangled name first under minification. so the
 * literal is the correct, more-robust choice for the cross-package contract.
 */
const nameOfConditionError = 'SimpleCacheConditionError';
// likewise a literal, NOT `ConstraintError.name` from the import: a foreign backend's ancestor is
// its OWN ConstraintError copy, whose name we match by string — a derived reference would couple
// the wire contract to our local class identity, the exact fragility we avoid above
const nameOfConstraintError = 'ConstraintError';

/**
 * .what = walk an object's prototype chain, true if any ancestor's constructor carries the name
 * .why =
 *   - a name-based ancestry check detects a class family across package copies, where
 *     instanceof (prototype identity) fails against a *duplicate* copy of the base class
 * .note = recursive so no mutable cursor is needed; the chain is short and terminates at null
 */
const hasProtoConstructorNamed = (obj: object, name: string): boolean => {
  // step up one link in the prototype chain
  const proto = Object.getPrototypeOf(obj);

  // base case: chain exhausted, no ancestor matched
  if (!proto) return false;

  // hit: this ancestor's constructor carries the target name
  if (proto.constructor?.name === name) return true;

  // otherwise, keep the walk up the chain
  return hasProtoConstructorNamed(proto, name);
};

/**
 * .what = detect whether an error is a SimpleCacheConditionError, across package boundaries
 * .why =
 *   - a conditional cache backend lives in a *separate* package; the SimpleCacheConditionError
 *     it throws is a *different constructor* from ours, so `instanceof SimpleCacheConditionError`
 *     is false across the boundary — the wrapper then re-throws instead of converge
 *   - `constructor.name` is the runtime class name, a realm-global string that matches regardless
 *     of which package minted the class (unlike prototype identity, which `instanceof` checks)
 *   - the ConstraintError-ancestry guard narrows the blast radius: an unrelated Error that merely
 *     reuses the leaf name is NOT swallowed as a condition conflict (avoids a failhide-by-effect on
 *     the `exception: ignore` path). it is checked by *name*, not instanceof, so it too survives a
 *     duplicate helpful-errors copy
 *   - exported publicly so a caller who uses `exception: 'throw'` can recognize a re-thrown conflict
 *     the same cross-package-safe way the wrapper does — their own `instanceof SimpleCacheConditionError`
 *     hits the exact boundary bug this predicate exists to overcome
 *   - two deliberate tradeoffs, both a consequence of the same "structural check trades recall for
 *     cross-package correctness" choice (detailed in .note, each locked by a test):
 *       (1) it does NOT match *subclasses* of SimpleCacheConditionError (a subclass has a different
 *           `constructor.name`) — a behavior narrowed vs the old `instanceof`
 *       (2) it does NOT survive class-name mangle (a bundler that renames classes) — a false-negative
 *           under aggressive minification
 * .note =
 *   - structural discriminator by design; mirrors the structural capability detection in
 *     HasCacheConditionals (see SimpleCache.ts). the SimpleCache contract prescribes that a
 *     conditional backend throws a SimpleCacheConditionError, so the names are contract vocabulary,
 *     not a coincidence
 *   - narrowed vs the old instanceof: the leaf-name check does not match *subclasses* of
 *     SimpleCacheConditionError (a subclass has a different `constructor.name`). no evidence any
 *     backend subclasses it; locked by test so the boundary is explicit, not silent
 *   - interim form: name-based. once helpful-errors ships a registered-symbol brand and it is pinned
 *     via peerDependency, this predicate can also assert the helpful-errors family (single source of
 *     truth, so both guards upgrade together)
 *   - tradeoff, accepted deliberately: `constructor.name` does not survive class-name mangle (e.g.
 *     terser with keep_classnames disabled). that is out of scope here — this is a server-side node
 *     cache library, shipped unminified into node_modules, where class names are preserved. the
 *     registered-symbol brand above is the mitigation path for any consumer that does bundle-and-mangle;
 *     until then, name-based is the correct interim per the wish. locked by test ([case7])
 */
export const isSimpleCacheConditionError = (error: unknown): boolean => {
  // floor: must be a real Error (the global builtin, so cross-copy safe)
  if (!(error instanceof Error)) return false;

  // leaf discriminator: the runtime class name matches across the package boundary
  if (error.constructor?.name !== nameOfConditionError) return false;

  // ancestry guard: require a ConstraintError ancestor by name, so an unrelated Error that
  // merely reuses the leaf name is not mistaken for a condition conflict
  return hasProtoConstructorNamed(error, nameOfConstraintError);
};
