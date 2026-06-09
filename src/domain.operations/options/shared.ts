/**
 * enumerates the extendable methods which can trigger cache operations
 */
export enum WithExtendableCacheTrigger {
  EXECUTE = 'EXECUTE',
  INVALIDATE = 'INVALIDATE',
  UPDATE = 'UPDATE',
}

/**
 * a simple typeguard which checks if an object has a property named `forInput`
 */
export const hasForInputProperty = (obj: any): obj is { forInput: any } =>
  !!obj.forInput;
