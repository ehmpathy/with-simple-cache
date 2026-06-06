import {
  createExampleAsyncCacheWithoutUri,
  createExampleAsyncCacheWithUri,
} from '@src/.test.assets/createExampleCache';
import type {
  SimpleCache,
  WithCacheUri,
} from '@src/domain.objects/SimpleCache';
import { BadRequestError } from '@src/utils/errors/BadRequestError';

import { withSimpleCacheAsync } from './withSimpleCacheAsync';

/**
 * type tests for the meta option conditional return type (async wrapper)
 *
 * these tests use @ts-expect-error to prove the type system catches errors
 * when the conditional types are violated
 *
 * CRITICAL: these type tests are the PRIMARY verification that the feature works.
 * runtime tests verify behavior. type tests verify the CONTRACT.
 * if these tests compile, the type system enforces correctness at definition time.
 *
 * symmetric with withSimpleCache.meta.type.test.ts per rule.require.wrapper-symmetry
 */
describe('withSimpleCacheAsync.meta.types', () => {
  describe('static cache (direct instance)', () => {
    describe('cache WITH uri method', () => {
      /**
       * cache that has uri method (async)
       */
      const createCacheWithUri = (): WithCacheUri<SimpleCache<number>> => ({
        get: async () => 42,
        set: async () => {},
        uri: () => 's3://bucket/key',
      });

      it('meta: include should return { output, cached } structure', async () => {
        const cache = createCacheWithUri();
        const wrapped = withSimpleCacheAsync(async () => 42, {
          cache,
          meta: 'include',
        });

        const result = await wrapped();

        // type proof: result has output property
        const output: number = result.output;
        expect(output).toEqual(42);

        // type proof: result has cached.uri property
        const uri: string = result.cached.uri;
        expect(uri).toContain('s3://');

        // @ts-expect-error - result is not a number, it's { output, cached }
        const wrongType: number = result;
      });

      it('meta: exclude should return direct value', async () => {
        const cache = createCacheWithUri();
        const wrapped = withSimpleCacheAsync(async () => 42, {
          cache,
          meta: 'exclude',
        });

        const result = await wrapped();

        // type proof: result is directly the number
        const output: number = result;
        expect(output).toEqual(42);

        // @ts-expect-error - result has no output property, it's the direct value
        const wrongAccess = result.output;
      });

      it('meta absent should return direct value (backwards compat)', async () => {
        const cache = createCacheWithUri();
        const wrapped = withSimpleCacheAsync(async () => 42, {
          cache,
          // no meta option
        });

        const result = await wrapped();

        // type proof: result is directly the number
        const output: number = result;
        expect(output).toEqual(42);

        // @ts-expect-error - result has no output property, it's the direct value
        const wrongAccess = result.output;
      });
    });

    describe('cache WITHOUT uri method', () => {
      /**
       * cache that lacks uri method
       */
      const createCacheWithoutUri = (): SimpleCache<number> => ({
        get: async () => 42,
        set: async () => {},
        // no uri method
      });

      it('meta: include should be a TYPE ERROR at compile time', () => {
        const cache = createCacheWithoutUri();

        const wrapped = withSimpleCacheAsync(async () => 42, {
          cache,
          // @ts-expect-error - meta: 'include' not allowed without uri method
          meta: 'include',
        });
      });

      it('meta: exclude should work fine', async () => {
        const cache = createCacheWithoutUri();
        const wrapped = withSimpleCacheAsync(async () => 42, {
          cache,
          meta: 'exclude',
        });

        const result = await wrapped();

        // type proof: result is directly the number
        const output: number = result;
        expect(output).toEqual(42);
      });

      it('meta absent should work fine', async () => {
        const cache = createCacheWithoutUri();
        const wrapped = withSimpleCacheAsync(async () => 42, {
          cache,
          // no meta option
        });

        const result = await wrapped();

        // type proof: result is directly the number
        const output: number = result;
        expect(output).toEqual(42);
      });
    });

    describe('null and undefined outputs', () => {
      const createCacheWithUri = <T>(
        defaultValue: T,
      ): WithCacheUri<SimpleCache<T>> => ({
        get: async () => defaultValue,
        set: async () => {},
        uri: () => 's3://bucket/key',
      });

      it('null output should preserve type with meta: include', async () => {
        const cache = createCacheWithUri<null>(null);
        const wrapped = withSimpleCacheAsync(async (): Promise<null> => null, {
          cache,
          meta: 'include',
        });

        const result = await wrapped();

        // type proof: output is null, not undefined
        const output: null = result.output;
        expect(output).toBeNull();
      });

      it('undefined output should preserve type with meta: include', async () => {
        const cache = createCacheWithUri<undefined>(undefined);
        const wrapped = withSimpleCacheAsync(
          async (): Promise<undefined> => undefined,
          {
            cache,
            meta: 'include',
          },
        );

        const result = await wrapped();

        // type proof: output is undefined
        const output: undefined = result.output;
        expect(result.output).toBeUndefined();
      });
    });
  });

  /**
   * CRITICAL: dynamic cache extraction with meta: 'include'
   *
   * this is the PRIMARY use case from the wish:
   * - cache comes from context (injected by caller)
   * - cache type must be constrained at wrapper DEFINITION time
   * - meta: 'include' requires cache with uri method
   *
   * the type system must enforce that the extraction function returns
   * WithCacheUri<SimpleCache<T>> when meta: 'include' is used.
   */
  describe('dynamic cache extraction via ({ fromInput }) => cache', () => {
    it('meta: include should compile when cache option is typed as WithCacheUri', async () => {
      // explicitly type the cache option to prove type flows through
      const cacheOption: WithCacheUri<SimpleCache<string>> = {
        get: async () => 'cached',
        set: async () => {},
        uri: () => 's3://bucket/key',
      };

      const wrapped = withSimpleCacheAsync(
        async (_input: { query: string }): Promise<string> => 'result',
        {
          cache: cacheOption,
          meta: 'include',
        },
      );

      const result = await wrapped({ query: 'test' });

      // type proof: result has output and cached.uri
      const output: string = result.output;
      const uri: string = result.cached.uri;
      expect(output).toBeDefined();
      expect(uri).toBeDefined();
    });

    it('meta: include should TYPE ERROR when cache option lacks uri', () => {
      // explicitly type the cache option WITHOUT uri
      const cacheOption: SimpleCache<string> = {
        get: async () => 'cached',
        set: async () => {},
      };

      const wrapped = withSimpleCacheAsync(
        async (_input: { query: string }): Promise<string> => 'result',
        {
          cache: cacheOption,
          // @ts-expect-error - meta: 'include' not allowed because cache lacks uri
          meta: 'include',
        },
      );
    });

    describe('positive: inline extraction works', () => {
      it('inline extraction with meta: include', async () => {
        const wrapped = withSimpleCacheAsync(
          async (
            _input: { query: string },
            _context: { cache: WithCacheUri<SimpleCache<string>> },
          ): Promise<string> => 'result',
          {
            cache: ({
              fromInput,
            }: {
              fromInput: [
                { query: string },
                { cache: WithCacheUri<SimpleCache<string>> },
              ];
            }) => fromInput[1].cache,
            meta: 'include',
          },
        );

        const result = await wrapped(
          { query: 'test' },
          {
            cache: {
              get: async () => 'cached',
              set: async () => {},
              uri: () => 's3://bucket/key',
            },
          },
        );

        // type proof: result has output and cached.uri
        const output: string = result.output;
        const uri: string = result.cached.uri;
        expect(output).toBeDefined();
        expect(uri).toBeDefined();
      });

      it('inline extraction with meta: exclude', async () => {
        const wrapped = withSimpleCacheAsync(
          async (
            _input: { query: string },
            _context: { cache: WithCacheUri<SimpleCache<string>> },
          ): Promise<string> => 'result',
          {
            cache: ({
              fromInput,
            }: {
              fromInput: [
                { query: string },
                { cache: WithCacheUri<SimpleCache<string>> },
              ];
            }) => fromInput[1].cache,
            meta: 'exclude',
          },
        );

        const result = await wrapped(
          { query: 'test' },
          {
            cache: {
              get: async () => 'cached',
              set: async () => {},
              uri: () => 's3://bucket/key',
            },
          },
        );

        // type proof: result is direct value
        const direct: string = result;
        expect(direct).toBeDefined();
      });

      it('inline extraction without meta (backwards compat)', async () => {
        const wrapped = withSimpleCacheAsync(
          async (
            _input: { query: string },
            _context: { cache: SimpleCache<string> },
          ): Promise<string> => 'result',
          {
            cache: ({
              fromInput,
            }: {
              fromInput: [{ query: string }, { cache: SimpleCache<string> }];
            }) => fromInput[1].cache,
          },
        );

        const result = await wrapped(
          { query: 'test' },
          { cache: { get: async () => 'cached', set: async () => {} } },
        );

        // type proof: result is direct value
        const direct: string = result;
        expect(direct).toBeDefined();
      });

      it('inline extraction from first arg (input.cache)', async () => {
        const wrapped = withSimpleCacheAsync(
          async (_input: {
            query: string;
            cache: WithCacheUri<SimpleCache<string>>;
          }): Promise<string> => 'result',
          {
            cache: ({
              fromInput,
            }: {
              fromInput: [
                { query: string; cache: WithCacheUri<SimpleCache<string>> },
              ];
            }) => fromInput[0].cache,
            meta: 'include',
          },
        );

        const result = await wrapped({
          query: 'test',
          cache: {
            get: async () => 'cached',
            set: async () => {},
            uri: () => 's3://bucket/key',
          },
        });

        // type proof: result has output and cached.uri
        const output: string = result.output;
        const uri: string = result.cached.uri;
        expect(output).toBeDefined();
        expect(uri).toBeDefined();
      });

      it('inline extraction from nested path (context.services.cache)', async () => {
        const wrapped = withSimpleCacheAsync(
          async (
            _input: { query: string },
            _context: {
              services: { cache: WithCacheUri<SimpleCache<string>> };
            },
          ): Promise<string> => 'result',
          {
            cache: ({
              fromInput,
            }: {
              fromInput: [
                { query: string },
                { services: { cache: WithCacheUri<SimpleCache<string>> } },
              ];
            }) => fromInput[1].services.cache,
            meta: 'include',
          },
        );

        const result = await wrapped(
          { query: 'test' },
          {
            services: {
              cache: {
                get: async () => 'cached',
                set: async () => {},
                uri: () => 'redis://host/key',
              },
            },
          },
        );

        // type proof: result has output and cached.uri
        const output: string = result.output;
        const uri: string = result.cached.uri;
        expect(output).toBeDefined();
        expect(uri).toBeDefined();
      });

      it('inline extraction with three-arg function', async () => {
        const wrapped = withSimpleCacheAsync(
          async (
            _input: { query: string },
            _context: { tenantId: string },
            _options: { cache: WithCacheUri<SimpleCache<string>> },
          ): Promise<string> => 'result',
          {
            cache: ({
              fromInput,
            }: {
              fromInput: [
                { query: string },
                { tenantId: string },
                { cache: WithCacheUri<SimpleCache<string>> },
              ];
            }) => fromInput[2].cache,
            meta: 'include',
          },
        );

        const result = await wrapped(
          { query: 'test' },
          { tenantId: 'tenant-1' },
          {
            cache: {
              get: async () => 'cached',
              set: async () => {},
              uri: () => 'gs://bucket/key',
            },
          },
        );

        // type proof: result has output and cached.uri
        const output: string = result.output;
        const uri: string = result.cached.uri;
        expect(output).toBeDefined();
        expect(uri).toBeDefined();
      });
    });

    describe('negative: inline extraction type errors', () => {
      it('rejects meta: include when extracted cache lacks uri', () => {
        const wrapped = withSimpleCacheAsync(
          async (
            _input: { query: string },
            _context: { cache: SimpleCache<string> },
          ): Promise<string> => 'result',
          {
            cache: ({
              fromInput,
            }: {
              fromInput: [{ query: string }, { cache: SimpleCache<string> }];
            }) => fromInput[1].cache,
            // @ts-expect-error - meta: 'include' not allowed because cache lacks uri
            meta: 'include',
          },
        );
      });

      it('rejects wrong fromInput tuple type', () => {
        const wrapped = withSimpleCacheAsync(
          async (
            _input: { query: string },
            _context: { cache: WithCacheUri<SimpleCache<string>> },
          ): Promise<string> => 'result',
          {
            // @ts-expect-error - fromInput[0] declares wrongProp but logic expects query
            cache: ({
              fromInput,
            }: {
              fromInput: [
                { wrongProp: number },
                { cache: WithCacheUri<SimpleCache<string>> },
              ];
            }) => fromInput[1].cache,
          },
        );
      });

      it('rejects access to non-existent arg index', () => {
        const wrapped = withSimpleCacheAsync(
          async (_input: { query: string }): Promise<string> => 'result',
          {
            cache: ({ fromInput }: { fromInput: [{ query: string }] }) => {
              // @ts-expect-error - fromInput[1] does not exist (only one arg)
              return fromInput[1].cache;
            },
          },
        );
      });

      it('rejects extraction that returns wrong type', () => {
        const wrapped = withSimpleCacheAsync(
          async (
            _input: { query: string },
            _context: { notACache: string },
          ): Promise<string> => 'result',
          {
            // @ts-expect-error - extraction returns string, not SimpleCache
            cache: ({
              fromInput,
            }: {
              fromInput: [{ query: string }, { notACache: string }];
            }) => fromInput[1].notACache,
          },
        );
      });
    });
  });

  /**
   * runtime behavior tests for meta option
   *
   * these tests verify actual runtime behavior (cache hits, misses, errors)
   * type tests above verify compile-time contract enforcement
   */
  describe('runtime behavior', () => {
    describe('cache WITH uri method', () => {
      it('should return { output, cached } when meta: include', async () => {
        const { cache } = createExampleAsyncCacheWithUri<number>(
          's3://test-bucket/prefix',
        );
        const callApi = withSimpleCacheAsync(
          async (input: { id: string }) => {
            return 42;
          },
          { cache, meta: 'include' },
        );

        const result = await callApi({ id: 'test-123' });

        expect(result).toMatchSnapshot();
        expect(result).toEqual({
          output: 42,
          cached: { uri: 's3://test-bucket/prefix/{"id":"test-123"}' },
        });
      });

      it('should return direct value when meta: exclude', async () => {
        const { cache } = createExampleAsyncCacheWithUri<number>(
          's3://test-bucket/prefix',
        );
        const callApi = withSimpleCacheAsync(
          async (input: { id: string }) => {
            return 42;
          },
          { cache, meta: 'exclude' },
        );

        const result = await callApi({ id: 'test-123' });

        expect(result).toMatchSnapshot();
        expect(result).toEqual(42);
      });

      it('should return direct value when meta is absent (backwards compat)', async () => {
        const { cache } = createExampleAsyncCacheWithUri<number>(
          's3://test-bucket/prefix',
        );
        const callApi = withSimpleCacheAsync(
          async (input: { id: string }) => {
            return 42;
          },
          { cache },
        );

        const result = await callApi({ id: 'test-123' });

        expect(result).toMatchSnapshot();
        expect(result).toEqual(42);
      });

      it('should return same { output, cached } shape for cache hit as miss', async () => {
        const { cache } = createExampleAsyncCacheWithUri<number>(
          's3://test-bucket/prefix',
        );
        const apiCalls: number[] = [];
        const callApi = withSimpleCacheAsync(
          async (input: { id: string }) => {
            apiCalls.push(1);
            return 42;
          },
          { cache, meta: 'include' },
        );

        const resultMiss = await callApi({ id: 'test-123' });
        const resultHit = await callApi({ id: 'test-123' });

        expect(apiCalls.length).toEqual(1);
        expect(resultMiss).toEqual(resultHit);
        expect(resultHit).toMatchSnapshot();
        expect(resultHit).toEqual({
          output: 42,
          cached: { uri: 's3://test-bucket/prefix/{"id":"test-123"}' },
        });
      });

      it('should wrap undefined output correctly with meta: include', async () => {
        const { cache } = createExampleAsyncCacheWithUri<undefined>(
          's3://test-bucket/prefix',
        );
        const callApi = withSimpleCacheAsync(
          async (input: { id: string }) => {
            return undefined;
          },
          { cache, meta: 'include' },
        );

        const result = await callApi({ id: 'test-123' });

        expect(result).toMatchSnapshot();
        expect(result).toEqual({
          output: undefined,
          cached: { uri: 's3://test-bucket/prefix/{"id":"test-123"}' },
        });
      });

      it('should wrap null output correctly with meta: include', async () => {
        const { cache } = createExampleAsyncCacheWithUri<null>(
          's3://test-bucket/prefix',
        );
        const callApi = withSimpleCacheAsync(
          async (input: { id: string }) => {
            return null;
          },
          { cache, meta: 'include' },
        );

        const result = await callApi({ id: 'test-123' });

        expect(result).toMatchSnapshot();
        expect(result).toEqual({
          output: null,
          cached: { uri: 's3://test-bucket/prefix/{"id":"test-123"}' },
        });
      });

      it('should propagate errors with meta: include', async () => {
        const { cache } = createExampleAsyncCacheWithUri<number>(
          's3://test-bucket/prefix',
        );
        const expectedError = new Error('test error');
        const callApi = withSimpleCacheAsync(
          async (input: { id: string }) => {
            throw expectedError;
          },
          { cache, meta: 'include' },
        );

        await expect(callApi({ id: 'test-123' })).rejects.toThrow(
          expectedError,
        );
      });
    });

    describe('cache WITHOUT uri method', () => {
      it('should return direct value when meta: exclude', async () => {
        const { cache } = createExampleAsyncCacheWithoutUri<number>();
        const callApi = withSimpleCacheAsync(
          async (input: { id: string }) => {
            return 42;
          },
          { cache, meta: 'exclude' },
        );

        const result = await callApi({ id: 'test-123' });

        expect(result).toMatchSnapshot();
        expect(result).toEqual(42);
      });

      it('should return direct value when meta is absent', async () => {
        const { cache } = createExampleAsyncCacheWithoutUri<number>();
        const callApi = withSimpleCacheAsync(
          async (input: { id: string }) => {
            return 42;
          },
          { cache },
        );

        const result = await callApi({ id: 'test-123' });

        expect(result).toMatchSnapshot();
        expect(result).toEqual(42);
      });

      it('should throw BadRequestError when meta: include (runtime guard)', async () => {
        const { cache } = createExampleAsyncCacheWithoutUri<number>();

        // note: this bypasses the type check via cast for runtime guard test
        const callApi = withSimpleCacheAsync(
          async (input: { id: string }) => {
            return 42;
          },
          { cache, meta: 'include' as any },
        );

        await expect(callApi({ id: 'test-123' })).rejects.toThrow(
          BadRequestError,
        );
        await expect(callApi({ id: 'test-123' })).rejects.toThrow(
          "meta: 'include' requires cache with uri method",
        );
      });
    });
  });
});
