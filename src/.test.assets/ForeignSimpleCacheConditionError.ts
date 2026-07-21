import { ConstraintError } from 'helpful-errors';

/**
 * .what = a stand-in for a SimpleCacheConditionError thrown by a conditional cache backend
 *   that lives in a *separate* package
 * .why =
 *   - same class name as our SimpleCacheConditionError, but a *different constructor* — exactly
 *     the shape that defeats `instanceof SimpleCacheConditionError` and forces the structural
 *     name check that isSimpleCacheConditionError performs
 *   - shared across the predicate test and both wrapper conditionals tests so the cross-package
 *     fixture is defined once (the repo's .test.assets convention)
 * .note = the static `name` is overridden to 'SimpleCacheConditionError' so constructor.name
 *   matches, while the constructor identity stays distinct from ours
 */
export class ForeignSimpleCacheConditionError extends ConstraintError<{
  note: string;
}> {}
// override the class name to the spoofed value via defineProperty — a `static get name()`
// does not type-check (TS2699: conflicts with the built-in Function.name), so the property
// descriptor is the sound way. HelpfulError reads new.target.name at construction, so this
// makes the fixture render and discriminate exactly like a real cross-package error
Object.defineProperty(ForeignSimpleCacheConditionError, 'name', {
  value: 'SimpleCacheConditionError',
});
