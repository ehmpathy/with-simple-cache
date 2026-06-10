import type { IsoDuration } from 'iso-time';
import type { ProcedureInput } from 'procedure-fns';
import {
  asSerialJSON,
  deSerialJSON,
  type Serializable,
  type SerialJSON,
} from 'serde-fns';
import { castToSafeOnDiskCacheKey, createCache } from 'simple-on-disk-cache';

import { withSimpleCacheAsync } from './withSimpleCacheAsync';

/**
 * .what = a utility to make it easier to use on-disk cache
 * .why =
 *   - embeds best practices of how to serialize and deserialize
 */
export const withSimpleCacheOnDisk = <
  TInput extends Serializable,
  TContext,
  TResult extends Promise<any>,
>(
  logic: (input: TInput, context: TContext) => TResult,
  options: {
    procedure: {
      name: string;
      version: string | null;
    };
    expiration?: IsoDuration | null;
    directory: ProcedureInput<typeof createCache>['directory'];
  },
) => {
  return withSimpleCacheAsync(logic, {
    cache: createCache({
      directory: options.directory,
      expiration: options.expiration,
    }),
    serialize: {
      key: (input) =>
        castToSafeOnDiskCacheKey({
          procedure: options.procedure,
          execution: {
            input, // now we receive the input directly, context is excluded automatically
          },
        }),
      value: asSerialJSON,
    },
    deserialize: {
      value: (output) => deSerialJSON(output as SerialJSON),
    },
  });
};
