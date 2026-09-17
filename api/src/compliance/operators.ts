/**
 * Condition operators.
 *
 * Each operator is a pure comparison. None of them know anything about
 * Shariah, assets, or compliance — they compare a resolved value against
 * the value a template specified. All domain meaning lives in the template.
 *
 * Two rules every operator follows:
 *
 *   1. A missing field FAILS (except `exists`). Compliance screening must
 *      reject what it cannot verify rather than waving it through. An asset
 *      that omits `structure.buyback_at_par` has not demonstrated that
 *      buyback is un-guaranteed; it has simply said nothing.
 *
 *   2. A type mismatch FAILS with an explanation rather than throwing.
 *      A malformed asset should produce a readable screening failure, not
 *      a 500.
 */

import { MISSING, describeValue, isMissing, type Resolved } from './field-path.js';
import type { Operator } from '../templates/template.types.js';

export interface OperatorOutcome {
  passed: boolean;
  /** Human-readable, written for a reader rather than a developer. */
  reason: string;
}

type OperatorFn = (
  actual: Resolved,
  expected: unknown,
  field: string,
) => OperatorOutcome;

const fail = (reason: string): OperatorOutcome => ({ passed: false, reason });
const pass = (reason: string): OperatorOutcome => ({ passed: true, reason });

/** Shared guard: every operator except `exists` requires a present value. */
function requirePresent(
  actual: Resolved,
  field: string,
): OperatorOutcome | null {
  if (isMissing(actual)) {
    return fail(`${field} is not present, so the condition cannot be verified`);
  }
  return null;
}

function requireArray(
  expected: unknown,
  field: string,
  op: string,
): OperatorOutcome | null {
  if (!Array.isArray(expected)) {
    return fail(
      `condition on ${field} uses '${op}' but its value is not a list; the template is malformed`,
    );
  }
  return null;
}

function requireNumbers(
  actual: Resolved,
  expected: unknown,
  field: string,
  op: string,
): OperatorOutcome | null {
  if (typeof actual !== 'number') {
    return fail(
      `${field} is ${describeValue(actual)}, which is not a number, so '${op}' cannot be applied`,
    );
  }
  if (typeof expected !== 'number') {
    return fail(
      `condition on ${field} uses '${op}' but its value is not a number; the template is malformed`,
    );
  }
  return null;
}

export const operators: Record<Operator, OperatorFn> = {
  equals: (actual, expected, field) => {
    const missing = requirePresent(actual, field);
    if (missing) return missing;

    return actual === expected
      ? pass(`${field} is ${describeValue(actual)}, as required`)
      : fail(
          `${field} is ${describeValue(actual)}, but must be ${describeValue(expected)}`,
        );
  },

  not_equals: (actual, expected, field) => {
    const missing = requirePresent(actual, field);
    if (missing) return missing;

    return actual !== expected
      ? pass(`${field} is ${describeValue(actual)}, which is permitted`)
      : fail(`${field} is ${describeValue(actual)}, which is not permitted`);
  },

  in: (actual, expected, field) => {
    const missing = requirePresent(actual, field);
    if (missing) return missing;
    const malformed = requireArray(expected, field, 'in');
    if (malformed) return malformed;

    return (expected as unknown[]).includes(actual)
      ? pass(`${field} is ${describeValue(actual)}, which is permitted`)
      : fail(
          `${field} is ${describeValue(actual)}, which is not among the permitted values ${describeValue(expected)}`,
        );
  },

  not_in: (actual, expected, field) => {
    const missing = requirePresent(actual, field);
    if (missing) return missing;
    const malformed = requireArray(expected, field, 'not_in');
    if (malformed) return malformed;

    return !(expected as unknown[]).includes(actual)
      ? pass(`${field} is ${describeValue(actual)}, which is not a prohibited value`)
      : fail(`${field} is ${describeValue(actual)}, which is prohibited`);
  },

  gt: (actual, expected, field) => {
    const bad = requireNumbers(actual, expected, field, 'gt');
    if (bad) return bad;

    return (actual as number) > (expected as number)
      ? pass(`${field} is ${actual}, above the required ${expected}`)
      : fail(`${field} is ${actual}, but must be above ${expected}`);
  },

  gte: (actual, expected, field) => {
    const bad = requireNumbers(actual, expected, field, 'gte');
    if (bad) return bad;

    return (actual as number) >= (expected as number)
      ? pass(`${field} is ${actual}, meeting the minimum of ${expected}`)
      : fail(`${field} is ${actual}, below the minimum of ${expected}`);
  },

  lt: (actual, expected, field) => {
    const bad = requireNumbers(actual, expected, field, 'lt');
    if (bad) return bad;

    return (actual as number) < (expected as number)
      ? pass(`${field} is ${actual}, below the required ${expected}`)
      : fail(`${field} is ${actual}, but must be below ${expected}`);
  },

  lte: (actual, expected, field) => {
    const bad = requireNumbers(actual, expected, field, 'lte');
    if (bad) return bad;

    return (actual as number) <= (expected as number)
      ? pass(`${field} is ${actual}, within the limit of ${expected}`)
      : fail(`${field} is ${actual}, exceeding the limit of ${expected}`);
  },

  /**
   * The one operator that treats absence as data rather than as a failure.
   * `value: true` requires the field to be present; `value: false` requires
   * it to be absent.
   */
  exists: (actual, expected, field) => {
    const shouldExist = expected !== false;
    const present = !isMissing(actual) && actual !== null;

    if (shouldExist) {
      return present
        ? pass(`${field} is present`)
        : fail(`${field} is required but was not provided`);
    }

    return present
      ? fail(`${field} must not be present, but is ${describeValue(actual)}`)
      : pass(`${field} is absent, as required`);
  },
};

export { MISSING };
