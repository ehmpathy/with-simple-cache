import type { IsoDuration } from 'iso-time';

/**
 * a version precondition for a conditional cache operation — usable on BOTH get and set
 *
 * - version: null      → "must be absent" (put-if-absent)
 * - version: '<token>' → "must match the current version" (compare-and-set)
 *
 * note
 * - the version token is opaque; treat it as an equality-only value, never parse or order it
 */
export type SimpleCacheCondition = { version: string | null };

/**
 * a cacheable logic function — the operation a wrapper caches
 *
 * note
 * - intentionally wide ((...args: any[]) => any) so it bounds both sync and async logic; the
 *   async wrapper's logic (which returns a Promise) also satisfies it
 */
export type CacheableLogic = (...args: any[]) => any;

/**
 * the version-precondition option on a cache wrapper (present only when HasCacheConditionals<C>)
 *
 * gates the cache set on a version precondition for an atomic conditional write
 *
 * note
 * - shared by both wrappers (sync + async); the async wrapper's logic type also satisfies the
 *   CacheableLogic base, so one option type serves both per rule.require.wrapper-symmetry
 */
export interface WithSimpleCacheConditionOption<L extends CacheableLogic> {
  /**
   * the version to match — a static value, or an extractor over the operation's full args
   *
   * - null      → "must be absent" (put-if-absent)
   * - '<token>' → "must match the current version" (compare-and-set)
   */
  version: (string | null) | ((...args: Parameters<L>) => string | null);

  /**
   * how to handle a precondition miss
   *
   * - 'throw' (default) → propagate SimpleCacheConditionError to the caller
   * - 'ignore'          → swallow, re-read, and return the winner's value (converge)
   */
  exception?: 'throw' | 'ignore';
}

/**
 * options for a cache get
 *
 * note
 * - the condition slot is `never` (unusable) on a base cache; a cache that advertises
 *   conditionals (WithCacheConditionals) widens it to SimpleCacheCondition
 * - `never` (not `undefined`) keeps WithCacheConditionals a structural subtype of the base
 *   cache under strictFunctionTypes (never is assignable to the widened param, contravariantly)
 */
export interface SimpleCacheGetOptions<TCondition = never> {
  condition?: TCondition;
}

/**
 * options for a cache set
 *
 * note
 * - condition is ordered after expiration
 * - the condition slot is `never` (unusable) on a base cache; a cache that advertises
 *   conditionals (WithCacheConditionals) widens it to SimpleCacheCondition
 * - `never` (not `undefined`) keeps WithCacheConditionals a structural subtype of the base
 *   cache under strictFunctionTypes (never is assignable to the widened param, contravariantly)
 */
export interface SimpleCacheSetOptions<TCondition = never> {
  expiration?: IsoDuration | null;
  condition?: TCondition;
}

/**
 * a simple cache which synchronously gets and sets values to its store
 *
 * note
 * - TCondition defaults to `never` (a base cache advertises no condition capability); a
 *   conditionals-capable cache threads SimpleCacheCondition through via WithCacheConditionals
 */
export interface SimpleCacheSync<T, TCondition = never> {
  get: (
    key: string,
    options?: SimpleCacheGetOptions<TCondition>,
  ) => T | undefined;
  set: (
    key: string,
    value: T | undefined,
    options?: SimpleCacheSetOptions<TCondition>,
  ) => void;
}

/**
 * a simple cache which asynchronously gets and sets values to its store
 *
 * note
 * - TCondition defaults to `never` (a base cache advertises no condition capability); a
 *   conditionals-capable cache threads SimpleCacheCondition through via WithCacheConditionals
 */
export interface SimpleCacheAsync<T, TCondition = never> {
  get: (
    key: string,
    options?: SimpleCacheGetOptions<TCondition>,
  ) => Promise<T | undefined>;
  set: (
    key: string,
    value: T | undefined,
    options?: SimpleCacheSetOptions<TCondition>,
  ) => Promise<void>;
}

/**
 * a simple cache
 */
export type SimpleCache<T> = SimpleCacheAsync<T> | SimpleCacheSync<T>;

/**
 * intersect any SimpleCache with uri resolution capability
 *
 * use this type when you need to require a cache that can expose its storage location
 */
export type WithCacheUri<TCache extends SimpleCache<any>> = TCache & {
  /**
   * compute the URI for a given cache key
   *
   * @returns the full URI where this key is stored (e.g., 's3://bucket/prefix/key')
   */
  uri: (key: string) => string;
};

/**
 * detect if cache has uri method
 */
export type HasCacheUri<C> = C extends { uri: (key: string) => string }
  ? true
  : false;

/**
 * intersect any SimpleCache with conditional-write (compare-and-set) capability
 *
 * a conditional cache can:
 * - report the current opaque version token for a key, via version(key)
 * - check a version precondition on get (throws SimpleCacheConditionError on mismatch)
 * - gate a set on a version precondition (throws SimpleCacheConditionError on mismatch)
 *
 * this mirrors WithCacheUri — the package defines the vocabulary, each backend supplies the impl
 *
 * cross-package contract (the wrapper leans on this for convergence)
 * - the wrapper recognizes a backend's conflict *structurally*, by name, not by `instanceof` (which
 *   fails across a package boundary): the thrown error's runtime class name must be exactly
 *   `SimpleCacheConditionError` AND some ancestor in its prototype chain must be named `ConstraintError`
 *   (from helpful-errors). a backend that names its error differently, or whose error does not descend
 *   from ConstraintError, will not converge — the wrapper re-throws instead
 * - so a conformant backend either re-throws *our* exported `SimpleCacheConditionError`, or throws its
 *   own ConstraintError subclass named `SimpleCacheConditionError`. this is doc-enforced today; a
 *   registered-symbol brand on helpful-errors is the planned compile-safe replacement
 * - a caller who uses `exception: 'throw'` and wants to recognize a re-thrown conflict cross-package
 *   should use the exported `isSimpleCacheConditionError` predicate, not `instanceof` (which fails
 *   across the boundary for the same reason the wrapper's own guard cannot use it)
 */
export type WithCacheConditionals<TCache extends SimpleCache<any>> =
  TCache extends SimpleCacheAsync<infer T>
    ? // preserve any extra capabilities (e.g. uri), thread the condition through the base
      //   get/set (SimpleCacheAsync<T, SimpleCacheCondition>) so those signatures cannot drift
      //   from the base, then add the version reader
      Omit<TCache, 'get' | 'set'> &
        SimpleCacheAsync<T, SimpleCacheCondition> & {
          /**
           * read the current opaque version token for a key (undefined if absent)
           *
           * note
           * - treat the token as an equality-only value; never parse or order it
           * - safe to pair with a version condition on get: version(key) then get(key, { condition: { version } })
           */
          version: (key: string) => Promise<string | undefined>;
        }
    : TCache extends SimpleCacheSync<infer T>
      ? Omit<TCache, 'get' | 'set'> &
          SimpleCacheSync<T, SimpleCacheCondition> & {
            /**
             * read the current opaque version token for a key (undefined if absent)
             *
             * note
             * - treat the token as an equality-only value; never parse or order it
             * - safe to pair with a version condition on get: version(key) then get(key, { condition: { version } })
             */
            version: (key: string) => string | undefined;
          }
      : never;

/**
 * detect if cache has conditional-write capability (off the distinctive version method)
 *
 * this mirrors HasCacheUri
 *
 * note
 * - detection is structural, not nominal: any cache whose `version` method matches this shape is
 *   treated as conditional-capable. the risk of a false positive is bounded — the `version`
 *   signature is specific, and the wrapper's runtime guard throws BadRequestError if a condition
 *   is configured against a cache that does not actually honor it
 * - the shape unifies sync and async on purpose: a sync `version(key) => string | undefined` also
 *   satisfies it, so a sync cache is conditional-capable in the async wrapper too. that is correct —
 *   the async wrapper awaits the return, and `await <string>` is just the string
 */
export type HasCacheConditionals<C> = C extends {
  version: (key: string) => string | undefined | Promise<string | undefined>;
}
  ? true
  : false;

/**
 * true when a cache surfaces any capability that meta:'include' can report (uri OR conditionals)
 *
 * note
 * - a single OR-semantics helper so CacheMetaChoice does not duplicate the 'include' | 'exclude' branch
 */
export type HasCacheMetaCapacity<C extends SimpleCache<any>> =
  HasCacheUri<C> extends true
    ? true
    : HasCacheConditionals<C> extends true
      ? true
      : false;

/**
 * the meta values allowed by a wrapper, per the cache's surfaceable capabilities
 *
 * 'include' is available when the cache has a uri OR conditional-write capability; otherwise only 'exclude'
 *
 * note
 * - shared by both wrappers (sync + async) since it depends only on the cache type, not the logic
 */
export type CacheMetaChoice<C extends SimpleCache<any>> =
  HasCacheMetaCapacity<C> extends true ? 'include' | 'exclude' : 'exclude';

/**
 * the metadata surfaced alongside output when meta: 'include'
 *
 * each field appears only when the cache advertises that capability
 * - uri     — present when the cache HasCacheUri (computed from the key, always a string)
 * - version — present when the cache HasCacheConditionals; `string | undefined` because version(key)
 *             is undefined for a key with no stored entry (e.g. bypass.set before any write)
 *
 * note
 * - shared by both wrappers (sync + async) since it depends only on the cache type, not the logic
 */
export type CacheMetaOutput<C extends SimpleCache<any>> =
  (HasCacheUri<C> extends true ? { uri: string } : Record<never, never>) &
    (HasCacheConditionals<C> extends true
      ? { version: string | undefined }
      : Record<never, never>);
