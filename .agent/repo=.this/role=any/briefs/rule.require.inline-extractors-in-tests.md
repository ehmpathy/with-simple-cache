# rule.require.inline-extractors-in-tests

## .what

tests for cache extraction functions must use inline extractors, not named function variables.

## .why

the wish declares ergonomics for inline extraction:

```typescript
// wish: inline extraction
cache: (_input, context) => context.artifact.cache.instance
```

tests must prove this ergonomic works. if tests use named variables, they do not verify the inline pattern compiles.

## .pattern

### good — inline extractor

```typescript
const wrapped = withSimpleCacheAsync(
  async (_input: Input, _context: Context): Promise<string> => 'result',
  {
    cache: (_input: Input, context: Context) => context.cache,
    meta: 'include',
  },
);
```

### bad — named extractor variable

```typescript
const extractCache = (
  _input: Input,
  context: Context,
): WithCacheUri<SimpleCache<string>> => context.cache;

const wrapped = withSimpleCacheAsync(
  async (_input: Input, _context: Context): Promise<string> => 'result',
  {
    cache: extractCache,  // named variable hides type inference issues
    meta: 'include',
  },
);
```

## .why named variables hide issues

when you annotate return type on `extractCache`, TypeScript uses that annotation directly. it does not test whether the inline arrow's return type would be inferred correctly.

inline extractors prove the type system infers correctly without explicit annotation.

## .enforcement

named extractor variable in test = blocker
