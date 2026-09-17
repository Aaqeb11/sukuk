/**
 * The screening evaluator.
 *
 * A pure function: no NestJS, no DI, no I/O. The service wraps it; this file
 * is where the actual idea lives, and it should stay trivially testable.
 *
 * Note what is absent — nothing here mentions Shariah, rent, tenants, or
 * Sukuk. It resolves field paths and applies comparisons. Every piece of
 * domain judgement lives in the template a board certified, which is what
 * makes "the board defines the conditions, the software applies them" a
 * literal description rather than a slogan.
 */

import { resolve, isMissing, MISSING } from './field-path.js';
import { operators } from './operators.js';
import type { Asset } from '../assets/asset.types.js';
import type { Condition, Template } from '../templates/template.types.js';

export interface ConditionResult {
  condition_id: string;
  description: string;
  field: string;
  operator: string;
  expected: unknown;
  /** The value found on the asset, or null when the field was absent. */
  actual: unknown;
  passed: boolean;
  reason: string;
}

/**
 * A governance-level failure, distinct from a condition failing.
 *
 * A template past its re-certification date is not "an asset that failed" —
 * it is a template whose authority has lapsed. Conflating the two would let
 * an expired certification quietly keep approving assets.
 */
export interface GovernanceIssue {
  code: 'TEMPLATE_EXPIRED' | 'TEMPLATE_NOT_YET_EFFECTIVE' | 'NO_CONDITIONS';
  message: string;
}

export interface ScreeningResult {
  passed: boolean;
  template_id: string;
  template_version: string;
  asset_id: string;
  evaluated_at: string;

  /** Non-empty means screening failed before any condition was considered. */
  governance: GovernanceIssue[];

  results: ConditionResult[];

  summary: {
    total: number;
    passed: number;
    failed: number;
  };
}

export interface EvaluateOptions {
  /** Injectable for deterministic tests. Defaults to now. */
  now?: Date;
}

function checkGovernance(template: Template, now: Date): GovernanceIssue[] {
  const issues: GovernanceIssue[] = [];
  const { certified_at, expires_at, certified_by } = template.certification;

  const certifiedAt = new Date(certified_at);
  const expiresAt = new Date(expires_at);

  if (Number.isNaN(expiresAt.getTime())) {
    issues.push({
      code: 'TEMPLATE_EXPIRED',
      message: `Template ${template.template_id} has an unreadable expiry date; its certification cannot be verified`,
    });
  } else if (now > expiresAt) {
    issues.push({
      code: 'TEMPLATE_EXPIRED',
      message: `Template ${template.template_id} was certified by ${certified_by} until ${expires_at} and requires re-certification before further screening`,
    });
  }

  if (!Number.isNaN(certifiedAt.getTime()) && now < certifiedAt) {
    issues.push({
      code: 'TEMPLATE_NOT_YET_EFFECTIVE',
      message: `Template ${template.template_id} does not take effect until ${certified_at}`,
    });
  }

  if (template.conditions.length === 0) {
    issues.push({
      code: 'NO_CONDITIONS',
      message: `Template ${template.template_id} defines no conditions, so it cannot screen anything`,
    });
  }

  return issues;
}

function evaluateCondition(asset: Asset, condition: Condition): ConditionResult {
  const actual = resolve(asset, condition.field);
  const operator = operators[condition.op];

  // Guard against a template naming an operator this build does not implement.
  if (!operator) {
    return {
      condition_id: condition.id,
      description: condition.description,
      field: condition.field,
      operator: condition.op,
      expected: condition.value,
      actual: isMissing(actual) ? null : actual,
      passed: false,
      reason: `condition uses unknown operator '${condition.op}'; the template is malformed`,
    };
  }

  const outcome = operator(actual, condition.value, condition.field);

  return {
    condition_id: condition.id,
    description: condition.description,
    field: condition.field,
    operator: condition.op,
    expected: condition.value,
    actual: isMissing(actual) ? null : actual,
    passed: outcome.passed,
    reason: outcome.reason,
  };
}

/**
 * Screens one asset against one certified template.
 *
 * Every condition is evaluated even after one fails — a screening report that
 * stops at the first problem is far less useful than one listing everything
 * wrong with the asset.
 */
export function evaluate(
  asset: Asset,
  template: Template,
  options: EvaluateOptions = {},
): ScreeningResult {
  const now = options.now ?? new Date();
  const governance = checkGovernance(template, now);

  const results =
    governance.length > 0
      ? []
      : template.conditions.map((condition) =>
          evaluateCondition(asset, condition),
        );

  const passedCount = results.filter((r) => r.passed).length;

  return {
    passed: governance.length === 0 && results.every((r) => r.passed),
    template_id: template.template_id,
    template_version: template.version,
    asset_id: asset.asset_id,
    evaluated_at: now.toISOString(),
    governance,
    results,
    summary: {
      total: results.length,
      passed: passedCount,
      failed: results.length - passedCount,
    },
  };
}

export { MISSING };
