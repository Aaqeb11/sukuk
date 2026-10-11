/**
 * Dot-notation field resolution.
 *
 * Conditions address asset fields by path ("tenant.activity") rather than by
 * a typed accessor. That is what keeps the evaluator ignorant of asset shape:
 * a board can write a condition against a field this codebase has never heard
 * of, and it resolves without a code change.
 */

/** Distinguishes "the field is missing" from "the field holds undefined". */
export const MISSING = Symbol('missing');

export type Resolved = unknown | typeof MISSING;

/**
 * Walks a dot-notation path into an object.
 *
 * Returns MISSING if any segment of the path does not exist, rather than
 * undefined — the caller needs to tell an absent field apart from a present
 * one holding undefined, because compliance screening treats them differently.
 *
 *   resolve({ tenant: { activity: 'logistics' } }, 'tenant.activity')
 *     -> 'logistics'
 *
 *   resolve({ tenant: {} }, 'tenant.activity')
 *     -> MISSING
 *
 *   resolve({}, 'tenant.activity')
 *     -> MISSING
 */
export function resolve(source: unknown, path: string): Resolved {
  if (path.length === 0) return MISSING;

  const segments = path.split('.');
  let current: unknown = source;

  for (const segment of segments) {
    if (current === null || current === undefined) return MISSING;
    if (typeof current !== 'object') return MISSING;

    // Arrays are addressed by numeric segment ("holders.0.name").
    const container = current as Record<string, unknown>;
    if (!(segment in container)) return MISSING;

    current = container[segment];
  }

  return current;
}

export function isMissing(value: Resolved): value is typeof MISSING {
  return value === MISSING;
}

/** Renders a resolved value for inclusion in a human-readable reason. */
export function describeValue(value: Resolved): string {
  if (isMissing(value)) return 'not present';
  if (value === null) return 'null';
  if (typeof value === 'string') return `'${value}'`;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
