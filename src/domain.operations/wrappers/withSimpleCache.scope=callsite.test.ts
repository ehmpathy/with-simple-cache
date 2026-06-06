import type {
  SimpleCache,
  WithCacheUri,
} from '@src/domain.objects/SimpleCache';

import { withSimpleCache } from './withSimpleCache';

/**
 * type tests for wrapped function call site type constraints
 *
 * verifies that call site enforces correct arg types and return types flow through
 *
 * symmetric with withSimpleCacheAsync.callsite.type.test.ts per rule.require.wrapper-symmetry
 */
describe('withSimpleCache.callsite.types', () => {
  interface Seaturtle {
    species: 'green' | 'hawksbill' | 'leatherback';
    name: string;
  }

  it('enforces input type at call site', () => {
    const cache: SimpleCache<number> = {
      get: () => 42,
      set: () => {},
    };

    const wrapped = withSimpleCache(
      (input: { searchId: string; limit: number }): number => 42,
      { cache },
    );

    // correct call
    wrapped({ searchId: 'abc', limit: 10 });

    // @ts-expect-error - limit must be number, not string
    wrapped({ searchId: 'abc', limit: '10' });
  });

  it('enforces context type at call site', () => {
    const cache: SimpleCache<number> = {
      get: () => 42,
      set: () => {},
    };

    const wrapped = withSimpleCache(
      (input: { searchId: string }, context: { tenantId: string }): number =>
        42,
      { cache },
    );

    // correct call
    wrapped({ searchId: 'abc' }, { tenantId: 'tenant-1' });

    // @ts-expect-error - tenantId must be string, not number
    wrapped({ searchId: 'abc' }, { tenantId: 123 });
  });

  it('requires all args when function has multiple params', () => {
    const cache: SimpleCache<number> = {
      get: () => 42,
      set: () => {},
    };

    const wrapped = withSimpleCache(
      (input: { searchId: string }, context: { tenantId: string }): number =>
        42,
      { cache },
    );

    // @ts-expect-error - context is required
    wrapped({ searchId: 'abc' });
  });

  it('return type flows through', () => {
    const cache: SimpleCache<Seaturtle> = {
      get: () => ({ species: 'green', name: 'shelly' }),
      set: () => {},
    };

    const wrapped = withSimpleCache(
      (_input: { id: string }): Seaturtle => ({
        species: 'green',
        name: 'shelly',
      }),
      { cache },
    );

    const result = wrapped({ id: 'test' });

    // type proof: result is Seaturtle
    const species: 'green' | 'hawksbill' | 'leatherback' = result.species;
    const name: string = result.name;

    // @ts-expect-error - result is Seaturtle, not number
    const wrong: number = result;
  });

  it('return type with meta: include is wrapped', () => {
    const cache: WithCacheUri<SimpleCache<Seaturtle>> = {
      get: () => ({ species: 'green', name: 'shelly' }),
      set: () => {},
      uri: () => 's3://bucket/key',
    };

    const wrapped = withSimpleCache(
      (_input: { id: string }): Seaturtle => ({
        species: 'green',
        name: 'shelly',
      }),
      { cache, meta: 'include' },
    );

    const result = wrapped({ id: 'test' });

    // type proof: result.output is Seaturtle
    const species: 'green' | 'hawksbill' | 'leatherback' =
      result.output.species;
    const name: string = result.output.name;

    // type proof: result.cached.uri is string
    const uri: string = result.cached.uri;

    // @ts-expect-error - result is wrapped, not direct Seaturtle
    const wrong: Seaturtle = result;
  });

});
