import { createExampleSyncCache } from '@src/.test.assets/createExampleCache';

import { withSimpleCache } from './withSimpleCache';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * tests for asynchronous logic with synchronous cache
 *
 * verifies that async functions work correctly with sync cache
 *
 * symmetric with withSimpleCacheAsync.scope=async-logic.test.ts per rule.require.wrapper-symmetry
 */
describe('withSimpleCache.scope=async-logic', () => {
  it('should be possible to stringify the result of a promise in the cache', async () => {
    // define an example fn
    const apiCalls: string[] = [];
    const callApi = withSimpleCache(
      async ({ name }: { name: string }) => {
        apiCalls.push(name);
        await sleep(100);
        return Math.random();
      },
      { cache: createExampleSyncCache().cache },
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
  });
  it('should be possible to wait for the get promise to resolve before deciding whether to set or return', async () => {
    // define an example fn
    const apiCalls: string[] = [];
    const callApi = withSimpleCache(
      async ({ name }: { name: string }) => {
        apiCalls.push(name);
        return Math.random();
      },
      { cache: createExampleSyncCache().cache },
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
  });
  it('should expose the error, if an error was resolved by the promise returned by the function', async () => {
    // define an example fn
    const expectedError = new Error('surprise!');
    const callApi = withSimpleCache(
      async () => {
        throw expectedError;
      },
      { cache: createExampleSyncCache().cache },
    );

    // call the fn and check that we can catch the error
    try {
      await callApi();
      throw new Error('should not reach here');
    } catch (error) {
      expect(error).toEqual(expectedError);
    }
  });
});
