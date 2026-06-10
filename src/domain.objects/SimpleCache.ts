import type { IsoDuration } from 'iso-time';

/**
 * a simple cache which synchronously gets and sets values to its store
 */
export interface SimpleSyncCache<T> {
  get: (key: string) => T | undefined;
  set: (
    key: string,
    value: T | undefined,
    options?: { expiration?: IsoDuration | null },
  ) => void;
}

/**
 * a simple cache which asynchronously gets and sets values to its store
 */
export interface SimpleAsyncCache<T> {
  get: (key: string) => Promise<T | undefined>;
  set: (
    key: string,
    value: T | undefined,
    options?: { expiration?: IsoDuration | null },
  ) => Promise<void>;
}

/**
 * a simple cache
 */
export type SimpleCache<T> = SimpleAsyncCache<T> | SimpleSyncCache<T>;

/**
 * intersect any SimpleCache with uri resolution capability
 *
 * use this type when you need to require a cache that can expose its storage location
 */
export type WithCacheUri<TCache extends SimpleCache<any>> = TCache & {
  /**
   * compute the URI for a given cache key
   *
   * @returns the full URI where this key is stored (e.g., 's3://bucket/prefix/key')
   */
  uri: (key: string) => string;
};

/**
 * detect if cache has uri method
 */
export type HasCacheUri<C> = C extends { uri: (key: string) => string }
  ? true
  : false;
