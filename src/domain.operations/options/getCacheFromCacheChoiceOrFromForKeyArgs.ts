import { isAFunction } from 'type-fns';

import type { SimpleCache } from '@src/domain.objects/SimpleCache';
import {
  hasForInputProperty,
  type WithExtendableCacheTrigger,
} from '@src/domain.operations/wrappers/withExtendableCacheAsync';
import { BadRequestError } from '@src/utils/errors/BadRequestError';

import {
  getCacheFromCacheChoice,
  type WithSimpleCacheChoice,
} from './getCacheFromCacheChoice';

/**
 * a function which grabs the cache from arguments to `invalidate` or `update` commands,
 * supports both `forInput` and `forKey` invocation patterns
 */
export const getCacheFromCacheChoiceOrFromForKeyArgs = <
  /**
   * the logic we wrap with cache
   */
  L extends (...args: any) => any,
>({
  args,
  options,
  trigger,
}: {
  args:
    | { forKey: string; cache?: SimpleCache<any> }
    | { forInput: Parameters<L> };
  options: { cache: WithSimpleCacheChoice<Parameters<L>> };
  trigger: WithExtendableCacheTrigger;
}): SimpleCache<any> => {
  // if the args have the forInput property, then we can grab the cache like normal
  if (hasForInputProperty(args))
    return getCacheFromCacheChoice({
      forInput: args.forInput,
      cacheOption: options.cache,
    });

  // otherwise, if the cache was explicitly declared, then use it
  if (!isAFunction(options.cache)) return options.cache;

  // otherwise, we require the cache to have ben defined as an input to this method, when using invalidate by input, since we expect to grab the cache off of the input
  if (!args.cache)
    throw new BadRequestError(
      `could not find the cache to ${trigger.toLowerCase()} in. ${trigger.toLowerCase()} was called forKey but the cache for this method was defined as a function which retrieves the cache from the input. therefore, since there is no input accessible, the cache should have been explicitly passed in on ${trigger.toLowerCase()}`,
      { args },
    );
  return args.cache;
};
