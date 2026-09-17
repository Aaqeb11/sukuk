/**
 * A Shariah-certified template.
 *
 * The premise: a Shariah board certifies a template ONCE — a named set of
 * conditions an asset must satisfy. Every asset afterwards is screened against
 * those conditions automatically, without another board engagement.
 *
 * The board defines the conditions. This service applies and audits them.
 * Nothing here decides what is or is not compliant.
 */

/** Comparison operators available to a condition. */
export const OPERATORS = [
  'equals',
  'not_equals',
  'in',
  'not_in',
  'gt',
  'gte',
  'lt',
  'lte',
  'exists',
] as const;

export type Operator = (typeof OPERATORS)[number];

/**
 * One condition an asset must satisfy.
 *
 * `field` is a dot-notation path into the asset document, so conditions can
 * address nested values (`income.type`, `tenant.activity`) without the
 * evaluator knowing anything about asset structure.
 */
export interface Condition {
  /** Stable identifier, unique within the template. Referenced in results. */
  id: string;

  /** Dot-notation path into the asset, e.g. "tenant.activity". */
  field: string;

  op: Operator;

  /**
   * The value to compare against. Shape depends on the operator:
   *   - in / not_in            → array
   *   - gt / gte / lt / lte    → number
   *   - equals / not_equals    → primitive
   *   - exists                 → boolean (true = must be present)
   */
  value: unknown;

  /**
   * Human-readable statement of what this condition requires.
   * Surfaced in screening results and in the UI, so write it for a reader
   * rather than a developer.
   */
  description: string;
}

/**
 * Governance metadata. Without this the "certify once" model has no audit
 * trail — you could not answer who approved these conditions or when they
 * stop being valid.
 */
export interface Certification {
  /** The Shariah Supervisory Board or scholar that certified the template. */
  certified_by: string;

  /** ISO 8601 date of certification. */
  certified_at: string;

  /**
   * ISO 8601 date after which this template must be re-certified.
   * Real frameworks re-confirm periodically rather than certifying once
   * and never revisiting.
   */
  expires_at: string;

  /** Optional reference to the fatwa or certification document. */
  reference?: string;
}

export interface Template {
  template_id: string;

  /** Bump when conditions change. Screening results record the version used. */
  version: string;

  name: string;

  /** What kind of structure this template covers, e.g. "diminishing-musharaka". */
  structure: string;

  certification: Certification;

  conditions: Condition[];
}
