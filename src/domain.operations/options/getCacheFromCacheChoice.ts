import { isAFunction } from 'type-fns';

import type { SimpleCache } from '@src/domain.objects/SimpleCache';
import { BadRequestError } from '@src/utils/errors/BadRequestError';

/**
 * a method which specifies how to extract a simple-cache from input args
 *
 * usage:
 * - cache: ({ fromInput }) => fromInput[1].cache
 * - cache: ({ fromInput }) => fromInput[0].options.cache
 *
 * note
 * - C generic captures the actual cache type (e.g., WithCacheUri)
 * - defaults to SimpleCache<any> for backwards compatibility
 * - inline functions now preserve return type for meta: 'include'
 */
export type SimpleCacheExtractionMethod<
  LI extends any[],
  C extends SimpleCache<any> = SimpleCache<any>,
> = (args: { fromInput: LI }) => C;

/**
 * how the cache can be specified for use with simple cache
 * - either directly as a cache instance
 * - or through an extraction method that grabs the cache from input args
 *
 * note
 * - C generic captures the actual cache type (e.g., WithCacheUri)
 * - inline extraction functions now work with meta: 'include'
 */
export type WithSimpleCacheChoice<
  LI extends any[],
  C extends SimpleCache<any> = SimpleCache<any>,
> = C | SimpleCacheExtractionMethod<LI, C>;

/**
 * how to extract the with simple cache choice
 */
export const getCacheFromCacheChoice = <LI extends any[]>({
  forInput,
  cacheOption,
}: {
  forInput: LI;
  cacheOption: WithSimpleCacheChoice<LI>;
}): SimpleCache<any> => {
  if (isAFunction(cacheOption)) {
    const foundCache = cacheOption({ fromInput: forInput });
    if (!foundCache)
      throw new BadRequestError(
        'could not extract cache from input with cache resolution method',
        { forInput },
      );
    return foundCache;
  }
  return cacheOption;
};
