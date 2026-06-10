import { IsoDuration } from 'iso-time';

import { SimpleAsyncCache, SimpleSyncCache } from '@src/domain.objects/SimpleCache';

export const createExampleSyncCache = () => {
  const store: Record<string, any> = {};
  const cache: SimpleSyncCache<any> = {
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
  const cache: SimpleAsyncCache<T> = {
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
  const cache: SimpleSyncCache<T> & { uri: (key: string) => string } = {
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
  const cache: SimpleSyncCache<T> = {
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
  const cache: SimpleAsyncCache<T> & { uri: (key: string) => string } = {
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
  const cache: SimpleAsyncCache<T> = {
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
