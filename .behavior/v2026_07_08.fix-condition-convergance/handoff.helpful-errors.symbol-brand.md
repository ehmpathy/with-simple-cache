# handoff → helpful-errors: registered-symbol brand + version stamp

> **status**: follow-up robustness upgrade, NOT a blocker. the interim name-based fix already
> shipped on the `with-simple-cache` route `v2026_07_08.fix-condition-convergance` — convergence
> works today for a single shared copy of helpful-errors. this handoff tracks the robust replacement
> (a registered symbol brand + peer-dep pin) that also covers the duplicate-copy case and survives
> minification. vlad pulls it in when ready.

---

## .what

two coupled changes:

1. **in `helpful-errors`**: stamp every base error instance with a **registered** symbol whose value declares the helpful-errors version. this gives a cross-copy, minification-proof way to answer "is this a helpful-errors error, and which version?".
2. **in `with-simple-cache`** (done here, after #1 releases): add `helpful-errors` as a **peerDependency** with a min version that carries the brand, so the consumer's package manager dedupes to a single shared copy.

---

## .why

the condition-convergence bug (see `0.wish.md`, `1.vision.yield.md`) is a cross-package `instanceof` failure:

- `withSimpleCache.ts:306` and `withSimpleCacheAsync.ts:357` guard convergence with `error instanceof SimpleCacheConditionError`.
- a real backend cache (separate package) throws its *own* `SimpleCacheConditionError`, a different constructor → `instanceof` is `false` → the wrapper re-throws instead of converge.
- worse: even `instanceof ConstraintError` (the base class) fails the same way if the backend bundles a duplicate copy of `helpful-errors`.

**the two mechanisms in this handoff each attack a different half:**

| mechanism | what it fixes |
|-----------|---------------|
| **peer-dep enforcement** | forces ONE shared copy of `helpful-errors` in the consumer's tree → `instanceof ConstraintError` becomes reliable across the package boundary (one constructor, not two) |
| **registered symbol brand** | a realm-global, minification-proof discriminator + version read that works EVEN if a duplicate copy sneaks in — the robust primitive under the peer-dep belt |

together: peer-dep removes the duplicate-copy failure at the root; the symbol is the belt-and-suspenders check that also survives minification.

---

## the change in `helpful-errors`

### 1. the brand MUST be a registered symbol

```ts
// in HelpfulError constructor (HelpfulError.js / .ts)
const HELPFUL_ERRORS_BRAND = Symbol.for('helpful-errors'); // registered — shared across ALL copies in the realm

// stamp each instance with the package version
this[HELPFUL_ERRORS_BRAND] = version; // e.g. '1.8.0' or a major token like 'v1'
```

**critical**: it must be `Symbol.for('...')` (the **global registry**), NOT `Symbol('...')`.
a plain `Symbol()` is module-local — each duplicate copy of helpful-errors mints a *different* symbol, so a brand set by copy A is invisible to copy B. only `Symbol.for()` is shared across copies, which is the entire point.

### 2. expose read utils

```ts
export const isHelpfulError = (error: unknown): boolean =>
  !!error && typeof error === 'object' && Symbol.for('helpful-errors') in error;

export const getHelpfulErrorVersion = (error: unknown): string | undefined =>
  isHelpfulError(error) ? (error as any)[Symbol.for('helpful-errors')] : undefined;
```

### 3. keep the property non-enumerable

use `Object.defineProperty(this, HELPFUL_ERRORS_BRAND, { value: version, enumerable: false })` so it does not pollute `toJSON()` / `Object.keys()` — matches how `original` is stored today (`HelpfulError.js:50-60`).

### open decisions for the helpful-errors author

- **value shape**: full version string (`'1.8.0'`) vs a stable major token (`'v1'`)? a major token is more forgiving for range checks; a full version is more precise. lean: full version, since consumers can `semver.satisfies` it.
- **public surface**: export `isHelpfulError` + `getHelpfulErrorVersion` as part of the package api? (recommended — that is the whole value.)
- **symbol key string**: `'helpful-errors'` vs a namespaced `'helpful-errors/brand'`. pick one and treat it as a stable public contract (consumers key off it).

---

## the change in `with-simple-cache` (here, after #1 releases)

1. **add the peer-dep** — move/add `helpful-errors` to `peerDependencies` with a min version that includes the brand (e.g. `">=1.8.0"`), and keep it in `devDependencies` for local test runs.
2. **swap the converge guard** — once a single shared copy is enforced, `error instanceof SimpleCacheConditionError` works cross-package again. optionally harden with the symbol as a fallback:
   - is-it-ours: `isHelpfulError(error)` (symbol) — survives even a stray duplicate copy
   - is-it-a-condition-error: still need the subclass discriminator (`instanceof SimpleCacheConditionError` under the peer-dep, or the branded-marker per vision Q4). the base symbol alone does NOT distinguish a `SimpleCacheConditionError` from a `BadRequestError`.
3. **test** — cross-package convergence test: construct a foreign-copy error that carries `Symbol.for('helpful-errors')` and assert the guard converges.

> note: the base symbol answers "is this a helpful-errors error + version". it does NOT answer "is this specifically a condition error" — the subclass discriminator (peer-dep-enabled `instanceof`, or the branded marker) is still required for specificity. the peer-dep is what makes that `instanceof` reliable.

---

## acceptance criteria

- [ ] `helpful-errors` stamps every base error with `Symbol.for('helpful-errors')` = version, non-enumerable
- [ ] `helpful-errors` exports `isHelpfulError` (+ optionally `getHelpfulErrorVersion`)
- [ ] `helpful-errors` released with a version that carries the brand
- [ ] `with-simple-cache` adds `helpful-errors` as a peerDependency pinned to `>=` that version
- [ ] converge guard fix + cross-package test land here, gated on the above

---

## refs

- bug + design: `.behavior/v2026_07_08.fix-condition-convergance/1.vision.yield.md`
- the two guard sites: `src/domain.operations/wrappers/withSimpleCache.ts:306`, `src/domain.operations/wrappers/withSimpleCacheAsync.ts:357`
- our error class: `src/utils/errors/SimpleCacheConditionError.ts`
- helpful-errors constructor to modify: `HelpfulError.js` constructor (the `new.target.name` prefix logic + `original` non-enumerable pattern at lines 20-60)
