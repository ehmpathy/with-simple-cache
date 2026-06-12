import { isAFunction } from 'type-fns';

import type { SimpleCacheSync } from '@src/domain.objects/SimpleCache';
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
  type WithSimpleCacheOptions,
  withSimpleCache,
} from './withSimpleCache';

// re-export for backwards compatibility
export { hasForInputProperty, WithExtendableCacheTrigger };

/**
 * the shape of logic that was wrapped with extendable cache for a sync cache
 */
export interface LogicWithExtendableCache<
  /**
   * the logic we are adding cache for
   */
  L extends (...args: any) => any,
  /**
   * the type of cache being used
   */
  C extends SimpleCacheSync<any>,
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
  ) => void;

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
            | ReturnType<L>
            | ((args: {
                fromCachedOutput: ReturnType<L> | undefined;
              }) => ReturnType<L>);
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
            | ReturnType<L>
            | ((args: {
                fromCachedOutput: ReturnType<L> | undefined;
              }) => ReturnType<L>);

          /**
           * the cache to use, if the cache must be was defined from input parameters at runtime
           */
          cache?: C;
        },
  ) => void;
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
export const withExtendableCache = <
  /**
   * the logic we wrap with cache
   */
  L extends (...args: any) => any,
  /**
   * the cache type
   */
  C extends SimpleCacheSync<any>,
>(
  logic: L,
  options: WithSimpleCacheOptions<L, C>,
): LogicWithExtendableCache<L, C> => {
  const execute: LogicWithExtendableCache<L, C>['execute'] = withSimpleCache(
    logic,
    options,
  );

  const invalidate: LogicWithExtendableCache<L, C>['invalidate'] = (args) => {
    // define how to get the cache, with support for `forKey` input instead of full input
    const cache = getCacheFromCacheChoiceOrFromForKeyArgs({
      args,
      options,
      trigger: WithExtendableCacheTrigger.INVALIDATE,
    });

    // define the key, with support for `forKey` input instead of `forInput`
    const serializeKey =
      options.serialize?.key ?? defaultKeySerializationMethod;
    const key = hasForInputProperty(args)
      ? serializeKey(args.forInput[0], args.forInput[1])
      : args.forKey;

    // set undefined into the cache for this key, to invalidate the cached value
    cache.set(key, undefined);
  };

  const update: LogicWithExtendableCache<L, C>['update'] = (args) => {
    // define how to get the cache, with support for `forKey` input instead of full input
    const cache = getCacheFromCacheChoiceOrFromForKeyArgs({
      args,
      options,
      trigger: WithExtendableCacheTrigger.UPDATE,
    });

    // define the key, with support for `forKey` input instead of `forInput`
    const serializeKey =
      options.serialize?.key ?? defaultKeySerializationMethod;
    const key = hasForInputProperty(args)
      ? serializeKey(args.forInput[0], args.forInput[1])
      : args.forKey;

    // deserialize the cached value
    const cachedValue = cache.get(key);
    const deserializeValue =
      options.deserialize?.value ?? defaultValueDeserializationMethod;
    const deserializedCachedOutput =
      cachedValue !== undefined ? deserializeValue(cachedValue) : undefined;

    // compute the new value
    const newValue: ReturnType<L> = isAFunction(args.toValue)
      ? args.toValue({ fromCachedOutput: deserializedCachedOutput })
      : args.toValue;

    // define the serialized new value
    const serializeValue =
      options.serialize?.value ?? defaultValueSerializationMethod;
    const serializedNewValue = serializeValue(newValue);

    // set the new value for this key
    cache.set(key, serializedNewValue, {
      expiration: options.expiration,
    });
  };

  return { execute, invalidate, update };
};
