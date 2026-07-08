import { IsoDuration } from 'iso-time';

import {
  SimpleCacheAsync,
  SimpleCacheGetOptions,
  SimpleCacheCondition,
  SimpleCacheSetOptions,
  SimpleCacheSync,
  WithCacheConditionals,
  WithCacheUri,
} from '@src/domain.objects/SimpleCache';
import { SimpleCacheConditionError } from '@src/utils/errors/SimpleCacheConditionError';

export const createExampleSyncCache = () => {
  const store: Record<string, any> = {};
  const cache: SimpleCacheSync<any> = {
    set: (
      key: string,
      value: any,
      options?: { expiration?: IsoDuration | null },
    ) => {
      store[key] = options ? { value, options } : { value };
    },
    get: (key: string) => store[key]?.value,
  };
  return { cache, store };
};

export const createExampleAsyncCache = <T>() => {
  const store: Record<string, { value: T; options?: any } | undefined> = {};
  const cache: SimpleCacheAsync<T> = {
    set: async (
      key: string,
      value: T | undefined,
      options?: { expiration?: IsoDuration | null },
    ) => {
      // eslint-disable-next-line no-nested-ternary
      store[key] =
        value !== undefined
          ? options
            ? { value, options }
            : { value }
          : undefined;
    },
    get: async (key: string) => store[key]?.value,
  };
  return { cache, store };
};

/**
 * sync cache WITH uri method — for meta: 'include' tests
 */
export const createExampleSyncCacheWithUri = <T>(baseUri: string) => {
  const store: Record<string, { value: T; options?: any } | undefined> = {};
  const cache: SimpleCacheSync<T> & { uri: (key: string) => string } = {
    set: (
      key: string,
      value: T | undefined,
      options?: { expiration?: IsoDuration | null },
    ) => {
      // eslint-disable-next-line no-nested-ternary
      store[key] =
        value !== undefined
          ? options
            ? { value, options }
            : { value }
          : undefined;
    },
    get: (key: string) => store[key]?.value,
    uri: (key: string) => `${baseUri}/${key}`,
  };
  return { cache, store };
};

/**
 * sync cache WITHOUT uri method — for runtime guard tests
 */
export const createExampleSyncCacheWithoutUri = <T>() => {
  const store: Record<string, { value: T; options?: any } | undefined> = {};
  const cache: SimpleCacheSync<T> = {
    set: (
      key: string,
      value: T | undefined,
      options?: { expiration?: IsoDuration | null },
    ) => {
      // eslint-disable-next-line no-nested-ternary
      store[key] =
        value !== undefined
          ? options
            ? { value, options }
            : { value }
          : undefined;
    },
    get: (key: string) => store[key]?.value,
  };
  return { cache, store };
};

/**
 * async cache WITH uri method — for meta: 'include' tests
 */
export const createExampleAsyncCacheWithUri = <T>(baseUri: string) => {
  const store: Record<string, { value: T; options?: any } | undefined> = {};
  const cache: SimpleCacheAsync<T> & { uri: (key: string) => string } = {
    set: async (
      key: string,
      value: T | undefined,
      options?: { expiration?: IsoDuration | null },
    ) => {
      // eslint-disable-next-line no-nested-ternary
      store[key] =
        value !== undefined
          ? options
            ? { value, options }
            : { value }
          : undefined;
    },
    get: async (key: string) => store[key]?.value,
    uri: (key: string) => `${baseUri}/${key}`,
  };
  return { cache, store };
};

/**
 * async cache WITHOUT uri method — for runtime guard tests
 */
export const createExampleAsyncCacheWithoutUri = <T>() => {
  const store: Record<string, { value: T; options?: any } | undefined> = {};
  const cache: SimpleCacheAsync<T> = {
    set: async (
      key: string,
      value: T | undefined,
      options?: { expiration?: IsoDuration | null },
    ) => {
      // eslint-disable-next-line no-nested-ternary
      store[key] =
        value !== undefined
          ? options
            ? { value, options }
            : { value }
          : undefined;
    },
    get: async (key: string) => store[key]?.value,
  };
  return { cache, store };
};

/**
 * a store entry for a conditional cache — tracks the opaque version alongside the value
 */
type ConditionalStoreEntry<T> = { value: T; version: string; options?: any };

/**
 * .what = assert a version precondition holds against the current version
 * .why  = the shared compare-and-set gate for the conditional backends, so each factory
 *         checks the precondition the same way; throws SimpleCacheConditionError on a miss
 */
const assertConditionMet = (input: {
  key: string;
  condition: SimpleCacheCondition;
  found: string | undefined;
}): void => {
  const { key, condition, found } = input;

  // must-be-absent precondition (version: null)
  if (condition.version === null) {
    if (found !== undefined)
      throw new SimpleCacheConditionError(
        'cache condition failed: expected key to be absent',
        { key, condition, found },
      );
    return;
  }

  // must-match precondition (version: token)
  if (found !== condition.version)
    throw new SimpleCacheConditionError(
      'cache condition failed: version mismatch',
      { key, condition, found },
    );
};

/**
 * .what = sync cache WITH conditional-write capability
 * .why  = gives scope=conditionals + meta version tests a real compare-and-set backend
 *         (no mocks) — each write mints a fresh opaque version token, and get/set honor
 *         an optional version precondition (throws on a miss)
 */
export const createExampleSyncCacheWithConditionals = <T>() => {
  const store: Record<string, ConditionalStoreEntry<T> | undefined> = {};
  // .note = deliberate mutation — a monotonic version counter for this stateful store
  //         simulation (inherent, like the mutated `store` it sits beside)
  let versionCount = 0;
  const nextVersion = () => `v${(versionCount += 1)}`;
  const cache: WithCacheConditionals<SimpleCacheSync<T>> = {
    set: (
      key: string,
      value: T | undefined,
      options?: SimpleCacheSetOptions<SimpleCacheCondition>,
    ) => {
      // gate the write on the precondition, if any
      if (options?.condition)
        assertConditionMet({
          key,
          condition: options.condition,
          found: store[key]?.version,
        });

      // undefined value = delete
      if (value === undefined) {
        store[key] = undefined;
        return;
      }

      // mint a fresh version for the write
      store[key] = { value, version: nextVersion(), options };
    },
    get: (
      key: string,
      options?: SimpleCacheGetOptions<SimpleCacheCondition>,
    ) => {
      // check the precondition against the current version, if any
      if (options?.condition)
        assertConditionMet({
          key,
          condition: options.condition,
          found: store[key]?.version,
        });
      return store[key]?.value;
    },
    version: (key: string) => store[key]?.version,
  };
  return { cache, store };
};

/**
 * .what = async cache WITH conditional-write capability
 * .why  = the async twin of the sync backend, so the async wrapper's conditionals suite
 *         has a real compare-and-set backend (symmetry per rule.require.wrapper-symmetry)
 */
export const createExampleAsyncCacheWithConditionals = <T>() => {
  const store: Record<string, ConditionalStoreEntry<T> | undefined> = {};
  // .note = deliberate mutation — a monotonic version counter for this stateful store
  //         simulation (inherent, like the mutated `store` it sits beside)
  let versionCount = 0;
  const nextVersion = () => `v${(versionCount += 1)}`;
  const cache: WithCacheConditionals<SimpleCacheAsync<T>> = {
    set: async (
      key: string,
      value: T | undefined,
      options?: SimpleCacheSetOptions<SimpleCacheCondition>,
    ) => {
      // gate the write on the precondition, if any
      if (options?.condition)
        assertConditionMet({
          key,
          condition: options.condition,
          found: store[key]?.version,
        });

      // undefined value = delete
      if (value === undefined) {
        store[key] = undefined;
        return;
      }

      // mint a fresh version for the write
      store[key] = { value, version: nextVersion(), options };
    },
    get: async (
      key: string,
      options?: SimpleCacheGetOptions<SimpleCacheCondition>,
    ) => {
      // check the precondition against the current version, if any
      if (options?.condition)
        assertConditionMet({
          key,
          condition: options.condition,
          found: store[key]?.version,
        });
      return store[key]?.value;
    },
    version: async (key: string) => store[key]?.version,
  };
  return { cache, store };
};

/**
 * .what = sync cache WITH both uri and conditional-write capability
 * .why  = proves the CacheMetaOutput composite ({ uri, version }) surfaces both capabilities
 *         at once when meta: 'include'
 */
export const createExampleSyncCacheWithUriAndConditionals = <T>(
  baseUri: string,
) => {
  const store: Record<string, ConditionalStoreEntry<T> | undefined> = {};
  // .note = deliberate mutation — a monotonic version counter for this stateful store
  //         simulation (inherent, like the mutated `store` it sits beside)
  let versionCount = 0;
  const nextVersion = () => `v${(versionCount += 1)}`;
  const cache: WithCacheConditionals<WithCacheUri<SimpleCacheSync<T>>> = {
    set: (
      key: string,
      value: T | undefined,
      options?: SimpleCacheSetOptions<SimpleCacheCondition>,
    ) => {
      if (options?.condition)
        assertConditionMet({
          key,
          condition: options.condition,
          found: store[key]?.version,
        });
      if (value === undefined) {
        store[key] = undefined;
        return;
      }
      store[key] = { value, version: nextVersion(), options };
    },
    get: (
      key: string,
      options?: SimpleCacheGetOptions<SimpleCacheCondition>,
    ) => {
      if (options?.condition)
        assertConditionMet({
          key,
          condition: options.condition,
          found: store[key]?.version,
        });
      return store[key]?.value;
    },
    version: (key: string) => store[key]?.version,
    uri: (key: string) => `${baseUri}/${key}`,
  };
  return { cache, store };
};

/**
 * .what = async cache WITH both uri and conditional-write capability
 * .why  = the async twin of the uri+conditionals backend, so the async wrapper can prove
 *         the same CacheMetaOutput composite ({ uri, version }) shape (symmetry)
 */
export const createExampleAsyncCacheWithUriAndConditionals = <T>(
  baseUri: string,
) => {
  const store: Record<string, ConditionalStoreEntry<T> | undefined> = {};
  // .note = deliberate mutation — a monotonic version counter for this stateful store
  //         simulation (inherent, like the mutated `store` it sits beside)
  let versionCount = 0;
  const nextVersion = () => `v${(versionCount += 1)}`;
  const cache: WithCacheConditionals<WithCacheUri<SimpleCacheAsync<T>>> = {
    set: async (
      key: string,
      value: T | undefined,
      options?: SimpleCacheSetOptions<SimpleCacheCondition>,
    ) => {
      if (options?.condition)
        assertConditionMet({
          key,
          condition: options.condition,
          found: store[key]?.version,
        });
      if (value === undefined) {
        store[key] = undefined;
        return;
      }
      store[key] = { value, version: nextVersion(), options };
    },
    get: async (
      key: string,
      options?: SimpleCacheGetOptions<SimpleCacheCondition>,
    ) => {
      if (options?.condition)
        assertConditionMet({
          key,
          condition: options.condition,
          found: store[key]?.version,
        });
      return store[key]?.value;
    },
    version: async (key: string) => store[key]?.version,
    uri: (key: string) => `${baseUri}/${key}`,
  };
  return { cache, store };
};
