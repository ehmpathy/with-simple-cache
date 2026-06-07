import { getError } from 'test-fns';

import {
  createExampleSyncCacheWithoutUri,
  createExampleSyncCacheWithUri,
} from '@src/.test.assets/createExampleCache';
import type {
  SimpleCache,
  WithCacheUri,
} from '@src/domain.objects/SimpleCache';
import { BadRequestError } from '@src/utils/errors/BadRequestError';

import { withSimpleCache } from './withSimpleCache';

/**
 * tests for the meta option feature (sync wrapper)
 *
 * combines runtime behavior tests and type-level contract tests.
 * symmetric with withSimpleCacheAsync.scope=meta.test.ts per rule.require.wrapper-symmetry
 */
describe('withSimpleCache.scope=meta', () => {
  describe('runtime behavior', () => {
    describe('cache WITH uri method', () => {
      it('should return { output, cached } when meta: include', () => {
        const { cache } = createExampleSyncCacheWithUri<number>(
          's3://test-bucket/prefix',
        );
        const callApi = withSimpleCache(
          (input: { id: string }) => {
            return 42;
          },
          { cache, meta: 'include' },
        );

        const result = callApi({ id: 'test-123' });

        expect(result).toMatchSnapshot();
        expect(result).toEqual({
          output: 42,
          cached: { uri: 's3://test-bucket/prefix/{"id":"test-123"}' },
        });
      });

      it('should return direct value when meta: exclude', () => {
        const { cache } = createExampleSyncCacheWithUri<number>(
          's3://test-bucket/prefix',
        );
        const callApi = withSimpleCache(
          (input: { id: string }) => {
            return 42;
          },
          { cache, meta: 'exclude' },
        );

        const result = callApi({ id: 'test-123' });

        expect(result).toMatchSnapshot();
        expect(result).toEqual(42);
      });

      it('should return direct value when meta is absent (backwards compat)', () => {
        const { cache } = createExampleSyncCacheWithUri<number>(
          's3://test-bucket/prefix',
        );
        const callApi = withSimpleCache(
          (input: { id: string }) => {
            return 42;
          },
          { cache },
        );

        const result = callApi({ id: 'test-123' });

        expect(result).toMatchSnapshot();
        expect(result).toEqual(42);
      });

      it('should return same { output, cached } shape for cache hit as miss', () => {
        const { cache } = createExampleSyncCacheWithUri<number>(
          's3://test-bucket/prefix',
        );
        const apiCalls: number[] = [];
        const callApi = withSimpleCache(
          (input: { id: string }) => {
            apiCalls.push(1);
            return 42;
          },
          { cache, meta: 'include' },
        );

        const resultMiss = callApi({ id: 'test-123' });
        const resultHit = callApi({ id: 'test-123' });

        expect(apiCalls.length).toEqual(1);
        expect(resultMiss).toEqual(resultHit);
        expect(resultHit).toMatchSnapshot();
        expect(resultHit).toEqual({
          output: 42,
          cached: { uri: 's3://test-bucket/prefix/{"id":"test-123"}' },
        });
      });

      it('should wrap undefined output correctly with meta: include', () => {
        const { cache } = createExampleSyncCacheWithUri<undefined>(
          's3://test-bucket/prefix',
        );
        const callApi = withSimpleCache(
          (input: { id: string }) => {
            return undefined;
          },
          { cache, meta: 'include' },
        );

        const result = callApi({ id: 'test-123' });

        expect(result).toMatchSnapshot();
        expect(result).toEqual({
          output: undefined,
          cached: { uri: 's3://test-bucket/prefix/{"id":"test-123"}' },
        });
      });

      it('should wrap null output correctly with meta: include', () => {
        const { cache } = createExampleSyncCacheWithUri<null>(
          's3://test-bucket/prefix',
        );
        const callApi = withSimpleCache(
          (input: { id: string }) => {
            return null;
          },
          { cache, meta: 'include' },
        );

        const result = callApi({ id: 'test-123' });

        expect(result).toMatchSnapshot();
        expect(result).toEqual({
          output: null,
          cached: { uri: 's3://test-bucket/prefix/{"id":"test-123"}' },
        });
      });

      it('should propagate errors with meta: include', () => {
        const { cache } = createExampleSyncCacheWithUri<number>(
          's3://test-bucket/prefix',
        );
        const expectedError = new Error('test error');
        const callApi = withSimpleCache(
          (input: { id: string }) => {
            throw expectedError;
          },
          { cache, meta: 'include' },
        );

        expect(() => callApi({ id: 'test-123' })).toThrow(expectedError);
      });
    });

    describe('cache WITHOUT uri method', () => {
      it('should return direct value when meta: exclude', () => {
        const { cache } = createExampleSyncCacheWithoutUri<number>();
        const callApi = withSimpleCache(
          (input: { id: string }) => {
            return 42;
          },
          { cache, meta: 'exclude' },
        );

        const result = callApi({ id: 'test-123' });

        expect(result).toMatchSnapshot();
        expect(result).toEqual(42);
      });

      it('should return direct value when meta is absent', () => {
        const { cache } = createExampleSyncCacheWithoutUri<number>();
        const callApi = withSimpleCache(
          (input: { id: string }) => {
            return 42;
          },
          { cache },
        );

        const result = callApi({ id: 'test-123' });

        expect(result).toMatchSnapshot();
        expect(result).toEqual(42);
      });

      it('should throw BadRequestError when meta: include (runtime guard)', () => {
        const { cache } = createExampleSyncCacheWithoutUri<number>();

        // note: this bypasses the type check via cast for runtime guard test
        const callApi = withSimpleCache(
          (input: { id: string }) => {
            return 42;
          },
          { cache, meta: 'include' as any },
        );

        const error = getError(() => callApi({ id: 'test-123' }));
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain("meta: 'include' requires cache with uri method");
        expect(error.message).toMatchSnapshot();
      });
    });
  });

  describe('type contracts', () => {
    describe('static cache (direct instance)', () => {
      describe('cache WITH uri method', () => {
        const createCacheWithUri = (): WithCacheUri<SimpleCache<number>> => ({
          get: () => 42,
          set: () => {},
          uri: () => 'file:///tmp/cache/key',
        });

        it('meta: include should return { output, cached } structure', () => {
          const cache = createCacheWithUri();
          const wrapped = withSimpleCache(() => 42, {
            cache,
            meta: 'include',
          });

          const result = wrapped();

          // type proof: result has output property
          const output: number = result.output;
          expect(output).toEqual(42);

          // type proof: result has cached.uri property
          const uri: string = result.cached.uri;
          expect(uri).toContain('file://');

          // @ts-expect-error - result is not a number, it's { output, cached }
          const wrongType: number = result;
        });

        it('meta: exclude should return direct value', () => {
          const cache = createCacheWithUri();
          const wrapped = withSimpleCache(() => 42, {
            cache,
            meta: 'exclude',
          });

          const result = wrapped();

          // type proof: result is directly the number
          const output: number = result;
          expect(output).toEqual(42);

          // @ts-expect-error - result has no output property, it's the direct value
          const wrongAccess = result.output;
        });

        it('meta absent should return direct value (backwards compat)', () => {
          const cache = createCacheWithUri();
          const wrapped = withSimpleCache(() => 42, {
            cache,
          });

          const result = wrapped();

          // type proof: result is directly the number
          const output: number = result;
          expect(output).toEqual(42);

          // @ts-expect-error - result has no output property, it's the direct value
          const wrongAccess = result.output;
        });
      });

      describe('cache WITHOUT uri method', () => {
        const createCacheWithoutUri = (): SimpleCache<number> => ({
          get: () => 42,
          set: () => {},
        });

        it('meta: include should be a TYPE ERROR at compile time', () => {
          const cache = createCacheWithoutUri();

          const wrapped = withSimpleCache(() => 42, {
            cache,
            // @ts-expect-error - meta: 'include' not allowed without uri method
            meta: 'include',
          });
        });

        it('meta: exclude should work fine', () => {
          const cache = createCacheWithoutUri();
          const wrapped = withSimpleCache(() => 42, {
            cache,
            meta: 'exclude',
          });

          const result = wrapped();
          const output: number = result;
          expect(output).toEqual(42);
        });

        it('meta absent should work fine', () => {
          const cache = createCacheWithoutUri();
          const wrapped = withSimpleCache(() => 42, {
            cache,
          });

          const result = wrapped();
          const output: number = result;
          expect(output).toEqual(42);
        });
      });

      describe('null and undefined outputs', () => {
        const createCacheWithUri = <T>(
          defaultValue: T,
        ): WithCacheUri<SimpleCache<T>> => ({
          get: () => defaultValue,
          set: () => {},
          uri: () => 'file:///tmp/cache/key',
        });

        it('null output should preserve type with meta: include', () => {
          const cache = createCacheWithUri<null>(null);
          const wrapped = withSimpleCache((): null => null, {
            cache,
            meta: 'include',
          });

          const result = wrapped();
          const output: null = result.output;
          expect(output).toBeNull();
        });

        it('undefined output should preserve type with meta: include', () => {
          const cache = createCacheWithUri<undefined>(undefined);
          const wrapped = withSimpleCache((): undefined => undefined, {
            cache,
            meta: 'include',
          });

          const result = wrapped();
          const output: undefined = result.output;
          expect(output).toBeUndefined();
        });
      });
    });

    describe('dynamic cache extraction via (...args) => cache', () => {
      it('meta: include should compile when cache option is typed as WithCacheUri', () => {
        const cacheOption: WithCacheUri<SimpleCache<string>> = {
          get: () => 'cached',
          set: () => {},
          uri: () => 'file:///tmp/key',
        };

        const wrapped = withSimpleCache(
          (_input: { query: string }): string => 'result',
          {
            cache: cacheOption,
            meta: 'include',
          },
        );

        const result = wrapped({ query: 'test' });
        const output: string = result.output;
        const uri: string = result.cached.uri;
        expect(output).toBeDefined();
        expect(uri).toBeDefined();
      });

      it('meta: include should TYPE ERROR when cache option lacks uri', () => {
        const cacheOption: SimpleCache<string> = {
          get: () => 'cached',
          set: () => {},
        };

        const wrapped = withSimpleCache(
          (_input: { query: string }): string => 'result',
          {
            cache: cacheOption,
            // @ts-expect-error - meta: 'include' not allowed because cache lacks uri
            meta: 'include',
          },
        );
      });

      describe('positive: extraction function works', () => {
        it('extraction with meta: include', () => {
          const wrapped = withSimpleCache(
            (
              _input: { query: string },
              _context: { cache: WithCacheUri<SimpleCache<string>> },
            ): string => 'result',
            {
              cache: (
                _input: { query: string },
                context: { cache: WithCacheUri<SimpleCache<string>> },
              ) => context.cache,
              meta: 'include',
            },
          );

          const result = wrapped(
            { query: 'test' },
            {
              cache: {
                get: () => 'cached',
                set: () => {},
                uri: () => 'file:///tmp/key',
              },
            },
          );

          const output: string = result.output;
          const uri: string = result.cached.uri;
          expect(output).toBeDefined();
          expect(uri).toBeDefined();
        });

        it('extraction with meta: exclude', () => {
          const wrapped = withSimpleCache(
            (
              _input: { query: string },
              _context: { cache: WithCacheUri<SimpleCache<string>> },
            ): string => 'result',
            {
              cache: (
                _input: { query: string },
                context: { cache: WithCacheUri<SimpleCache<string>> },
              ) => context.cache,
              meta: 'exclude',
            },
          );

          const result = wrapped(
            { query: 'test' },
            {
              cache: {
                get: () => 'cached',
                set: () => {},
                uri: () => 'file:///tmp/key',
              },
            },
          );

          const direct: string = result;
          expect(direct).toBeDefined();
        });

        it('extraction without meta (backwards compat)', () => {
          const wrapped = withSimpleCache(
            (
              _input: { query: string },
              _context: { cache: SimpleCache<string> },
            ): string => 'result',
            {
              cache: (
                _input: { query: string },
                context: { cache: SimpleCache<string> },
              ) => context.cache,
            },
          );

          const result = wrapped(
            { query: 'test' },
            { cache: { get: () => 'cached', set: () => {} } },
          );

          const direct: string = result;
          expect(direct).toBeDefined();
        });

        it('extraction from first arg (input.cache)', () => {
          const wrapped = withSimpleCache(
            (
              _input: { query: string; cache: WithCacheUri<SimpleCache<string>> },
            ): string => 'result',
            {
              cache: (input: {
                query: string;
                cache: WithCacheUri<SimpleCache<string>>;
              }) => input.cache,
              meta: 'include',
            },
          );

          const result = wrapped({
            query: 'test',
            cache: {
              get: () => 'cached',
              set: () => {},
              uri: () => 's3://bucket/key',
            },
          });

          const output: string = result.output;
          const uri: string = result.cached.uri;
          expect(output).toBeDefined();
          expect(uri).toBeDefined();
        });

        it('extraction from nested path (context.services.cache)', () => {
          const wrapped = withSimpleCache(
            (
              _input: { query: string },
              _context: { services: { cache: WithCacheUri<SimpleCache<string>> } },
            ): string => 'result',
            {
              cache: (
                _input: { query: string },
                context: { services: { cache: WithCacheUri<SimpleCache<string>> } },
              ) => context.services.cache,
              meta: 'include',
            },
          );

          const result = wrapped(
            { query: 'test' },
            {
              services: {
                cache: {
                  get: () => 'cached',
                  set: () => {},
                  uri: () => 'redis://host/key',
                },
              },
            },
          );

          const output: string = result.output;
          const uri: string = result.cached.uri;
          expect(output).toBeDefined();
          expect(uri).toBeDefined();
        });
      });

      describe('negative: inline extraction type errors', () => {
        it('rejects meta: include when extracted cache lacks uri', () => {
          const wrapped = withSimpleCache(
            (
              _input: { query: string },
              _context: { cache: SimpleCache<string> },
            ): string => 'result',
            {
              cache: (_input, context) => context.cache,
              // @ts-expect-error - meta: 'include' not allowed because cache lacks uri
              meta: 'include',
            },
          );
        });

        it('rejects extraction that returns wrong type', () => {
          const wrapped = withSimpleCache(
            (
              _input: { query: string },
              _context: { notACache: string },
            ): string => 'result',
            {
              // @ts-expect-error - extraction returns string, not SimpleCache
              cache: (_input, context) => context.notACache,
            },
          );
        });
      });
    });
  });
});
