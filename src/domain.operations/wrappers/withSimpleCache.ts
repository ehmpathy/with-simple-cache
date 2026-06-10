import { UnexpectedCodePathError } from 'helpful-errors';
import type { IsoDuration } from 'iso-time';
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

export type CacheableLogicSync = (...args: any[]) => any;

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
type WithMetaReturn<
  L extends CacheableLogicSync,
  M extends 'include' | 'exclude' | undefined,
> = M extends 'include'
  ? (...args: Parameters<L>) => {
      output: ReturnType<L>;
      cached: { uri: string };
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
  M extends MetaValue<C> | undefined = undefined,
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
   * - 'include': returns { output, cached } where cached.uri is present if cache supports it
   *
   * note
   * - 'include' is only available when the cache has a uri method
   */
  meta?: M;
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
  M extends MetaValue<C> | undefined = undefined,
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
  }: WithSimpleCacheOptions<L, C, M>,
): WithMetaReturn<L, M> => {
  return ((...args: Parameters<L>): any => {
    // define key based on args the function was invoked with
    const key = serializeKey(args[0], args[1]);

    // define cache based on options
    const cache = getCacheFromCacheChoice({ forInput: args, cacheOption });

    // runtime guard: meta: 'include' requires cache with uri method
    if (meta === 'include' && typeof (cache as any).uri !== 'function') {
      throw new BadRequestError(
        "meta: 'include' requires cache with uri method. use meta: 'exclude' or provide a cache that implements uri(key)",
        { cache },
      );
    }

    // helper to wrap output when meta: 'include'
    const asOutput = (deserializedValue: ReturnType<L>) => {
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
    const cachedValue = bypass.get?.(...args) ? undefined : cache.get(key);

    // guard: return cached value if found
    if (isNotUndefined(cachedValue))
      return asOutput(deserializeValue(cachedValue));

    // if not cached, grab the output from the logic
    const output: ReturnType<L> = logic(...args);

    // guard: bypass cache.set if requested
    if (bypass.set?.(...args)) return asOutput(output);

    // set the output to the cache
    const serializedOutput = serializeValue(output);
    cache.set(key, serializedOutput, { expiration });

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
  }) as WithMetaReturn<L, M>;
};
