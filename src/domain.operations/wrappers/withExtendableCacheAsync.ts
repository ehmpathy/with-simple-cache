import { isAFunction } from 'type-fns';

import type { SimpleCache } from '@src/domain.objects/SimpleCache';
import { getCacheFromCacheChoiceOrFromForKeyArgs } from '@src/domain.operations/options/getCacheFromCacheChoiceOrFromForKeyArgs';
import {
  hasForInputProperty,
  WithExtendableCacheTrigger,
} from '@src/domain.operations/options/shared';
import {
  defaultKeySerializationMethod,
  defaultValueDeserializationMethod,
  defaultValueSerializationMethod,
} from '@src/domain.operations/serde/defaults';

import {
  getOutputCacheOptionFromCacheInput,
  type WithSimpleCacheAsyncOptions,
  withSimpleCacheAsync,
} from './withSimpleCacheAsync';

// re-export for backwards compatibility
export { hasForInputProperty, WithExtendableCacheTrigger };

/**
 * the shape of logic that was wrapped with extendable cache for an async cache
 */
export interface LogicWithExtendableCacheAsync<
  /**
   * the logic we are wrapping with cache
   */
  L extends (...args: any) => Promise<any>,
  /**
   * the type of cache being used
   */
  C extends SimpleCache<any>,
> {
  /**
   * execute the logic with cache
   */
  execute: L;

  /**
   * invalidate the cached value for a given input
   *
   * note
   * - applies key serialization on the key input, just like execute
   */
  invalidate: (
    args:
      | {
          /**
           * invalidate the cache for this input
           */
          forInput: Parameters<L>;
        }
      | {
          /**
           * invalidate the cache for this key
           */
          forKey: string;

          /**
           * the cache to use, if the cache must be was defined from input parameters at runtime
           */
          cache?: C;
        },
  ) => Promise<void>;

  /**
   * update the cached value for a given input
   *
   * note
   * - applies key serialization on the key input, just like execute
   * - applies value serialization on the value output, just like execute
   */
  update: (
    args:
      | {
          /**
           * update the cache for this input
           */
          forInput: Parameters<L>;

          /**
           * update the cache to this value
           */
          toValue:
            | Awaited<ReturnType<L>>
            | ((args: {
                fromCachedOutput: Awaited<ReturnType<L>> | undefined;
              }) => ReturnType<L> | Awaited<ReturnType<L>>);
        }
      | {
          /**
           * update the cache for this string
           */
          forKey: string;

          /**
           * update the cache to this value
           */
          toValue:
            | Awaited<ReturnType<L>>
            | ((args: {
                fromCachedOutput: Awaited<ReturnType<L>> | undefined;
              }) => ReturnType<L> | Awaited<ReturnType<L>>);

          /**
           * the cache to use, if the cache must be was defined from input parameters at runtime
           */
          cache?: C;
        },
  ) => Promise<void>;
}

/**
 * exposes the cache-wrapped method along with some primitives which enable extending the cache logic
 *
 * specifically
 * - exposes a way to `invalidate` the cache, for a given input (e.g., to support external triggers for invalidation)
 * - exposes a way to `update` the cache, for a given input (e.g., to support write-through cache and optimistic cache)
 *
 * relevance
 * - when wrapping logic to cache the user is able to specify several cache options (e.g., key serialization method, value serialization method, etc)
 * - in order to define their own `invalidation` and `update` methods, without this function, the user would need to access these cache options per function elsewhere
 * - this function makes it easy to utilize and extend cache invalidation + update commands for the wrapped logic, by managing the references to the cache options on behalf of the user
 */
export const withExtendableCacheAsync = <
  /**
   * the logic we are adding cache for
   */
  L extends (...args: any) => Promise<any>,
  /**
   * the cache type
   */
  C extends SimpleCache<any>,
>(
  logic: L,
  options: WithSimpleCacheAsyncOptions<L, C>,
): LogicWithExtendableCacheAsync<L, C> => {
  const execute: LogicWithExtendableCacheAsync<L, C>['execute'] =
    withSimpleCacheAsync(logic, options);

  const invalidate: LogicWithExtendableCacheAsync<L, C>['invalidate'] = async (
    args,
  ) => {
    // define how to get the cache, with support for `forKey` input instead of full input
    const cache = getCacheFromCacheChoiceOrFromForKeyArgs({
      args,
      options: { cache: getOutputCacheOptionFromCacheInput(options.cache) },
      trigger: WithExtendableCacheTrigger.INVALIDATE,
    });

    // define the key, with support for `forKey` input instead of `forInput`
    const serializeKey =
      options.serialize?.key ?? defaultKeySerializationMethod;
    const key = hasForInputProperty(args)
      ? serializeKey(args.forInput[0], args.forInput[1])
      : args.forKey;

    // set undefined into the cache for this key, to invalidate the cached value
    await cache.set(key, undefined);
  };

  const update: LogicWithExtendableCacheAsync<L, C>['update'] = async (
    args,
  ) => {
    // define how to get the cache, with support for `forKey` input instead of full input
    const cache = getCacheFromCacheChoiceOrFromForKeyArgs({
      args,
      options: { cache: getOutputCacheOptionFromCacheInput(options.cache) },
      trigger: WithExtendableCacheTrigger.UPDATE,
    });

    // define the key, with support for `forKey` input instead of `forInput`
    const serializeKey =
      options.serialize?.key ?? defaultKeySerializationMethod;
    const key = hasForInputProperty(args)
      ? serializeKey(args.forInput[0], args.forInput[1])
      : args.forKey;

    // deserialize the cached value
    const cachedValue = await cache.get(key);
    const deserializeValue =
      options.deserialize?.value ?? defaultValueDeserializationMethod;
    const deserializedCachedOutput =
      cachedValue !== undefined ? deserializeValue(cachedValue) : undefined;

    // compute the new value
    const newValue: Awaited<ReturnType<L>> = isAFunction(args.toValue)
      ? await args.toValue({ fromCachedOutput: deserializedCachedOutput })
      : await args.toValue;

    // define the serialized new value
    const serializeValue =
      options.serialize?.value ?? defaultValueSerializationMethod;
    const serializedNewValue = serializeValue(newValue);

    // set the new value for this key
    await cache.set(key, serializedNewValue, {
      expiration: options.expiration,
    });
  };

  return { execute, invalidate, update };
};
