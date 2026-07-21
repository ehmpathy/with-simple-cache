# with-simple-cache

![ci_on_commit](https://github.com/ehmpathy/with-simple-cache/workflows/ci_on_commit/badge.svg)
![deploy_on_tag](https://github.com/ehmpathy/with-simple-cache/workflows/deploy_on_tag/badge.svg)

A wrapper that makes it simple to add cache to any function.

Notable features:

- Wrapper pattern for simple and clean usage
- Automatic cache key definition
- Customizable cache data store

# Install

```sh
npm install --save with-simple-cache
```

# Quick start

### Synchronous Cache, Synchronous Logic

in order prevent redundant sync computations from one machine, you can use a synchronous cache

for example:

```ts
import { createCache } from 'simple-in-memory-cache';
import { withSimpleCache } from 'with-simple-cache';

const solveSuperToughMathProblem = withSimpleCache(
  ({ a, b }) => ({ solution: a + b }),
  { cache: createCache() },
);
const result1 = solveSuperToughMathProblem({ a: 1, b: 1 }); // runs the logic, sticks the output into the cache, returns a reference to that output
const result2 = solveSuperToughMathProblem({ a: 1, b: 1 }); // finds the output in the cache, returns a reference to that output
expect(result1).toBe(result2); // same exact object, identified by same reference
```

### Synchronous Cache, Asynchronous Logic

in order to prevent duplicate async requests from one machine, you can use a synchronous cache

for example:

```ts
import { createCache } from 'simple-in-memory-cache';
import { withSimpleCache } from 'with-simple-cache';

const getApiResult = withSimpleCache(
  async ({ name, number }) => axios.get(URL, { name, number }),
  { cache: createCache() },
);
const result1 = getApiResult({ name: 'casey', number: 821 }); // calls the api, puts promise of results into cache, returns that promise
const result2 = getApiResult({ name: 'casey', number: 821 }); // returns the same promise from above, because it was found in cache - since same input as request above was used
expect(result1).toBe(result2); // same exact object - the promise
expect(await result1).toBe(await result2); // same exact object - the result of the promise
```

### Asynchronous Cache, Asynchronous Logic

in order to cache the output of async logic in a persistant store or across machines, you'll likely find you need to use an async cache.

for example
```ts
import { createCache as createOnDiskCache } from 'simple-on-disk-cache';
import { withSimpleCacheAsync } from 'with-simple-cache';

const getApiResult = withSimpleCacheAsync(
  async ({ name, number }) => axios.get(URL, { name, number }),
  { cache: createOnDiskCache() },
);
const result1 = getApiResult({ name: 'casey', number: 821 }); // calls the api, puts promise of results into cache, returns that promise
const result2 = getApiResult({ name: 'casey', number: 821 }); // returns the same promise from above, because it was found in cache - since same input as request above was used
expect(result1).toBe(result2); // same exact object - the promise
expect(await result1).toBe(await result2); // same exact object - the result of the promise
```

*note: this wrapper additionally uses an in-memory cache internally to cache the promise the async cache returns, to prevent duplicate requests*

# Examples

### Add cache to an existing function

```ts
import { createCache } from 'simple-in-memory-cache';
import { withSimpleCache } from 'with-simple-cache';

const getRecipesFromApiWithCache = withSimpleCache(getRecipesFromApi, { cache: createCache() });
```

### Define the function with cache directly

```ts
import { createCache } from 'simple-in-memory-cache';
import { withSimpleCache } from 'with-simple-cache';

const getBookByName = withSimpleCache(
  async (name: string) => {
    /* ... get the book ... */
    return book;
  },
  {
    cache: createCache(),
  },
);
```

### Use a custom persistance layer

local storage, for example:

```ts
import { withSimpleCache } from 'with-simple-cache';

const getRecipesFromApiWithLocalStorageCache = withSimpleCache(getRecipesFromApi, {
  // just define how a cache can `get` from and `set` to this data store
  cache: {
    get: (key) => localStorage.getItem(key),
    set: (key, value) => localStorage.setItem(key, value),
  },
});
```

### Use an asynchronous persistance layer

some extra logic is required in order to work with asynchronous caches. therefore, a different wrapper is available for this usecase: `withSimpleCacheAsync`.

asynchronous cache on-disk, for example:

```ts
import { createCache } from 'simple-on-disk-cache';
import { withSimpleCacheAsync } from 'with-simple-cache';

const getRecipesFromApiWithAsyncCache = withSimpleCacheAsync(getRecipesFromApi, {
  cache: createCache({ directory: { s3: { bucket: '__bucket__', prefix: '__prefix__' } } }),
});
```

### Use a custom key serialization method

serialize the key as the sha hash of the args, for example

```ts
import { createCache } from 'simple-in-memory-cache';
import { withSimpleCache } from 'with-simple-cache';

const getRecipesFromApiWithLocalStorageCache = withSimpleCache(getRecipesFromApi, {
  cache: createCache(),
  serialize: {
    key: (args) =>
        crypto.createHash('sha256').update(JSON.stringify(args)).digest('hex'),
  }
});
```

### Use a custom value serialization and deserialization method

if your cache requires you to store data as a string, as is typically the case with asynchronous caches, you can define how to serialize and deserialize the response of your logic

```ts
import { createCache } from 'simple-on-disk-cache';
import { withSimpleCacheAsync } from 'with-simple-cache';

const getRecipesFromApiWithLocalStorageCache = withSimpleCacheAsync(getRecipesFromApi, {
  cache: createCache({ directory: { s3: { bucket: '__bucket__', prefix: '__prefix__' } } }),
  serialize: {
    value: async (response) => JSON.stringify(await response),
  },
  deserialize: {
    value: async (cached) => JSON.parse(await cached)
  }
});
```

### Define the cache at runtime from function inputs

if your cache is defined as part of the inputs to your function (e.g., via the input context pattern), you can define where to find the cache in the inputs

for example
```ts
import { createCache, SimpleInMemoryCache } from 'simple-in-memory-cache';
import { withSimpleCache } from 'with-simple-cache';

const getBookByName = withSimpleCache(
  async ({ name: string}, context: { cache: SimpleInMemoryCache<Book> }) => {
    /* ... get the book ... */
    return book;
  },
  {
    cache: ({ fromInput }) => fromInput[1].context.cache, // grab the cache from the input's "context" parameter (the second input parameter)
  },
);

const book = await getBookByName({ name: 'Hitchhikers Guide to the Galaxy' }, { cache: createCache() });
```

### Include cache metadata in the response

if you need access to cache metadata (e.g., the cache URI for debug or log purposes), use `meta: 'include'` to return both the output and cache info

note: this requires a cache with a `uri` method (e.g., S3 or on-disk caches that can provide a location)

```ts
import { createCache } from 'simple-on-disk-cache';
import { withSimpleCacheAsync } from 'with-simple-cache';

const fetchReport = withSimpleCacheAsync(
  async ({ reportId }: { reportId: string }) => {
    /* ... fetch report ... */
    return reportData;
  },
  {
    cache: createCache({ directory: { s3: { bucket: 'reports', prefix: 'cache' } } }),
    meta: 'include',
  },
);

const result = await fetchReport({ reportId: 'abc-123' });
// result.output = the report data
// result.cached.uri = 's3://reports/cache/{"reportId":"abc-123"}'

console.log(`Report cached at: ${result.cached.uri}`);
```

this is useful when you want to:
- log where cached data is stored for debug
- pass the cache URI to other systems
- verify cache behavior in tests

### Gate a write on the key's absence (put-if-absent)

opt into a conditional write via the `condition` option (see [Atomic conditional writes](#atomic-conditional-writes) for what these are and when to reach for them). this requires a cache that advertises conditionals (its `get`/`set` accept a `condition`).

set `version: null` to only write if the key is currently absent:

```ts
import { withSimpleCacheAsync } from 'with-simple-cache';

const runOnce = withSimpleCacheAsync(computeExpensiveResult, {
  cache: myConditionalCache, // a cache that supports conditional writes
  condition: {
    version: null, // put-if-absent: only write if the key is currently absent
  },
});
```

### Gate a write on a version match (compare-and-set)

set `version` to a token to only write if the current version matches — for optimistic concurrency, where you read a version, compute, then write only if no one moved the version out from under you.

the token can be a static value, or an extractor over the operation's args:

```ts
import { withSimpleCacheAsync } from 'with-simple-cache';

const updateRecord = withSimpleCacheAsync(computeNextRecord, {
  cache: myConditionalCache,
  condition: {
    version: (input) => input.expectedVersion, // compare-and-set: only write if the current version matches this token
  },
});
```

### Converge when you lose the race

use `exception: 'ignore'` to swallow a precondition miss, re-read the key, and return the winner's value — for when you don't care who wins the race, only that everyone ends up with the same value.

```ts
import { withSimpleCacheAsync } from 'with-simple-cache';

const runOnce = withSimpleCacheAsync(computeExpensiveResult, {
  cache: myConditionalCache,
  condition: {
    version: null,
    exception: 'ignore', // swallow the conflict, re-read, return the winner's value
  },
});

// two racers call at once; one wins the write, the other loses
const result = await runOnce({ id: 'lock' });
// the loser quietly converges on the winner's value, instead of a crash
```

### Recognize a condition conflict across package boundaries

use the exported `isSimpleCacheConditionError` predicate to recognize a re-thrown `SimpleCacheConditionError` — the same cross-package-safe way the wrapper does, without the `instanceof` boundary bug.

```ts
import {
  withSimpleCacheAsync,
  isSimpleCacheConditionError,
} from 'with-simple-cache';

const runOnce = withSimpleCacheAsync(computeExpensiveResult, {
  cache: myConditionalCache,
  condition: { version: null, exception: 'throw' },
});

try {
  await runOnce({ id: 'lock' });
} catch (error) {
  if (isSimpleCacheConditionError(error)) {
    // someone beat us to the write — re-read and converge, or handle as you wish
  } else {
    throw error;
  }
}
```


# Features

### Automatic cache key

The arguments your function is invoked with is used as the cache key, after serialization. For example:

```ts
import { createCache } from 'simple-in-memory-cache';
import { withSimpleCache } from 'with-simple-cache';

const getZodiacSign = withSimpleCache(async ({ birthday }: { birthday: string }) => /* ... */, { cache: createCache() });

getZodiacSign({ birthday: '2020-07-21' }); // here the cache key is `[{"birthday":"2020-07-21"}]`
```

_note: array order **does** matter_

### Customizable cache data store

You can easily use a custom cache or custom data store / persistance layer with this wrapper.

```ts
import { withSimpleCache } from 'with-simple-cache';

const getZodiacSign = withSimpleCache(
  async ({ birthday }: { birthday: string }) => /* ... */,
  {
    cache: {
      get: (key: string) => /* ... how to get from your custom data store ... */,
      set: (key: string, value: any) => /** ... how to set to your custom data store ... */,
    }
  }
);
```

### Atomic conditional writes

By default a cache `set` overwrites whatever is at the key. When two callers race to populate the same key — or you want compare-and-set semantics — an unconditional overwrite is unsafe: the last writer wins, and the first writer's value is silently lost.

A _conditional write_ gates the `set` on a version precondition, so the write only lands if the store is in the state you expect:

- `version: null` → **put-if-absent**: the write lands only if the key is currently absent
- `version: '<token>'` → **compare-and-set**: the write lands only if the current version matches the token

If the precondition does not hold — someone beat you to the write, or the version moved on — the cache signals a conflict with a `SimpleCacheConditionError`. The `exception` option chooses what happens next:

- `'throw'` (default) → propagate the `SimpleCacheConditionError` to the caller
- `'ignore'` → swallow it, re-read the key, and return the winner's value (converge)

This is available on any cache that advertises conditionals (its `get`/`set` accept a `condition`), even a backend from a _separate_ package. Because a cross-package error is a different constructor, use the exported `isSimpleCacheConditionError` predicate — not `instanceof` — to recognize a re-thrown conflict.

See the [conditional write examples](#gate-a-write-on-a-version-precondition) above for usage.
