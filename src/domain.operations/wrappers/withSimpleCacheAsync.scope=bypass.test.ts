import type { SimpleCache } from '@src/domain.objects/SimpleCache';

import { withSimpleCacheAsync } from './withSimpleCacheAsync';

/**
 * type tests for bypass callbacks type specificity
 *
 * verifies that bypass.get and bypass.set receive correctly typed spread args
 *
 * symmetric with withSimpleCache.bypass.type.test.ts per rule.require.wrapper-symmetry
 */
describe('withSimpleCacheAsync.bypass.types', () => {
  it('bypass.get receives spread args (input, context)', () => {
    const cache: SimpleCache<number> = {
      get: async () => 42,
      set: async () => {},
    };

    const wrapped = withSimpleCacheAsync(
      async (
        input: { searchId: string },
        context: { forceRefresh: boolean },
      ): Promise<number> => 42,
      {
        cache,
        bypass: {
          get: (input, context) => {
            // type proof: input and context are correctly typed
            const searchId: string = input.searchId;
            const forceRefresh: boolean = context.forceRefresh;

            // @ts-expect-error - input is { searchId: string }, not { wrongProp: number }
            const wrongInput: { wrongProp: number } = input;

            // @ts-expect-error - context is { forceRefresh: boolean }, not { wrongProp: string }
            const wrongContext: { wrongProp: string } = context;

            return context.forceRefresh;
          },
        },
      },
    );
  });

  it('bypass.set receives spread args (input, context)', () => {
    const cache: SimpleCache<number> = {
      get: async () => 42,
      set: async () => {},
    };

    const wrapped = withSimpleCacheAsync(
      async (
        input: { searchId: string },
        context: { skipPersist: boolean },
      ): Promise<number> => 42,
      {
        cache,
        bypass: {
          set: (input, context) => {
            // type proof: input and context are correctly typed
            const searchId: string = input.searchId;
            const skipPersist: boolean = context.skipPersist;

            // @ts-expect-error - input is { searchId: string }, not { wrongProp: number }
            const wrongInput: { wrongProp: number } = input;

            // @ts-expect-error - context is { skipPersist: boolean }, not { wrongProp: string }
            const wrongContext: { wrongProp: string } = context;

            return context.skipPersist;
          },
        },
      },
    );
  });

  it('bypass callback with extra arg should TYPE ERROR', () => {
    const cache: SimpleCache<number> = {
      get: async () => 42,
      set: async () => {},
    };

    const wrapped = withSimpleCacheAsync(
      async (input: { searchId: string }): Promise<number> => 42,
      {
        cache,
        bypass: {
          // @ts-expect-error - callback accepts 2 args but wrapped function only has 1
          get: (input, context) => {
            return false;
          },
        },
      },
    );
  });
});
