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
  options: { cache: WithSimpleCacheChoice<Parameters<L>, SimpleCache<any>> };
  trigger: WithExtendableCacheTrigger;
}): SimpleCache<any> => {
  // guard: if args have forInput, extract cache from input as normal
  if (hasForInputProperty(args))
    return getCacheFromCacheChoice({
      forInput: args.forInput,
      cacheOption: options.cache,
    });

  // guard: if cache was passed directly (not extraction function), use it
  if (!isAFunction(options.cache)) return options.cache;

  // guard: forKey with extraction function requires explicit cache arg
  if (!args.cache)
    throw new BadRequestError(
      `${trigger.toLowerCase()} forKey requires cache arg when cache option is extraction function. pass { forKey, cache } or use forInput instead`,
      { args },
    );

  return args.cache;
};
