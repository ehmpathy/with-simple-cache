import type { SimpleCache } from '@src/domain.objects/SimpleCache';

import { withSimpleCache } from './withSimpleCache';

/**
 * type tests for bypass callbacks type specificity
 *
 * verifies that bypass.get and bypass.set receive correctly typed args
 *
 * symmetric with withSimpleCacheAsync.bypass.type.test.ts per rule.require.wrapper-symmetry
 */
describe('withSimpleCache.bypass.types', () => {
  it('bypass.get receives Parameters<L> tuple', () => {
    const cache: SimpleCache<number> = {
      get: () => 42,
      set: () => {},
    };

    const wrapped = withSimpleCache(
      (
        input: { searchId: string },
        context: { forceRefresh: boolean },
      ): number => 42,
      {
        cache,
        bypass: {
          get: (args) => {
            // type proof: args is tuple [input, context]
            const input: { searchId: string } = args[0];
            const context: { forceRefresh: boolean } = args[1];

            // @ts-expect-error - args[0] is { searchId: string }, not { wrongProp: number }
            const wrongInput: { wrongProp: number } = args[0];

            // @ts-expect-error - args[1] is { forceRefresh: boolean }, not { wrongProp: string }
            const wrongContext: { wrongProp: string } = args[1];

            return context.forceRefresh;
          },
        },
      },
    );
  });

  it('bypass.set receives Parameters<L> tuple', () => {
    const cache: SimpleCache<number> = {
      get: () => 42,
      set: () => {},
    };

    const wrapped = withSimpleCache(
      (
        input: { searchId: string },
        context: { skipPersist: boolean },
      ): number => 42,
      {
        cache,
        bypass: {
          set: (args) => {
            // type proof: args is tuple [input, context]
            const input: { searchId: string } = args[0];
            const context: { skipPersist: boolean } = args[1];

            // @ts-expect-error - args[0] is { searchId: string }, not { wrongProp: number }
            const wrongInput: { wrongProp: number } = args[0];

            // @ts-expect-error - args[1] is { skipPersist: boolean }, not { wrongProp: string }
            const wrongContext: { wrongProp: string } = args[1];

            return context.skipPersist;
          },
        },
      },
    );
  });

  it('bypass callback args mismatch should TYPE ERROR', () => {
    const cache: SimpleCache<number> = {
      get: () => 42,
      set: () => {},
    };

    const wrapped = withSimpleCache(
      (input: { searchId: string }): number => 42,
      {
        cache,
        bypass: {
          get: (args) => {
            // @ts-expect-error - args[1] does not exist (only one arg)
            const wrong = args[1].someProperty;
            return false;
          },
        },
      },
    );
  });
});
