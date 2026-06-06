# rule.require.wrapper-symmetry

## .what

`withSimpleCache` and `withSimpleCacheAsync` must be maximally symmetric.

## .why

- predictable api — users learn one pattern, apply to both
- reduced maintenance — features added to one must be added to the other
- type safety — same type constraints apply to both

## .scope

applies to:
- options interfaces
- return types
- conditional type constraints (e.g., `meta: 'include'` requires `WithCacheUri`)
- runtime guards
- test coverage

## .enforcement

| violation | severity |
|-----------|----------|
| feature in one wrapper but not the other | blocker |
| different option names for same behavior | blocker |
| different type constraints | blocker |
| asymmetric test coverage | blocker |

## .examples

### positive — symmetric

```ts
// both wrappers support same meta option
withSimpleCache(syncFn, { cache, meta: 'include' });
withSimpleCacheAsync(asyncFn, { cache, meta: 'include' });

// both wrappers require same type constraint
context: { cache: WithCacheUri<SimpleCache<T>> }  // works for both
```

### negative — asymmetric

```ts
// only async has meta option — violation
withSimpleCacheAsync(fn, { cache, meta: 'include' });  // allowed
withSimpleCache(fn, { cache, meta: 'include' });       // not implemented
```
