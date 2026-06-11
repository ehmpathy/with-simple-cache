import { createCache } from 'simple-in-memory-cache';

import { createExampleAsyncCache } from '@src/.test.assets/createExampleCache';
import type { SimpleCacheAsync } from '@src/domain.objects/SimpleCache';

import { withSimpleCacheAsync } from './withSimpleCacheAsync';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * tests for asynchronous logic with asynchronous cache
 *
 * verifies that async functions work correctly with async cache,
 * including deduplication of parallel requests
 */
describe('withSimpleCacheAsync.scope=async-cache', () => {
  it('should be possible for a cache to await and persist the resolved value, not the promise', async () => {
    const { cache, store } = createExampleAsyncCache();

    // define an example fn
    const apiCalls: string[] = [];
    const callApi = withSimpleCacheAsync(
      async ({ name }: { name: string }) => {
        apiCalls.push(name);
        await sleep(100);
        return Math.random();
      },
      { cache },
    );

    // call the fn a few times
    const result1 = await callApi({ name: 'casey' });
    const result2 = await callApi({ name: 'katya' });
    const result3 = await callApi({ name: 'casey' });
    const result4 = await callApi({ name: 'katya' });

    // check that the response is the same each time the input is the same
    expect(result1).toEqual(result3);
    expect(result2).toEqual(result4);

    // check that "api" was only called twice (once per name)
    expect(apiCalls.length).toEqual(2);

    // check that the value in the cache is not the promise, but the value itself
    expect(typeof Promise.resolve(821)).toEqual('object'); // prove that a promise to resolve a number has a typeof object
    expect(typeof store[JSON.stringify({ name: 'casey' })]?.value).toEqual(
      'number',
    ); // now prove that the value saved into the cache for this name is definetly not a promise
  });
  it('should deduplicate parallel requests in memory even before async cache has finished resolving its first get', async () => {
    const store: Record<string, string | undefined> = {};
    const cache: SimpleCacheAsync<string> = {
      set: async (key: string, value: string | undefined) => {
        store[key] = value;
      },
      get: async (key: string) => {
        await sleep(1500); // act like it takes a while for the cache to resolve
        return store[key];
      },
    };

    // define an example fn
    const apiCalls: string[] = [];
    const callApi = withSimpleCacheAsync(
      async ({ name }: { name: string }) => {
        apiCalls.push(name);
        await sleep(100);
        return Math.random();
      },
      { cache },
    );

    // call the fn a few times, in parallel
    const [result1, result2, result3, result4] = await Promise.all([
      callApi({ name: 'casey' }),
      callApi({ name: 'katya' }),
      callApi({ name: 'casey' }),
      callApi({ name: 'katya' }),
    ]);

    // check that the response is the same each time the input is the same
    expect(result1).toEqual(result3);
    expect(result2).toEqual(result4);

    // check that "api" was only called twice (once per name)
    expect(apiCalls.length).toEqual(2);

    // check that the value in the cache is not the promise, but the value itself
    expect(typeof Promise.resolve(821)).toEqual('object'); // prove that a promise to resolve a number has a typeof object
    expect(typeof store[JSON.stringify({ name: 'casey' })]).toEqual('number'); // now prove that the value saved into the cache for this name is definetly not a promise
  });
  it('should deduplicate parallel requests in memory via the passed in in-memory cache if one was passed in', async () => {
    const store: Record<string, string | undefined> = {};
    const cache: SimpleCacheAsync<string> = {
      set: async (key: string, value: string | undefined) => {
        store[key] = value;
      },
      get: async (key: string) => {
        await sleep(1500); // act like it takes a while for the cache to resolve
        return store[key];
      },
    };

    // define an example fn
    const apiCalls: string[] = [];
    const deduplicationCache = createCache();
    const callApi = (args: { name: string }) =>
      // note that this function instantiates a new wrapper each time -> requiring the deduplication cache to be passed in
      withSimpleCacheAsync(
        async ({ name }: { name: string }) => {
          apiCalls.push(name);
          await sleep(100);
          return Math.random();
        },
        { cache: { output: cache, deduplication: deduplicationCache } },
      )(args);

    // call the fn a few times, in parallel
    const [result1, result2, result3, result4] = await Promise.all([
      callApi({ name: 'casey' }),
      callApi({ name: 'katya' }),
      callApi({ name: 'casey' }),
      callApi({ name: 'katya' }),
    ]);

    // check that the response is the same each time the input is the same
    expect(result1).toEqual(result3);
    expect(result2).toEqual(result4);

    // check that "api" was only called twice (once per name)
    expect(apiCalls.length).toEqual(2);

    // check that the value in the cache is not the promise, but the value itself
    expect(typeof Promise.resolve(821)).toEqual('object'); // prove that a promise to resolve a number has a typeof object
    expect(typeof store[JSON.stringify({ name: 'casey' })]).toEqual('number'); // now prove that the value saved into the cache for this name is definetly not a promise
  });
  it('should be possible to catch an error which was rejected by a promise set to the cache in an async cache which awaited the value onSet', async () => {
    const { cache, store } = createExampleAsyncCache();

    // define an example fn
    const expectedError = new Error('surprise!');
    const callApi = withSimpleCacheAsync(
      // eslint-disable-next-line no-empty-pattern
      async ({}: { name: string }) => {
        throw expectedError;
      },
      { cache },
    );

    // prove that we can catch the error
    try {
      await callApi({ name: 'casey' });
      throw new Error('should not reach here');
    } catch (error) {
      expect(error).toEqual(expectedError);
    }

    // prove that nothing was set to the cache
    expect(typeof store[JSON.stringify({ name: 'casey' })]?.value).toEqual(
      'undefined',
    );
  });
  it('should have appropriate types for an async cache that caches awaited values', async () => {
    const { cache, store } = createExampleAsyncCache();

    // define an example fn
    const apiCalls: string[] = [];
    const callApi = withSimpleCacheAsync(
      async ({ name }: { name: string }) => {
        apiCalls.push(name);
        await sleep(100);
        return Math.random();
      },
      { cache },
    );

    // call the fn a few times
    const result1 = await callApi({ name: 'casey' });
    const result2 = await callApi({ name: 'katya' });
    const result3 = await callApi({ name: 'casey' });
    const result4 = await callApi({ name: 'katya' });

    // check that the response is the same each time the input is the same
    expect(result1).toEqual(result3);
    expect(result2).toEqual(result4);

    // check that "api" was only called twice (once per name)
    expect(apiCalls.length).toEqual(2);

    // check that the value in the cache is not the promise, but the value itself
    expect(typeof Promise.resolve(821)).toEqual('object'); // prove that a promise to resolve a number has a typeof object
    expect(typeof store[JSON.stringify({ name: 'casey' })]?.value).toEqual(
      'number',
    ); // now prove that the value saved into the cache for this name is definetly not a promise
  });
});
