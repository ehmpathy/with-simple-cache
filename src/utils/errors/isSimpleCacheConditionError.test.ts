import { ConstraintError } from 'helpful-errors';
import { given, then, when } from 'test-fns';

import { ForeignSimpleCacheConditionError } from '@src/.test.assets/ForeignSimpleCacheConditionError';
import { isSimpleCacheConditionError as isSimpleCacheConditionErrorPublic } from '@src/index';

import { isSimpleCacheConditionError } from './isSimpleCacheConditionError';
import { SimpleCacheConditionError } from './SimpleCacheConditionError';

describe('isSimpleCacheConditionError', () => {
  given('[case1] our own SimpleCacheConditionError', () => {
    when('[t0] the predicate is applied', () => {
      then('it returns true', () => {
        const error = new SimpleCacheConditionError('conflict', {
          key: 'k',
          condition: { version: null },
          found: undefined,
        });
        expect(isSimpleCacheConditionError(error)).toEqual(true);
      });
    });
  });

  given(
    '[case2] a cross-package SimpleCacheConditionError (same name, different constructor)',
    () => {
      when('[t0] the predicate is applied', () => {
        then('instanceof fails but the predicate still recognizes it', () => {
          const error = new ForeignSimpleCacheConditionError('conflict', {
            note: 'from another package',
          });

          // instanceof fails across the boundary — the exact bug we fix
          expect(error instanceof SimpleCacheConditionError).toEqual(false);
          // but the structural name check recognizes it
          expect(isSimpleCacheConditionError(error)).toEqual(true);
        });
      });
    },
  );

  given('[case3] a plain Error', () => {
    when('[t0] the predicate is applied', () => {
      then('it returns false', () => {
        expect(isSimpleCacheConditionError(new Error('nope'))).toEqual(false);
      });
    });
  });

  given('[case4] a differently-named ConstraintError', () => {
    when('[t0] the predicate is applied', () => {
      then('it returns false', () => {
        const error = new ConstraintError('some other constraint', {});
        expect(isSimpleCacheConditionError(error)).toEqual(false);
      });
    });
  });

  given('[case5] a non-error object that merely looks similar', () => {
    when('[t0] the predicate is applied', () => {
      then('it returns false (the instanceof Error floor rejects it)', () => {
        const notAnError = {
          constructor: { name: 'SimpleCacheConditionError' },
        };
        expect(isSimpleCacheConditionError(notAnError)).toEqual(false);
      });
    });
  });

  given('[case6] null and undefined', () => {
    when('[t0] the predicate is applied', () => {
      then('it returns false for both', () => {
        expect(isSimpleCacheConditionError(null)).toEqual(false);
        expect(isSimpleCacheConditionError(undefined)).toEqual(false);
      });
    });
  });

  given(
    '[case7] our own error but with a mangled class name (the accepted interim limitation)',
    () => {
      when('[t0] the predicate is applied', () => {
        then(
          'it returns false: a name-mangle bundler defeats the discriminator, by design of the interim',
          () => {
            // simulate a bundler that renames the class (e.g. terser with keep_classnames off):
            // the instance is genuinely our error, but its constructor.name is now 'a'
            const error = new SimpleCacheConditionError('conflict', {
              key: 'k',
              condition: { version: null },
              found: undefined,
            });
            Object.defineProperty(error.constructor, 'name', { value: 'a' });

            // the name-only interim cannot recognize it once the name is gone — this locks the
            // known boundary. the registered-symbol brand (deferred) is the mitigation path
            expect(isSimpleCacheConditionError(error)).toEqual(false);
          },
        );
      });
    },
  );

  given(
    '[case8] an unrelated Error that merely reuses the leaf name but is NOT a ConstraintError',
    () => {
      when('[t0] the predicate is applied', () => {
        then(
          'it returns false: the ConstraintError-ancestry guard rejects the impostor',
          () => {
            // an Error subclass whose name is spoofed to ours, but whose ancestry lacks
            // ConstraintError — e.g. a backend's internal error that coincidentally reuses the name
            class ImpostorError extends Error {}
            Object.defineProperty(ImpostorError, 'name', {
              value: 'SimpleCacheConditionError',
            });
            const error = new ImpostorError(
              'not actually a condition conflict',
            );

            // leaf name matches, but no ConstraintError ancestor → not our conflict → not swallowed
            expect(error.constructor.name).toEqual('SimpleCacheConditionError');
            expect(isSimpleCacheConditionError(error)).toEqual(false);
          },
        );
      });
    },
  );

  given(
    '[case9] a subclass of our SimpleCacheConditionError (the accepted narrowed scope vs old instanceof)',
    () => {
      when('[t0] the predicate is applied', () => {
        then(
          'it returns false: the leaf-name check does not match subclasses, by design of the interim',
          () => {
            // a subclass has its own constructor.name ('SubCacheConditionError'), so the leaf-name
            // discriminator misses it — the deliberate narrowed scope vs the old instanceof check
            class SubCacheConditionError extends SimpleCacheConditionError {}
            const error = new SubCacheConditionError('sub', {
              key: 'k',
              condition: { version: null },
              found: undefined,
            });

            expect(error.constructor.name).toEqual('SubCacheConditionError');
            expect(isSimpleCacheConditionError(error)).toEqual(false);
          },
        );
      });
    },
  );

  given(
    '[case10] a conflict from a *duplicate copy* of helpful-errors (the scenario the ancestry walk exists for)',
    () => {
      when('[t0] the predicate is applied', () => {
        then(
          'it returns true via the name-based ancestry walk, though instanceof against our ConstraintError fails',
          () => {
            // simulate a backend that bundled its own copy of helpful-errors: a ConstraintError
            // with the same name but a *different* constructor identity than the one we import
            class ForeignConstraintError extends Error {}
            Object.defineProperty(ForeignConstraintError, 'name', {
              value: 'ConstraintError',
            });
            class ForeignCondError extends ForeignConstraintError {}
            Object.defineProperty(ForeignCondError, 'name', {
              value: 'SimpleCacheConditionError',
            });
            const error = new ForeignCondError('cross-copy conflict');

            // instanceof against OUR ConstraintError fails — this is the exact duplicate-copy weakness
            expect(error instanceof ConstraintError).toEqual(false);
            // but the name-based leaf + ancestry checks recognize it across the copy boundary
            expect(error.constructor.name).toEqual('SimpleCacheConditionError');
            expect(isSimpleCacheConditionError(error)).toEqual(true);
          },
        );
      });
    },
  );

  given(
    '[case11] the predicate is exported from the package public surface',
    () => {
      when('[t0] imported from the package index', () => {
        then(
          'it is the same predicate: callers get a cross-package-safe recognition tool',
          () => {
            // the export exists and is the exact same function the wrapper guards use, so a caller
            // that catches an `exception: throw` conflict recognizes it the same way the wrapper does
            expect(isSimpleCacheConditionErrorPublic).toBe(
              isSimpleCacheConditionError,
            );

            // and it works on a cross-package error the caller could not recognize via instanceof
            const error = new ForeignSimpleCacheConditionError('conflict', {
              note: 'thrown by a backend in another package',
            });
            expect(error).not.toBeInstanceOf(SimpleCacheConditionError);
            expect(isSimpleCacheConditionErrorPublic(error)).toEqual(true);
          },
        );
      });
    },
  );
});
