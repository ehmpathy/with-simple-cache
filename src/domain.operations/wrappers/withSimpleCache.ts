import { UnexpectedCodePathError } from 'helpful-errors';
import type { IsoDuration } from 'iso-time';
import { isNotUndefined, type NotUndefined } from 'type-fns';

import type {
  CacheMetaChoice,
  CacheMetaOutput,
  HasCacheConditionals,
  SimpleCache,
  WithSimpleCacheConditionOption,
} from '@src/domain.objects/SimpleCache';
import {
  getCacheFromCacheChoice,
  type WithSimpleCacheChoice,
} from '@src/domain.operations/options/getCacheFromCacheChoice';
import {
  defaultKeySerializationMethod,
  defaultShouldBypassGetMethod,
  defaultShouldBypassSetMethod,
  defaultValueSerializationMethod,
  type KeySerializationMethod,
  noOp,
} from '@src/domain.operations/serde/defaults';
import { BadRequestError } from '@src/utils/errors/BadRequestError';
import { SimpleCacheConditionError } from '@src/utils/errors/SimpleCacheConditionError';

export type CacheableLogicSync = (...args: any[]) => any;

/**
 * return type depends on meta value
 */
type WithMetaReturn<
  L extends CacheableLogicSync,
  C extends SimpleCache<any>,
  M extends 'include' | 'exclude' | undefined,
> = M extends 'include'
  ? (...args: Parameters<L>) => {
      output: ReturnType<L>;
      cached: CacheMetaOutput<C>;
    }
  : L;

/**
 * options to configure cache for use with-simple-cache
 */
export interface WithSimpleCacheOptions<
  /**
   * the logic we wrap with cache
   */
  L extends CacheableLogicSync,
  /**
   * the cache type
   */
  C extends SimpleCache<any>,
  /**
   * whether to include cache metadata in the return value
   */
  M extends CacheMetaChoice<C> | undefined = undefined,
> {
  /**
   * the cache to persist outputs
   *
   * accepts:
   * - direct cache instance
   * - extraction function: (_input, context) => context.cache
   */
  cache: WithSimpleCacheChoice<Parameters<L>, C>;

  /**
   * custom serialization for cache keys and values
   *
   * use when the logic's return type differs from the cache's stored type
   */
  serialize?: {
    /**
     * serialize input args to a cache key string
     *
     * @param input - the first argument passed to the wrapped function
     * @param context - the second argument passed to the wrapped function (if any)
     * @returns a string key for cache lookup
     *
     * @default JSON.stringify(input)
     */
    key?: KeySerializationMethod<Parameters<L>>;

    /**
     * serialize the logic's output before cache set
     *
     * @param output - the return value from the wrapped function
     * @returns the value to store in cache (must match cache's value type)
     *
     * @default identity (no transformation)
     */
    value?: (output: ReturnType<L>) => NotUndefined<ReturnType<C['get']>>;
  };

  /**
   * custom deserialization for cached values
   *
   * use when the cache's stored type differs from the logic's return type
   */
  deserialize?: {
    /**
     * deserialize cached value back to the logic's return type
     *
     * @param cached - the value retrieved from cache
     * @returns the value to return to the caller (must match logic's return type)
     *
     * @default identity (no transformation)
     */
    value?: (cached: NotUndefined<ReturnType<C['get']>>) => ReturnType<L>;
  };

  /**
   * time-to-live for cached values
   *
   * @example { seconds: 60 }
   * @example { minutes: 5 }
   * @example { hours: 1 }
   * @example null // no expiration
   *
   * @default undefined (cache decides)
   */
  expiration?: IsoDuration | null;

  /**
   * whether to bypass the cache for get or set operations
   */
  bypass?: {
    /**
     * whether to bypass the cache for the get
     *
     * note
     * - equivalent to the result not already cached
     *
     * default
     * - process.env.CACHE_BYPASS_GET ? process.env.CACHE_BYPASS_GET === 'true' : process.env.CACHE_BYPASS === 'true'
     */
    get?: (...args: Parameters<L>) => boolean;

    /**
     * whether to bypass the cache for the set
     *
     * note
     * - keeps whatever the previously cached value was, returns the new value
     *
     * default
     * - process.env.CACHE_BYPASS_SET ? process.env.CACHE_BYPASS_SET === 'true' : process.env.CACHE_BYPASS === 'true'
     */
    set?: (...args: Parameters<L>) => boolean;
  };

  /**
   * whether to include cache metadata in the return value
   *
   * - 'exclude' (default): returns the logic's return value directly
   * - 'include': returns { output, cached } where cached.uri / cached.version are present per capability
   *
   * note
   * - 'include' is only available when the cache has a uri or conditional-write capability
   */
  meta?: M;

  /**
   * a version precondition that gates the cache set (atomic conditional write)
   *
   * note
   * - available only when the cache HasCacheConditionals (a plain cache rejects it at compile time)
   * - the get→compute→set flow calls cache.set(key, value, { condition }); a precondition miss
   *   throws SimpleCacheConditionError, which `exception` governs (throw by default, or ignore + converge)
   */
  condition?: HasCacheConditionals<C> extends true
    ? WithSimpleCacheConditionOption<L>
    : never;
}

/**
 * a wrapper which uses a synchronous cache to cache the result of the wrapped logic
 *
 * for example:
 * ```ts
 * const getApiResult = withSimpleCache(({ name, number }) => axios.get(URL, { name, number }));
 * const result1 = getApiResult({ name: 'casey', number: 821 }); // calls the api, puts promise of results into cache, returns that promise
 * const result2 = getApiResult({ name: 'casey', number: 821 }); // returns the same promise from above, because it was found in cache - since same input as request above was used
 * expect(result1).toBe(result2); // same exact object - the promise
 * expect(await result1).toBe(await result2); // same exact object - the result of the promise
 * ```
 */
export const withSimpleCache = <
  /**
   * the logic we wrap with cache
   */
  L extends CacheableLogicSync,
  /**
   * the cache type
   */
  C extends SimpleCache<any>,
  /**
   * whether to include cache metadata in the return value
   */
  M extends CacheMetaChoice<C> | undefined = undefined,
>(
  logic: L,
  {
    cache: cacheOption,
    serialize: {
      key: serializeKey = defaultKeySerializationMethod, // default serialize key to JSON.stringify
      value: serializeValue = defaultValueSerializationMethod, // default serialize value to noOp
    } = {},
    deserialize: {
      value: deserializeValue = noOp, // default deserialize value to noOp
    } = {},
    expiration,
    bypass = {
      get: defaultShouldBypassGetMethod,
      set: defaultShouldBypassSetMethod,
    },
    meta,
    condition,
  }: WithSimpleCacheOptions<L, C, M>,
): WithMetaReturn<L, C, M> => {
  // localize the version-precondition option
  // why-types-lack: `condition` is typed via a generic conditional (`HasCacheConditionals<C> ? … : never`)
  //   that TypeScript cannot narrow inside the wrapper body, so it reads as `never` here.
  // correct-type: the plain option shape when present, else undefined.
  // removal: drop this cast if the option type is refactored to be narrowable without the C-conditional.
  const conditionOption = condition as
    | WithSimpleCacheConditionOption<L>
    | undefined;

  return ((...args: Parameters<L>): any => {
    // define key based on args the function was invoked with
    const key = serializeKey(args[0], args[1]);

    // define cache based on options
    const cache = getCacheFromCacheChoice({ forInput: args, cacheOption });

    // capability view of the cache for runtime probes
    // why-types-lack: the generic C is the base SimpleCache; the optional capability methods
    //   (uri, version) live only on the WithCacheUri / WithCacheConditionals variants, so the base
    //   type does not surface them — a cast is the only way to probe them at runtime.
    // correct-type: a partial of the two optional capability accessors (no `any`).
    // removal: drop this view once SimpleCache models uri()/version() as optional members.
    const cacheCapabilities = cache as {
      uri?: (key: string) => string;
      // version can legitimately return undefined (key absent), per HasCacheConditionals
      version?: (key: string) => string | undefined;
    };

    // runtime guard: meta: 'include' requires a cache with a uri or version method
    if (
      meta === 'include' &&
      typeof cacheCapabilities.uri !== 'function' &&
      typeof cacheCapabilities.version !== 'function'
    ) {
      throw new BadRequestError(
        "meta: 'include' requires a cache with a uri or version method. use meta: 'exclude' or provide a cache that implements uri(key) or version(key)",
        { cache },
      );
    }

    // runtime guard: a condition precondition requires a conditionals-capable cache (version method)
    // fails loud if the compile-time HasCacheConditionals gate was bypassed (e.g., via a cast or an
    // extractor that returns a non-conditional cache); the atomic-write intent must not silently vanish
    if (conditionOption && typeof cacheCapabilities.version !== 'function') {
      throw new BadRequestError(
        'condition requires a cache with a version method (conditional-write capability). provide a cache that implements version(key), or remove the condition option',
        { cache },
      );
    }

    // helper to wrap output when meta: 'include'
    const asOutput = (deserializedValue: ReturnType<L>) => {
      if (meta === 'include') {
        const cached: Record<string, string | undefined> = {};
        if (typeof cacheCapabilities.uri === 'function')
          cached.uri = cacheCapabilities.uri(key);
        if (typeof cacheCapabilities.version === 'function')
          cached.version = cacheCapabilities.version(key);
        return { output: deserializedValue, cached };
      }
      return deserializedValue;
    };

    // see if its already cached
    const cachedValue = bypass.get?.(...args) ? undefined : cache.get(key);

    // guard: return cached value if found
    if (isNotUndefined(cachedValue))
      return asOutput(deserializeValue(cachedValue));

    // if not cached, grab the output from the logic
    const output: ReturnType<L> = logic(...args);

    // guard: bypass cache.set if requested
    if (bypass.set?.(...args)) return asOutput(output);

    // compute the version precondition: a static token, or an extractor over the full input
    const versionSpec = conditionOption?.version;
    const conditionVersion =
      typeof versionSpec === 'function' ? versionSpec(...args) : versionSpec;

    // converge a conditional-write conflict per the exception mode (rethrow unless 'ignore')
    const convergeOnWriteConflict = (error: unknown): ReturnType<L> => {
      // rethrow any error that isn't a conditional-write conflict we own
      if (!(conditionOption && error instanceof SimpleCacheConditionError))
        throw error;
      // exception: 'throw' (default) → propagate the conflict
      if (conditionOption.exception !== 'ignore') throw error;
      // exception: 'ignore' → re-read and return the winner's value to converge on it.
      // fallback semantics: if the winner's value has already vanished by the time we re-read
      // (e.g. the winner deleted the key, or its ttl expired in the race window), there is no
      // winner to converge on — so we return our own freshly-computed output rather than undefined,
      // which keeps the caller's result well-defined instead of a surprise miss
      const winnerValue = cache.get(key);
      return isNotUndefined(winnerValue)
        ? deserializeValue(winnerValue)
        : output;
    };

    // set the output to the cache (gated on the version precondition, if any)
    const serializedOutput = serializeValue(output);
    try {
      // why-types-lack: the base cache.set types its options `condition` slot as `never`, so a
      //   real condition object does not fit the base signature.
      // correct-type: the conditionals-capable set options (SimpleCacheSetOptions<SimpleCacheCondition>),
      //   which the runtime cache honors here — guaranteed by the compile-time HasCacheConditionals gate.
      // removal: drop this cast once the SimpleCache set signature is generic over its condition type.
      cache.set(key, serializedOutput, {
        expiration,
        ...(conditionOption
          ? { condition: { version: conditionVersion } }
          : {}),
      } as any);
    } catch (error) {
      // on a conditional-write conflict, converge per the exception mode
      return asOutput(convergeOnWriteConflict(error));
    }

    // if the output was undefined, we can just return here - no deserialization needed
    if (output === undefined) return asOutput(output);

    // and now re-get from the cache, to ensure that output on first response === output on second response
    const cachedValueNow = cache.get(key);
    if (isNotUndefined(cachedValueNow))
      return asOutput(deserializeValue(cachedValueNow));

    // otherwise, somehow, get-after-set returned undefined - this should never occur
    throw new UnexpectedCodePathError(
      'cache.get returned undefined immediately after cache.set. cache implementation may be inconsistent',
      { key, output },
    );
  }) as WithMetaReturn<L, C, M>;
};
