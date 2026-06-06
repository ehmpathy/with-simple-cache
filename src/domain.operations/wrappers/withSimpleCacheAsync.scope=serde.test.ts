import type {
  SimpleCache,
  WithCacheUri,
} from '@src/domain.objects/SimpleCache';

import { withSimpleCacheAsync } from './withSimpleCacheAsync';

/**
 * type tests for serialize/deserialize type specificity
 *
 * verifies that cache type flows through to serialize/deserialize callbacks
 *
 * symmetric with withSimpleCache.serde.type.test.ts per rule.require.wrapper-symmetry
 */
describe('withSimpleCacheAsync.serde.types', () => {
  interface Seaturtle {
    species: 'green' | 'hawksbill' | 'leatherback';
    name: string;
  }

  it('serialize.value receives Awaited<ReturnType<L>>, not cache type', () => {
    const seaturtleCache: SimpleCache<Seaturtle> = {
      get: async () => ({ species: 'green', name: 'shelly' }),
      set: async () => {},
    };

    // function returns number, cache stores Seaturtle
    const wrapped = withSimpleCacheAsync(
      async (_input: { id: string }): Promise<number> => 42,
      {
        cache: seaturtleCache,
        serialize: {
          value: (output): Seaturtle => {
            // type proof: output is number (Awaited<ReturnType<L>>), not Seaturtle
            const num: number = output;
            expect(num).toBe(42);
            return { species: 'green', name: String(output) };
          },
        },
      },
    );
  });

  it('deserialize.value receives cache type, returns Awaited<ReturnType<L>>', () => {
    const seaturtleCache: SimpleCache<Seaturtle> = {
      get: async () => ({ species: 'green', name: 'shelly' }),
      set: async () => {},
    };

    const wrapped = withSimpleCacheAsync(
      async (_input: { id: string }): Promise<number> => 42,
      {
        cache: seaturtleCache,
        deserialize: {
          value: (cached): number => {
            // type proof: cached is Seaturtle (cache type)
            const turtle: Seaturtle = cached;
            expect(turtle.species).toBe('green');
            // type proof: must return number (Awaited<ReturnType<L>>)
            return turtle.name.length;
          },
        },
      },
    );
  });

  it('serialize.key receives input args', () => {
    const cache: SimpleCache<string> = {
      get: async () => 'cached',
      set: async () => {},
    };

    const wrapped = withSimpleCacheAsync(
      async (
        input: { searchId: string },
        context: { tenantId: string },
      ): Promise<string> => 'result',
      {
        cache,
        serialize: {
          key: (input, context) => {
            // type proof: input has searchId
            const id: string = input.searchId;
            // type proof: context has tenantId
            const tenant: string = context.tenantId;
            return `${tenant}:${id}`;
          },
        },
      },
    );
  });

  it('cache type mismatch in serialize.value should TYPE ERROR', () => {
    const stringCache: SimpleCache<string> = {
      get: async () => 'cached',
      set: async () => {},
    };

    const wrapped = withSimpleCacheAsync(
      async (_input: { id: string }): Promise<number> => 42,
      {
        cache: stringCache,
        serialize: {
          value: (output): string => {
            // @ts-expect-error - output is number, not string
            const wrong: string = output;
            return String(output);
          },
        },
      },
    );
  });

  it('cache type mismatch in deserialize.value should TYPE ERROR', () => {
    const stringCache: SimpleCache<string> = {
      get: async () => 'cached',
      set: async () => {},
    };

    const wrapped = withSimpleCacheAsync(
      async (_input: { id: string }): Promise<number> => 42,
      {
        cache: stringCache,
        deserialize: {
          value: (cached): number => {
            // @ts-expect-error - cached is string, not number
            const wrong: number = cached;
            return Number(cached);
          },
        },
      },
    );
  });

  describe('runtime behavior', () => {
    it('should preserve SimpleCache<string> type through serialize/deserialize', async () => {
      const store: Record<string, string> = {};
      const stringCache = {
        get: async (key: string): Promise<string | undefined> => store[key],
        set: async (key: string, value: string) => {
          // runtime proof: value must be string
          if (typeof value !== 'string') {
            throw new Error(`expected string, got ${typeof value}`);
          }
          store[key] = value;
        },
      };

      const callApi = withSimpleCacheAsync(
        async (input: { id: string }): Promise<string> => `result-${input.id}`,
        {
          cache: stringCache,
          serialize: {
            // serialize.value receives ReturnType<L> = string
            value: (output): string => {
              // runtime proof: output is string
              expect(typeof output).toBe('string');
              return output.toUpperCase();
            },
          },
          deserialize: {
            // deserialize.value receives cache value type = string
            value: (cached): string => {
              // runtime proof: cached is string
              expect(typeof cached).toBe('string');
              return cached.toLowerCase();
            },
          },
        },
      );

      // cache miss: serialize runs
      const result1 = await callApi({ id: 'abc' });
      expect(result1).toBe('result-abc'); // deserialized from 'RESULT-ABC'

      // cache hit: deserialize runs
      const result2 = await callApi({ id: 'abc' });
      expect(result2).toBe('result-abc');

      // verify cache stored uppercase
      expect(store['{"id":"abc"}']).toBe('RESULT-ABC');
    });

    it('should preserve SimpleCache<Seaturtle> type through serialize/deserialize', async () => {
      interface Seaturtle {
        species: 'green' | 'hawksbill' | 'leatherback';
        name: string;
      }

      const store: Record<string, Seaturtle> = {};
      const seaturtleCache = {
        get: async (key: string): Promise<Seaturtle | undefined> => store[key],
        set: async (key: string, value: Seaturtle) => {
          // runtime proof: value must have valid species
          if (!['green', 'hawksbill', 'leatherback'].includes(value.species)) {
            throw new Error('expected valid seaturtle species');
          }
          store[key] = value;
        },
      };

      const callApi = withSimpleCacheAsync(
        async (input: { name: string }): Promise<Seaturtle> => ({
          species: 'green',
          name: input.name,
        }),
        {
          cache: seaturtleCache,
          serialize: {
            // serialize.value receives ReturnType<L> = Seaturtle
            value: (output): Seaturtle => {
              // runtime proof: output has species property
              expect(output.species).toBe('green');
              return { ...output, name: output.name.toUpperCase() };
            },
          },
          deserialize: {
            // deserialize.value receives cache value type = Seaturtle
            value: (cached): Seaturtle => {
              // runtime proof: cached has species property
              expect(cached.species).toBe('green');
              return { ...cached, name: cached.name.toLowerCase() };
            },
          },
        },
      );

      // cache miss
      const result1 = await callApi({ name: 'shelly' });
      expect(result1).toEqual({ species: 'green', name: 'shelly' });

      // cache hit
      const result2 = await callApi({ name: 'shelly' });
      expect(result2).toEqual({ species: 'green', name: 'shelly' });

      // verify cache stored uppercase name
      expect(store['{"name":"shelly"}']).toEqual({
        species: 'green',
        name: 'SHELLY',
      });
    });

    it('should preserve wrapped function return type independent of cache type', async () => {
      // cache stores strings (JSON)
      const store: Record<string, string> = {};
      const stringCache = {
        get: async (key: string): Promise<string | undefined> => store[key],
        set: async (key: string, value: string) => {
          store[key] = value;
        },
      };

      // function returns complex object
      interface UserResult {
        id: number;
        name: string;
        active: boolean;
      }

      const callApi = withSimpleCacheAsync(
        async (input: { userId: number }): Promise<UserResult> => ({
          id: input.userId,
          name: 'alice',
          active: true,
        }),
        {
          cache: stringCache,
          serialize: {
            value: (output): string => JSON.stringify(output),
          },
          deserialize: {
            value: (cached): UserResult => JSON.parse(cached),
          },
        },
      );

      const result = await callApi({ userId: 123 });

      // runtime proof: result is UserResult, not string
      expect(result.id).toBe(123);
      expect(result.name).toBe('alice');
      expect(result.active).toBe(true);
      expect(typeof result).toBe('object');
    });

    it('should preserve cache type specificity with meta: include', async () => {
      interface Metrics {
        count: number;
        timestamp: string;
      }

      const store: Record<string, Metrics> = {};
      const metricsCache: WithCacheUri<SimpleCache<Metrics>> = {
        get: async (key: string): Promise<Metrics | undefined> => store[key],
        set: async (key: string, value: Metrics | undefined) => {
          if (!value) return;
          // runtime proof: value is Metrics shape
          expect(typeof value.count).toBe('number');
          expect(typeof value.timestamp).toBe('string');
          store[key] = value;
        },
        uri: (key: string) => `s3://metrics/${key}`,
      };

      const callApi = withSimpleCacheAsync(
        async (input: { id: string }): Promise<Metrics> => ({
          count: 42,
          timestamp: '2024-01-01',
        }),
        {
          cache: metricsCache,
          meta: 'include',
          serialize: {
            value: (output): Metrics => {
              // runtime proof: output is Metrics
              expect(typeof output.count).toBe('number');
              return output;
            },
          },
        },
      );

      const result = await callApi({ id: 'test' });

      // runtime proof: result has correct shape
      expect(result.output.count).toBe(42);
      expect(result.output.timestamp).toBe('2024-01-01');
      expect(result.cached.uri).toContain('s3://metrics/');
    });
  });
});
