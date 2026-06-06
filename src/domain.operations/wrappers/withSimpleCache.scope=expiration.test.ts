import type { SimpleCache } from '@src/domain.objects/SimpleCache';

import { withSimpleCache } from './withSimpleCache';

/**
 * type tests for expiration option type
 *
 * verifies expiration accepts UniDuration or null
 *
 * symmetric with withSimpleCacheAsync.expiration.type.test.ts per rule.require.wrapper-symmetry
 */
describe('withSimpleCache.expiration.types', () => {
  it('accepts UniDuration with seconds', () => {
    const cache: SimpleCache<number> = {
      get: () => 42,
      set: () => {},
    };

    const wrapped = withSimpleCache((_input: { id: string }): number => 42, {
      cache,
      expiration: { seconds: 60 },
    });
  });

  it('accepts UniDuration with minutes', () => {
    const cache: SimpleCache<number> = {
      get: () => 42,
      set: () => {},
    };

    const wrapped = withSimpleCache((_input: { id: string }): number => 42, {
      cache,
      expiration: { minutes: 5 },
    });
  });

  it('accepts UniDuration with hours', () => {
    const cache: SimpleCache<number> = {
      get: () => 42,
      set: () => {},
    };

    const wrapped = withSimpleCache((_input: { id: string }): number => 42, {
      cache,
      expiration: { hours: 1 },
    });
  });

  it('accepts null for no expiration', () => {
    const cache: SimpleCache<number> = {
      get: () => 42,
      set: () => {},
    };

    const wrapped = withSimpleCache((_input: { id: string }): number => 42, {
      cache,
      expiration: null,
    });
  });
});
