# with-simple-cache

## .what

wrappers that add cache to sync and async functions: `withSimpleCache` and `withSimpleCacheAsync`.

## .options

### cache

the cache to persist outputs. accepts two forms:

**static cache instance**
```ts
const cachedFn = withSimpleCacheAsync(logic, {
  cache: myCache,
});
```

**dynamic cache extraction** (from function args)
```ts
const cachedFn = withSimpleCacheAsync(logic, {
  cache: ({ fromInput }) => fromInput[1].cache,
});
```

the extraction function receives `{ fromInput: args }` where `args` is the array of parameters passed to the wrapped function. use `fromInput[0]` for the first arg (input), `fromInput[1]` for the second arg (context), etc.

**why dynamic extraction?**

when the cache comes from context (e.g., `context.cache`), and context is passed as an argument to the function, you cannot reference `context` at wrapper definition time. the extraction function defers cache resolution until the function is called.

```ts
// pattern: cache comes from context arg
const _runPlay = async (
  input: { query: string },
  context: { cache: SimpleCache<string> },
): Promise<string> => {
  return fetchData(input.query);
};

const runPlay = withSimpleCacheAsync(_runPlay, {
  cache: ({ fromInput }) => fromInput[1].cache,
  serialize: {
    key: (input) => input.query,
  },
});

// caller provides cache via context
const result = await runPlay(
  { query: 'test' },
  { cache: myS3Cache },
);
```

### serialize

custom serialization for keys and values.

```ts
{
  serialize: {
    key: (input, context) => input.query,  // custom key from first two args
    value: (output) => JSON.stringify(output),  // transform before cache
  },
}
```

### deserialize

custom deserialization for cached values.

```ts
{
  deserialize: {
    value: (cached) => JSON.parse(cached),  // transform after cache get
  },
}
```

### expiration

cache ttl using `UniDuration`.

```ts
{
  expiration: { hours: 1 },
}
```

### bypass

conditional cache bypass for get and set operations.

```ts
{
  bypass: {
    get: (args) => args[0].forceRefresh === true,
    set: (args) => args[0].skipPersist === true,
  },
}
```

## .async-specific options

`withSimpleCacheAsync` supports an expanded cache option with deduplication:

```ts
{
  cache: {
    output: myS3Cache,  // or extraction function
    deduplication: myInMemoryCache,  // for parallel request deduplication
  },
}
```

## .type signatures

```ts
type SimpleCacheExtractionMethod<LI extends any[], C> =
  (args: { fromInput: LI }) => C;

type WithSimpleCacheChoice<LI extends any[], C> =
  C | SimpleCacheExtractionMethod<LI, C>;
```

## .examples

### static cache (module-level)

```ts
import { createCache } from 'simple-in-memory-cache';

const cache = createCache({ expiration: { minutes: 5 } });

const cachedGetUser = withSimpleCache(getUser, { cache });
```

### dynamic cache (from context)

```ts
const _downloadCsv = async (
  input: { searchId: string },
  context: { artifact: { cache: { instance: SimpleCache<string> } } },
): Promise<string> => {
  return fetchCsv(input.searchId);
};

const downloadCsv = withSimpleCacheAsync(_downloadCsv, {
  cache: ({ fromInput }) => fromInput[1].artifact.cache.instance,
  serialize: {
    key: (input) => `csv:${input.searchId}`,
  },
});
```
