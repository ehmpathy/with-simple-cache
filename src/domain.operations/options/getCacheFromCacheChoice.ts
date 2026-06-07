import { isAFunction } from 'type-fns';

import type { SimpleCache } from '@src/domain.objects/SimpleCache';
import { BadRequestError } from '@src/utils/errors/BadRequestError';

/**
 * a method which specifies how to extract a simple-cache from input args
 *
 * usage:
 * - cache: (_input, context) => context.cache
 * - cache: (input) => input.options.cache
 *
 * note
 * - C generic captures the actual cache type (e.g., WithCacheUri)
 * - no default value to enable better type inference
 * - inline functions preserve return type for meta: 'include'
 */
export type SimpleCacheExtractionMethod<
  LI extends any[],
  C extends SimpleCache<any>,
> = (...args: LI) => C;

/**
 * how the cache can be specified for use with simple cache
 * - either directly as a cache instance
 * - or through an extraction method that grabs the cache from input args
 *
 * note
 * - C generic captures the actual cache type (e.g., WithCacheUri)
 * - inline extraction functions work with meta: 'include'
 */
export type WithSimpleCacheChoice<
  LI extends any[],
  C extends SimpleCache<any>,
> = C | SimpleCacheExtractionMethod<LI, C>;

/**
 * how to extract the with simple cache choice
 */
export const getCacheFromCacheChoice = <
  LI extends any[],
  C extends SimpleCache<any>,
>({
  forInput,
  cacheOption,
}: {
  forInput: LI;
  cacheOption: WithSimpleCacheChoice<LI, C>;
}): C => {
  // handle extraction function: call it with input args to get cache
  if (isAFunction(cacheOption)) {
    const foundCache = cacheOption(...forInput);

    // guard: extraction function must return a valid cache
    if (!foundCache)
      throw new BadRequestError(
        'cache extraction function returned falsy value. ensure the extraction function returns a valid cache, or pass the cache directly instead of an extraction function',
        { forInput },
      );

    return foundCache;
  }

  // otherwise, cache was passed directly
  return cacheOption;
};
