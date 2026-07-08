import { getError, given, then, when } from 'test-fns';

import {
  createExampleSyncCache,
  createExampleSyncCacheWithConditionals,
  createExampleSyncCacheWithUriAndConditionals,
} from '@src/.test.assets/createExampleCache';
import type {
  SimpleCache,
  SimpleCacheSync,
  WithCacheConditionals,
} from '@src/domain.objects/SimpleCache';
import { BadRequestError } from '@src/utils/errors/BadRequestError';
import { SimpleCacheConditionError } from '@src/utils/errors/SimpleCacheConditionError';

import { withSimpleCache } from './withSimpleCache';

/**
 * tests for the conditional-write capability (sync wrapper)
 *
 * combines runtime behavior tests and type-level contract tests.
 * symmetric with withSimpleCacheAsync.scope=conditionals.test.ts per rule.require.wrapper-symmetry
 */
describe('withSimpleCache.scope=conditionals', () => {
  describe('runtime behavior', () => {
    given(
      'a conditional cache and a put-if-absent write (condition.version: null)',
      () => {
        when('the key is absent', () => {
          then('the write succeeds and mints a version', () => {
            const { cache, store } =
              createExampleSyncCacheWithConditionals<string>();
            const callApi = withSimpleCache(
              (_input: { id: string }) => 'first',
              {
                cache,
                serialize: { key: (input) => input.id },
                condition: { version: null },
              },
            );

            const result = callApi({ id: 'lock' });

            expect(result).toEqual('first');
            expect(store.lock?.value).toEqual('first');
            expect(store.lock?.version).toEqual('v1');
          });
        });

        when('the key already exists (a writer beat us to it)', () => {
          then(
            'exception: throw (default) surfaces SimpleCacheConditionError',
            () => {
              const { cache } =
                createExampleSyncCacheWithConditionals<string>();
              cache.set('lock', 'held-by-winner'); // seed the winner

              const callApi = withSimpleCache(
                (_input: { id: string }) => 'loser-output',
                {
                  cache,
                  serialize: { key: (input) => input.id },
                  bypass: { get: () => true }, // force a miss so we reach the conditional set
                  condition: { version: null },
                },
              );

              const error = getError(() => callApi({ id: 'lock' }));
              expect(error).toBeInstanceOf(SimpleCacheConditionError);
              expect(error.message).toMatchSnapshot();
            },
          );

          then(
            'exception: ignore swallows and returns the winner value (converge)',
            () => {
              const { cache } =
                createExampleSyncCacheWithConditionals<string>();
              cache.set('lock', 'held-by-winner'); // seed the winner

              const callApi = withSimpleCache(
                (_input: { id: string }) => 'loser-output',
                {
                  cache,
                  serialize: { key: (input) => input.id },
                  bypass: { get: () => true },
                  condition: { version: null, exception: 'ignore' },
                },
              );

              const result = callApi({ id: 'lock' });

              // converge: the loser sees the winner value, not its own freshly-computed output
              expect(result).toEqual('held-by-winner');
            },
          );
        });
      },
    );

    given(
      'a conditional cache and a compare-and-set write (condition.version: token)',
      () => {
        when(
          'the current version matches the token (dynamic extractor)',
          () => {
            then('the write overwrites and bumps the version', () => {
              const { cache, store } =
                createExampleSyncCacheWithConditionals<string>();
              cache.set('rec', 'v1-value'); // seeded at v1

              const callApi = withSimpleCache(
                (_input: { id: string; expectedVersion: string }) => 'v2-value',
                {
                  cache,
                  serialize: { key: (input) => input.id },
                  bypass: { get: () => true },
                  condition: { version: (input) => input.expectedVersion },
                },
              );

              const result = callApi({ id: 'rec', expectedVersion: 'v1' });

              expect(result).toEqual('v2-value');
              expect(store.rec?.value).toEqual('v2-value');
              expect(store.rec?.version).toEqual('v2');
            });
          },
        );

        when('the current version matches the token (static value)', () => {
          then('the write overwrites and bumps the version', () => {
            const { cache, store } =
              createExampleSyncCacheWithConditionals<string>();
            cache.set('rec', 'v1-value'); // seeded at v1

            const callApi = withSimpleCache(
              (_input: { id: string }) => 'v2-value',
              {
                cache,
                serialize: { key: (input) => input.id },
                bypass: { get: () => true },
                condition: { version: 'v1' }, // static token
              },
            );

            const result = callApi({ id: 'rec' });

            expect(result).toEqual('v2-value');
            expect(store.rec?.value).toEqual('v2-value');
            expect(store.rec?.version).toEqual('v2');
          });
        });

        when('the current version does not match the token', () => {
          then(
            'exception: throw (default) surfaces SimpleCacheConditionError',
            () => {
              const { cache } =
                createExampleSyncCacheWithConditionals<string>();
              cache.set('rec', 'v1-value'); // seeded at v1

              const callApi = withSimpleCache(
                (_input: { id: string; expectedVersion: string }) => 'v2-value',
                {
                  cache,
                  serialize: { key: (input) => input.id },
                  bypass: { get: () => true },
                  condition: { version: (input) => input.expectedVersion },
                },
              );

              const error = getError(() =>
                callApi({ id: 'rec', expectedVersion: 'v-stale' }),
              );
              expect(error).toBeInstanceOf(SimpleCacheConditionError);
              expect(error.message).toMatchSnapshot();
            },
          );
        });
      },
    );

    given(
      'a dynamic extractor that returns null (put-if-absent via extraction)',
      () => {
        when(
          'the extractor resolves the version to null and the key is absent',
          () => {
            then('the write succeeds as a put-if-absent', () => {
              const { cache, store } =
                createExampleSyncCacheWithConditionals<string>();

              const callApi = withSimpleCache(
                (_input: { id: string; putIfAbsent: boolean }) => 'first',
                {
                  cache,
                  serialize: { key: (input) => input.id },
                  // dynamic extractor yields null → put-if-absent
                  condition: {
                    version: (input) => (input.putIfAbsent ? null : 'x'),
                  },
                },
              );

              const result = callApi({ id: 'lock', putIfAbsent: true });

              expect(result).toEqual('first');
              expect(store.lock?.version).toEqual('v1');
            });
          },
        );
      },
    );

    given('condition and bypass.set together (orthogonal)', () => {
      when('bypass.set short-circuits before any write', () => {
        then('no conditional write happens and output is returned', () => {
          const { cache, store } =
            createExampleSyncCacheWithConditionals<string>();
          cache.set('lock', 'held'); // present — a condition:null write would conflict

          const callApi = withSimpleCache((_input: { id: string }) => 'fresh', {
            cache,
            serialize: { key: (input) => input.id },
            bypass: { get: () => true, set: () => true },
            condition: { version: null },
          });

          // bypass.set fires first, so the conditional write (which would conflict) never runs
          const result = callApi({ id: 'lock' });
          expect(result).toEqual('fresh');
          expect(store.lock?.value).toEqual('held'); // unchanged
        });
      });
    });

    given('meta: include surfaces the version (tier 2)', () => {
      when('the cache has conditionals only', () => {
        then('cached is { version }', () => {
          const { cache } = createExampleSyncCacheWithConditionals<number>();
          const callApi = withSimpleCache((_input: { id: string }) => 42, {
            cache,
            serialize: { key: (input) => input.id },
            meta: 'include',
          });

          const result = callApi({ id: 'abc' });

          // snapshot as pretty JSON — clean, valid-json output (no comma after the last key)
          expect(JSON.stringify(result, null, 2)).toMatchSnapshot();
          expect(result).toEqual({ output: 42, cached: { version: 'v1' } });
        });
      });

      when('the cache has both uri and conditionals', () => {
        then('cached is { uri, version }', () => {
          const { cache } =
            createExampleSyncCacheWithUriAndConditionals<number>(
              's3://bucket/prefix',
            );
          const callApi = withSimpleCache((_input: { id: string }) => 42, {
            cache,
            serialize: { key: (input) => input.id },
            meta: 'include',
          });

          const result = callApi({ id: 'abc' });

          // snapshot as pretty JSON — clean, valid-json output (no comma after the last key)
          expect(JSON.stringify(result, null, 2)).toMatchSnapshot();
          expect(result).toEqual({
            output: 42,
            cached: { uri: 's3://bucket/prefix/abc', version: 'v1' },
          });
        });

        then('a cache hit returns the same meta shape', () => {
          const { cache } =
            createExampleSyncCacheWithUriAndConditionals<number>(
              's3://bucket/prefix',
            );
          const apiCalls: number[] = [];
          const callApi = withSimpleCache(
            (_input: { id: string }) => {
              apiCalls.push(1);
              return 42;
            },
            {
              cache,
              serialize: { key: (input) => input.id },
              meta: 'include',
            },
          );

          const resultMiss = callApi({ id: 'abc' });
          const resultHit = callApi({ id: 'abc' });

          expect(apiCalls.length).toEqual(1);
          expect(resultHit).toEqual(resultMiss);
          expect(resultHit).toEqual({
            output: 42,
            cached: { uri: 's3://bucket/prefix/abc', version: 'v1' },
          });
        });
      });
    });

    given(
      'the cache contract directly — version() + version-checked get',
      () => {
        when('a key is absent then written', () => {
          then('version() is undefined before and a token after', () => {
            const { cache } = createExampleSyncCacheWithConditionals<string>();
            expect(cache.version('k')).toBeUndefined();
            cache.set('k', 'a');
            expect(cache.version('k')).toEqual('v1');
          });
        });

        when('get carries a version condition that still matches', () => {
          then('the read returns the value (atomicity happy path)', () => {
            const { cache } = createExampleSyncCacheWithConditionals<string>();
            cache.set('k', 'a'); // now at v1
            const value = cache.get('k', { condition: { version: 'v1' } });
            expect(value).toEqual('a');
          });
        });

        when('get carries a version condition that no longer matches', () => {
          then(
            'the version-checked read throws SimpleCacheConditionError',
            () => {
              const { cache } =
                createExampleSyncCacheWithConditionals<string>();
              cache.set('k', 'a'); // v1
              cache.set('k', 'b', { condition: { version: 'v1' } }); // → v2
              const error = getError(() =>
                cache.get('k', { condition: { version: 'v1' } }),
              );
              expect(error).toBeInstanceOf(SimpleCacheConditionError);
            },
          );
        });
      },
    );

    given(
      'a condition passed to a non-conditional cache (type gate bypassed)',
      () => {
        when('the runtime cache lacks a version method', () => {
          then(
            'the wrapper throws BadRequestError (fail loud, not a silent no-op)',
            () => {
              const { cache } = createExampleSyncCache();
              const callApi = withSimpleCache((_input: { id: string }) => 'x', {
                cache,
                serialize: { key: (input: { id: string }) => input.id },
                bypass: { get: () => true }, // force a miss so we reach the set path
                // cast simulates a type-gate bypass; the runtime guard must still fail loud
                condition: { version: null },
              } as any);

              const error = getError(() => callApi({ id: 'k' }));
              expect(error).toBeInstanceOf(BadRequestError);
              expect(error.message).toContain('version method');
              // snapshot the guard message so reviewers can vibecheck the new contract surface
              expect(error.message).toMatchSnapshot();
            },
          );
        });
      },
    );

    given('condition and meta: include together (the primary use case)', () => {
      when('a put-if-absent write succeeds', () => {
        then('cached.version reflects the newly minted version', () => {
          const { cache } = createExampleSyncCacheWithConditionals<string>();
          const callApi = withSimpleCache((_input: { id: string }) => 'first', {
            cache,
            serialize: { key: (input) => input.id },
            meta: 'include',
            condition: { version: null },
          });

          const result = callApi({ id: 'lock' });

          // snapshot the primary use-case output shape (clean JSON, no comma on the last key)
          expect(JSON.stringify(result, null, 2)).toMatchSnapshot();
          expect(result).toEqual({
            output: 'first',
            cached: { version: 'v1' },
          });
        });
      });

      when('a compare-and-set write bumps the version', () => {
        then('cached.version reflects the bumped version', () => {
          const { cache } = createExampleSyncCacheWithConditionals<string>();
          cache.set('rec', 'v1-value'); // seeded at v1

          const callApi = withSimpleCache(
            (_input: { id: string }) => 'v2-value',
            {
              cache,
              serialize: { key: (input) => input.id },
              bypass: { get: () => true },
              meta: 'include',
              condition: { version: 'v1' },
            },
          );

          const result = callApi({ id: 'rec' });

          // snapshot the primary use-case output shape (clean JSON, no comma on the last key)
          expect(JSON.stringify(result, null, 2)).toMatchSnapshot();
          expect(result).toEqual({
            output: 'v2-value',
            cached: { version: 'v2' },
          });
        });
      });
    });

    given(
      'exception: ignore convergence on a compare-and-set stale-token conflict',
      () => {
        when('the held token is stale (the key advanced past it)', () => {
          then('the loser swallows and returns the winner value', () => {
            const { cache } = createExampleSyncCacheWithConditionals<string>();
            cache.set('rec', 'v1-value'); // key now at v1

            const callApi = withSimpleCache(
              (_input: { id: string }) => 'loser-output',
              {
                cache,
                serialize: { key: (input) => input.id },
                bypass: { get: () => true },
                condition: { version: 'v-stale', exception: 'ignore' },
              },
            );

            const result = callApi({ id: 'rec' });

            // converge: the loser sees the winner value (v1-value), not its own output
            expect(result).toEqual('v1-value');
          });
        });
      },
    );

    given(
      'exception: ignore convergence on a put-if-absent conflict (key already present)',
      () => {
        when('the key already exists (a writer beat us to it)', () => {
          then('the loser swallows and returns the winner value', () => {
            const { cache } = createExampleSyncCacheWithConditionals<string>();
            cache.set('lock', 'winner-value'); // key already at v1

            const callApi = withSimpleCache(
              (_input: { id: string }) => 'loser-output',
              {
                cache,
                serialize: { key: (input) => input.id },
                bypass: { get: () => true },
                condition: { version: null, exception: 'ignore' },
              },
            );

            const result = callApi({ id: 'lock' });

            // converge: the put-if-absent loser sees the winner value, not its own output
            expect(result).toEqual('winner-value');
          });
        });
      },
    );

    given(
      'exception: ignore where the winner value vanished before the re-read',
      () => {
        when(
          'the set conflict throws but the re-read returns undefined',
          () => {
            then('the loser falls back to its own output', () => {
              // a cache whose set always conflicts and whose get always misses — this forces
              // convergeOnWriteConflict down its fallback branch (winner gone → return own output)
              const cache: WithCacheConditionals<SimpleCacheSync<string>> = {
                get: () => undefined,
                set: () => {
                  throw new SimpleCacheConditionError(
                    'cache condition failed: expected key to be absent',
                    {
                      key: 'lock',
                      condition: { version: null },
                      found: 'ghost',
                    },
                  );
                },
                version: () => undefined,
              };

              const callApi = withSimpleCache(
                (_input: { id: string }) => 'loser-output',
                {
                  cache,
                  serialize: { key: (input) => input.id },
                  condition: { version: null, exception: 'ignore' },
                },
              );

              const result = callApi({ id: 'lock' });

              // the winner vanished, so the loser converges on its own output as the fallback
              expect(result).toEqual('loser-output');
            });
          },
        );
      },
    );

    given(
      'the cache is supplied via an inline extractor (rule.require.inline-extractors-in-tests)',
      () => {
        when(
          'the extractor returns a WithCacheConditionals cache and a condition is set',
          () => {
            then(
              'the conditional write goes through the extracted cache',
              () => {
                const { cache, store } =
                  createExampleSyncCacheWithConditionals<string>();

                const callApi = withSimpleCache(
                  (_input: { id: string }, _context: { cache: typeof cache }) =>
                    'first',
                  {
                    // inline extractor — proves the condition gate compiles through extraction
                    cache: (
                      _input: { id: string },
                      context: { cache: typeof cache },
                    ) => context.cache,
                    serialize: { key: (input) => input.id },
                    condition: { version: null },
                  },
                );

                const result = callApi({ id: 'lock' }, { cache });

                expect(result).toEqual('first');
                expect(store.lock?.version).toEqual('v1');
              },
            );
          },
        );
      },
    );

    given('bypass.set with meta: include on a new key', () => {
      when('the write is bypassed so no entry is stored', () => {
        then(
          'cached.version is undefined (type is honest: string | undefined)',
          () => {
            const { cache } = createExampleSyncCacheWithConditionals<number>();
            const callApi = withSimpleCache((_input: { id: string }) => 42, {
              cache,
              serialize: { key: (input) => input.id },
              bypass: { get: () => true, set: () => true },
              meta: 'include',
            });

            const result = callApi({ id: 'new-key' });

            expect(result).toEqual({
              output: 42,
              cached: { version: undefined },
            });
          },
        );
      });
    });
  });

  describe('type contracts', () => {
    when('the cache HasCacheConditionals', () => {
      then('condition is allowed', () => {
        const cache: WithCacheConditionals<SimpleCache<string>> = {
          get: () => 'x',
          set: () => {},
          version: () => 'v1',
        };
        const wrapped = withSimpleCache(
          (_input: { id: string }): string => 'x',
          {
            cache,
            condition: { version: null },
          },
        );
        expect(wrapped).toBeDefined();
      });

      then('meta: include is allowed even without uri', () => {
        const cache: WithCacheConditionals<SimpleCache<number>> = {
          get: () => 42,
          set: () => {},
          version: () => 'v1',
        };
        const wrapped = withSimpleCache(() => 42, { cache, meta: 'include' });

        const result = wrapped();
        // version is `string | undefined` — it is undefined for a key with no stored entry
        const version: string | undefined = result.cached.version;
        expect(version).toBeDefined();
      });
    });

    when('the cache is a plain SimpleCache', () => {
      then('condition is a TYPE ERROR at compile time', () => {
        const cache: SimpleCache<string> = { get: () => 'x', set: () => {} };
        const wrapped = withSimpleCache(
          (_input: { id: string }): string => 'x',
          {
            cache,
            // @ts-expect-error - condition not allowed without conditional-write capability
            condition: { version: null },
          },
        );
        expect(wrapped).toBeDefined();
      });
    });
  });
});
