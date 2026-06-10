import type { SimpleCache } from '@src/domain.objects/SimpleCache';

import { withSimpleCacheAsync } from './withSimpleCacheAsync';

/**
 * type tests for expiration option type
 *
 * verifies expiration accepts IsoDuration or null
 *
 * symmetric with withSimpleCache.expiration.type.test.ts per rule.require.wrapper-symmetry
 */
describe('withSimpleCacheAsync.expiration.types', () => {
  it('accepts IsoDuration with seconds', () => {
    const cache: SimpleCache<number> = {
      get: async () => 42,
      set: async () => {},
    };

    const wrapped = withSimpleCacheAsync(
      async (_input: { id: string }): Promise<number> => 42,
      {
        cache,
        expiration: { seconds: 60 },
      },
    );
  });

  it('accepts IsoDuration with minutes', () => {
    const cache: SimpleCache<number> = {
      get: async () => 42,
      set: async () => {},
    };

    const wrapped = withSimpleCacheAsync(
      async (_input: { id: string }): Promise<number> => 42,
      {
        cache,
        expiration: { minutes: 5 },
      },
    );
  });

  it('accepts IsoDuration with hours', () => {
    const cache: SimpleCache<number> = {
      get: async () => 42,
      set: async () => {},
    };

    const wrapped = withSimpleCacheAsync(
      async (_input: { id: string }): Promise<number> => 42,
      {
        cache,
        expiration: { hours: 1 },
      },
    );
  });

  it('accepts null for no expiration', () => {
    const cache: SimpleCache<number> = {
      get: async () => 42,
      set: async () => {},
    };

    const wrapped = withSimpleCacheAsync(
      async (_input: { id: string }): Promise<number> => 42,
      {
        cache,
        expiration: null,
      },
    );
  });
});
