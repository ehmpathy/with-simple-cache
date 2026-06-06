import type {
  SimpleCache,
  WithCacheUri,
} from '@src/domain.objects/SimpleCache';

import { withSimpleCacheAsync } from './withSimpleCacheAsync';

/**
 * type tests for wrapped function call site type constraints
 *
 * verifies that call site enforces correct arg types and return types flow through
 *
 * symmetric with withSimpleCache.callsite.type.test.ts per rule.require.wrapper-symmetry
 */
describe('withSimpleCacheAsync.callsite.types', () => {
  interface Seaturtle {
    species: 'green' | 'hawksbill' | 'leatherback';
    name: string;
  }

  it('enforces input type at call site', async () => {
    const cache: SimpleCache<number> = {
      get: async () => 42,
      set: async () => {},
    };

    const wrapped = withSimpleCacheAsync(
      async (input: { searchId: string; limit: number }): Promise<number> => 42,
      { cache },
    );

    // correct call
    await wrapped({ searchId: 'abc', limit: 10 });

    // @ts-expect-error - limit must be number, not string
    await wrapped({ searchId: 'abc', limit: '10' });
  });

  it('enforces context type at call site', async () => {
    const cache: SimpleCache<number> = {
      get: async () => 42,
      set: async () => {},
    };

    const wrapped = withSimpleCacheAsync(
      async (
        input: { searchId: string },
        context: { tenantId: string },
      ): Promise<number> => 42,
      { cache },
    );

    // correct call
    await wrapped({ searchId: 'abc' }, { tenantId: 'tenant-1' });

    // @ts-expect-error - tenantId must be string, not number
    await wrapped({ searchId: 'abc' }, { tenantId: 123 });
  });

  it('requires all args when function has multiple params', async () => {
    const cache: SimpleCache<number> = {
      get: async () => 42,
      set: async () => {},
    };

    const wrapped = withSimpleCacheAsync(
      async (
        input: { searchId: string },
        context: { tenantId: string },
      ): Promise<number> => 42,
      { cache },
    );

    // @ts-expect-error - context is required
    await wrapped({ searchId: 'abc' });
  });

  it('return type unwraps Promise and flows through', async () => {
    const cache: SimpleCache<Seaturtle> = {
      get: async () => ({ species: 'green', name: 'shelly' }),
      set: async () => {},
    };

    const wrapped = withSimpleCacheAsync(
      async (_input: { id: string }): Promise<Seaturtle> => ({
        species: 'green',
        name: 'shelly',
      }),
      { cache },
    );

    const result = await wrapped({ id: 'test' });

    // type proof: result is Seaturtle (unwrapped from Promise)
    const species: 'green' | 'hawksbill' | 'leatherback' = result.species;
    const name: string = result.name;

    // @ts-expect-error - result is Seaturtle, not number
    const wrong: number = result;
  });

  it('return type with meta: include is wrapped', async () => {
    const cache: WithCacheUri<SimpleCache<Seaturtle>> = {
      get: async () => ({ species: 'green', name: 'shelly' }),
      set: async () => {},
      uri: () => 's3://bucket/key',
    };

    const wrapped = withSimpleCacheAsync(
      async (_input: { id: string }): Promise<Seaturtle> => ({
        species: 'green',
        name: 'shelly',
      }),
      { cache, meta: 'include' },
    );

    const result = await wrapped({ id: 'test' });

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
