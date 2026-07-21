import { UnexpectedCodePathError } from 'helpful-errors';
import type { IsoDuration } from 'iso-time';
import { createCache, type SimpleInMemoryCache } from 'simple-in-memory-cache';
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
import { isSimpleCacheConditionError } from '@src/utils/errors/isSimpleCacheConditionError';

import { withExtendableCache } from './withExtendableCache';

/**
 * return type depends on meta value
 */
type WithMetaReturnAsync<
  L extends CacheableLogicAsync,
  C extends SimpleCache<any>,
  M extends 'include' | 'exclude' | undefined,
> = M extends 'include'
  ? (...args: Parameters<L>) => Promise<{
      output: Awaited<ReturnType<L>>;
      cached: CacheMetaOutput<C>;
    }>
  : L;

export type CacheableLogicAsync = (...args: any[]) => Promise<any>;

/**
 * cache option type: direct cache, extraction function, or object with output + deduplication
 */
export type SimpleCacheOption<
  L extends CacheableLogicAsync,
  C extends SimpleCache<any> = SimpleCache<any>,
> =
  | WithSimpleCacheChoice<Parameters<L>, C>
  | {
      output: WithSimpleCacheChoice<Parameters<L>, C>;
      deduplication: SimpleInMemoryCache<any>;
    };

/**
 * options to configure cache for use with-simple-cache
 */
export interface WithSimpleCacheAsyncOptions<
  /**
   * the logic we wrap with cache
   */
  L extends CacheableLogicAsync,
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
   * - object: { output: cache, deduplication: inMemoryCache }
   */
  cache: SimpleCacheOption<L, C>;

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
     * @param output - the return value from the wrapped function (awaited)
     * @returns the value to store in cache (must match cache's value type)
     *
     * @default identity (no transformation)
     */
    value?: (
      output: Awaited<ReturnType<L>>,
    ) => NotUndefined<Awaited<ReturnType<C['get']>>>;
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
    value?: (
      cached: NotUndefined<Awaited<ReturnType<C['get']>>>,
    ) => Awaited<ReturnType<L>>;
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
     * - keeps whatever the previously cached value was, while returns the new value
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
 * get the output cache choice from the cache input
 */
export const getOutputCacheOptionFromCacheInput = <
  L extends CacheableLogicAsync,
  C extends SimpleCache<any>,
>(
  cacheInput: SimpleCacheOption<L, C>,
): WithSimpleCacheChoice<Parameters<L>, C> =>
  'output' in cacheInput ? cacheInput.output : cacheInput;

/**
 * get the deduplication cache from the cache input
 */
const getDeduplicationCacheOptionFromCacheInput = <
  L extends CacheableLogicAsync,
  C extends SimpleCache<any>,
>(
  cacheInput: SimpleCacheOption<L, C>,
): SimpleInMemoryCache<any> =>
  'deduplication' in cacheInput
    ? cacheInput.deduplication
    : createCache({
        expiration: { minutes: 15 },
      });

/**
 * a wrapper which adds asynchronous cache to asynchronous logic
 *
 * note
 * - uses an additional in-memory synchronous cache under the hood to prevent duplicate requests
 * - can accept a synchronous cache (sync is a subset of async capability)
 */
export const withSimpleCacheAsync = <
  /**
   * the logic we wrap with cache
   */
  L extends CacheableLogicAsync,
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
    deserialize: { value: deserializeValue = noOp } = {},
    expiration,
    bypass = {
      get: defaultShouldBypassGetMethod,
      set: defaultShouldBypassSetMethod,
    },
    meta,
    condition,
  }: WithSimpleCacheAsyncOptions<L, C, M>,
): WithMetaReturnAsync<L, C, M> => {
  // localize the version-precondition option
  // why-types-lack: `condition` is typed via a generic conditional (`HasCacheConditionals<C> ? … : never`)
  //   that TypeScript cannot narrow inside the wrapper body, so it reads as `never` here.
  // correct-type: the plain option shape when present, else undefined.
  // removal: drop this cast if the option type is refactored to be narrowable without the C-conditional.
  const conditionOption = condition as
    | WithSimpleCacheConditionOption<L>
    | undefined;

  // add async cache to the logic
  const logicWithAsyncCache = (async (...args: Parameters<L>): Promise<any> => {
    // define key based on args the function was invoked with
    const key = serializeKey(args[0], args[1]);

    // define cache based on options
    const cache = getCacheFromCacheChoice({
      forInput: args,
      cacheOption: getOutputCacheOptionFromCacheInput(cacheOption),
    });

    // capability view of the cache for runtime probes
    // why-types-lack: the generic C is the base SimpleCache; the optional capability methods
    //   (uri, version) live only on the WithCacheUri / WithCacheConditionals variants, so the base
    //   type does not surface them — a cast is the only way to probe them at runtime.
    // correct-type: a partial of the two optional capability accessors (no `any`); version may be
    //   async on an async cache, so its return is awaited below.
    // removal: drop this view once SimpleCache models uri()/version() as optional members.
    const cacheCapabilities = cache as {
      uri?: (key: string) => string;
      // version can legitimately return undefined (key absent), per HasCacheConditionals
      version?: (
        key: string,
      ) => string | undefined | Promise<string | undefined>;
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
    const asOutput = async (deserializedValue: Awaited<ReturnType<L>>) => {
      if (meta === 'include') {
        const cached: Record<string, string | undefined> = {};
        if (typeof cacheCapabilities.uri === 'function')
          cached.uri = cacheCapabilities.uri(key);
        if (typeof cacheCapabilities.version === 'function')
          cached.version = await cacheCapabilities.version(key);
        return { output: deserializedValue, cached };
      }
      return deserializedValue;
    };

    // see if its already cached
    const cachedValue = bypass.get?.(...args)
      ? undefined
      : await cache.get(key);

    // guard: return cached value if found
    if (isNotUndefined(cachedValue))
      return asOutput(deserializeValue(cachedValue));

    // if not cached, grab the output from the logic
    const output: Awaited<ReturnType<L>> = await logic(...args);

    // guard: bypass cache.set if requested
    if (bypass.set?.(...args)) return asOutput(output);

    // compute the version precondition: a static token, or an extractor over the full input
    const versionSpec = conditionOption?.version;
    const conditionVersion =
      typeof versionSpec === 'function' ? versionSpec(...args) : versionSpec;

    // converge a conditional-write conflict per the exception mode (rethrow unless 'ignore')
    const convergeOnWriteConflict = async (
      error: unknown,
    ): Promise<Awaited<ReturnType<L>>> => {
      // rethrow any error that isn't a conditional-write conflict we own
      // detect by structural name check, not instanceof — a backend in a separate package
      // throws a different SimpleCacheConditionError constructor, which instanceof would miss
      if (!(conditionOption && isSimpleCacheConditionError(error))) throw error;
      // exception: 'throw' (default) → propagate the conflict
      if (conditionOption.exception !== 'ignore') throw error;
      // exception: 'ignore' → re-read and return the winner's value to converge on it.
      // fallback semantics: if the winner's value has already vanished by the time we re-read
      // (e.g. the winner deleted the key, or its ttl expired in the race window), there is no
      // winner to converge on — so we return our own freshly-computed output rather than undefined,
      // which keeps the caller's result well-defined instead of a surprise miss
      const winnerValue = await cache.get(key);
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
      await cache.set(key, serializedOutput, {
        expiration,
        ...(conditionOption
          ? { condition: { version: conditionVersion } }
          : {}),
      } as any);
    } catch (error) {
      // on a conditional-write conflict, converge per the exception mode
      return asOutput(await convergeOnWriteConflict(error));
    }

    // if the output was undefined, we can just return here - no deserialization needed
    if (output === undefined) return asOutput(output);

    // and now re-get from the cache, to ensure that output on first response === output on second response
    const cachedValueNow = await cache.get(key);
    if (isNotUndefined(cachedValueNow))
      return asOutput(deserializeValue(cachedValueNow));

    // otherwise, somehow, get-after-set returned undefined - this should never occur
    throw new UnexpectedCodePathError(
      'cache.get returned undefined immediately after cache.set. cache implementation may be inconsistent',
      { key, output },
    );
  }) as L;

  // wrap the logic with extended sync cache, to ensure that duplicate requests resolve the same promise from in-memory (rather than each getting a promise to check the async cache + operate separately)
  const { execute, invalidate } = withExtendableCache(logicWithAsyncCache, {
    cache: getDeduplicationCacheOptionFromCacheInput(cacheOption),
    serialize: {
      key: serializeKey,
    },
  });

  // define a function which the user will run which kicks off the result + invalidates the in-memory cache promise as soon as it finishes
  const logicWithAsyncCacheAndInMemoryRequestDeduplication = async (
    ...args: Parameters<L>
  ): Promise<any> => {
    // skip dedup for conditional writes: each caller's version precondition must be evaluated
    // independently against the backend. dedup would hand a concurrent caller another caller's
    // settled result, which skips this caller's own condition — a silent correctness hole. so when
    // a condition is configured, run the async-cache logic directly with no in-memory dedup
    if (conditionOption) return logicWithAsyncCache(...args);

    // kick off the request w/ async cache + sync cache
    const promiseResult = execute(...args);

    // after the promise settles, remove it from the dedup cache so later unique requests can run
    // note: invalidate is a synchronous in-memory delete (cache.set(key, undefined)) — it does no i/o
    //       and cannot throw, so it cannot mask the caller's settled result. we therefore call it
    //       directly with no catch: a swallow would be a failhide, and if a future change ever lets
    //       invalidate throw, we want that real defect surfaced rather than hidden
    return promiseResult.finally(() => invalidate({ forInput: args }));
  };

  // return the function w/ async cache and sync-in-memory-request-deduplication
  return logicWithAsyncCacheAndInMemoryRequestDeduplication as WithMetaReturnAsync<
    L,
    C,
    M
  >;
};
