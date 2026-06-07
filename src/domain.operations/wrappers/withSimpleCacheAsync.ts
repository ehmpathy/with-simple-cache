import type { UniDuration } from '@ehmpathy/uni-time';
import { UnexpectedCodePathError } from 'helpful-errors';
import { createCache, type SimpleInMemoryCache } from 'simple-in-memory-cache';
import { isNotUndefined, type NotUndefined } from 'type-fns';

import type { HasCacheUri, SimpleCache } from '@src/domain.objects/SimpleCache';
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

import { withExtendableCache } from './withExtendableCache';

/**
 * allowed meta values depend on whether cache has uri method
 *
 * 'include' is only available when cache has uri method
 */
type MetaValue<C extends SimpleCache<any>> =
  HasCacheUri<C> extends true ? 'include' | 'exclude' : 'exclude';

/**
 * return type depends on meta value
 */
type WithMetaReturnAsync<
  L extends CacheableLogicAsync,
  M extends 'include' | 'exclude' | undefined,
> = M extends 'include'
  ? (...args: Parameters<L>) => Promise<{
      output: Awaited<ReturnType<L>>;
      cached: { uri: string };
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
  M extends MetaValue<C> | undefined = undefined,
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
  expiration?: UniDuration | null;

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
   * - 'include': returns { output, cached } where cached.uri is present if cache supports it
   *
   * note
   * - 'include' is only available when the cache has a uri method
   */
  meta?: M;
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
  M extends MetaValue<C> | undefined = undefined,
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
  }: WithSimpleCacheAsyncOptions<L, C, M>,
): WithMetaReturnAsync<L, M> => {
  // add async cache to the logic
  const logicWithAsyncCache = (async (...args: Parameters<L>): Promise<any> => {
    // define key based on args the function was invoked with
    const key = serializeKey(args[0], args[1]);

    // define cache based on options
    const cache = getCacheFromCacheChoice({
      forInput: args,
      cacheOption: getOutputCacheOptionFromCacheInput(cacheOption),
    });

    // runtime guard: meta: 'include' requires cache with uri method
    if (meta === 'include' && typeof (cache as any).uri !== 'function') {
      throw new BadRequestError(
        "meta: 'include' requires cache with uri method. use meta: 'exclude' or provide a cache that implements uri(key)",
        { cache },
      );
    }

    // helper to wrap output when meta: 'include'
    const asOutput = (deserializedValue: Awaited<ReturnType<L>>) => {
      if (meta === 'include') {
        const cachedUri =
          typeof (cache as any).uri === 'function'
            ? (cache as any).uri(key)
            : undefined;
        return { output: deserializedValue, cached: { uri: cachedUri } };
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

    // set the output to the cache
    const serializedOutput = serializeValue(output);
    await cache.set(key, serializedOutput, { expiration });

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
    // start executing the request w/ async cache + sync cache
    const promiseResult = execute(...args);

    // ensure that after the promise resolves, we remove it from the cache (so that unique subsequent requests can still be made)
    // note: .finally() preserves the original result/error, so we don't need .then()
    // note: cleanup errors are caught so they don't hide the original result/error
    return promiseResult.finally(() => {
      try {
        invalidate({ forInput: args });
      } catch {
        // cleanup errors are deliberately ignored - original result/error takes precedence
        // this is NOT a failhide: we explicitly choose to prioritize the main operation outcome
      }
    });
  };

  // return the function w/ async cache and sync-in-memory-request-deduplication
  return logicWithAsyncCacheAndInMemoryRequestDeduplication as WithMetaReturnAsync<
    L,
    M
  >;
};
