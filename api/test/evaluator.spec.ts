import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { evaluate } from '../src/compliance/evaluator.js';
import type { Template } from '../src/templates/template.types.js';
import type { Asset } from '../src/assets/asset.types.js';

/**
 * Loads the REAL template and fixtures from disk rather than inlining copies.
 *
 * This matters: if the template is edited later and a fixture stops matching,
 * these tests fail. Inlined copies would keep passing while the demo broke.
 */
const ROOT = join(__dirname, '..');

function loadTemplate(id: string): Template {
  return JSON.parse(
    readFileSync(join(ROOT, 'src', 'templates', `${id}.json`), 'utf8'),
  ) as Template;
}

function loadAsset(id: string): Asset {
  return JSON.parse(
    readFileSync(join(ROOT, 'fixtures', `${id}.json`), 'utf8'),
  ) as Asset;
}

const template = loadTemplate('ijara-real-estate-v1');

/** Inside the template's certification window, so governance always passes. */
const DURING_CERTIFICATION = new Date('2026-06-01T00:00:00Z');

describe('evaluate — demo fixtures', () => {
  it('AST-001 passes every condition', () => {
    const result = evaluate(loadAsset('AST-001'), template, {
      now: DURING_CERTIFICATION,
    });

    expect(result.passed).toBe(true);
    expect(result.governance).toHaveLength(0);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.passed).toBe(template.conditions.length);
  });

  it('AST-002 passes despite incidental impure income under the limit', () => {
    const asset = loadAsset('AST-002');
    const result = evaluate(asset, template, { now: DURING_CERTIFICATION });

    expect(result.passed).toBe(true);

    // The interesting part: impure income is non-zero but within tolerance.
    const impure = result.results.find(
      (r) => r.condition_id === 'impure-income-limit',
    );
    expect(impure?.passed).toBe(true);
    expect(impure?.actual).toBe(0.031);
  });

  it('AST-003 fails on the four structural conditions', () => {
    const result = evaluate(loadAsset('AST-003'), template, {
      now: DURING_CERTIFICATION,
    });

    expect(result.passed).toBe(false);

    const failed = result.results.filter((r) => !r.passed).map((r) => r.condition_id);

    // This asset is a conventional loan wearing a lease. It should fail for
    // exactly these reasons — if the set changes, the demo narrative changes.
    expect(failed.sort()).toEqual(
      [
        'impure-income-limit',
        'no-guaranteed-principal',
        'ownership-risk',
        'tenant-activity',
      ].sort(),
    );
    expect(result.summary.failed).toBe(4);
  });

  it('evaluates every condition rather than stopping at the first failure', () => {
    const result = evaluate(loadAsset('AST-003'), template, {
      now: DURING_CERTIFICATION,
    });

    // A short-circuiting evaluator would return 1 result. The screening
    // report is far more useful listing everything wrong with the asset.
    expect(result.results).toHaveLength(template.conditions.length);
  });

  it('gives a readable reason naming the field and the actual value', () => {
    const result = evaluate(loadAsset('AST-003'), template, {
      now: DURING_CERTIFICATION,
    });

    const guaranteed = result.results.find(
      (r) => r.condition_id === 'no-guaranteed-principal',
    );

    expect(guaranteed?.passed).toBe(false);
    expect(guaranteed?.reason).toContain('structure.buyback_at_par');
    expect(guaranteed?.reason.length).toBeGreaterThan(20);
    // The board's own wording is carried through to the result.
    expect(guaranteed?.description).toContain('face value');
  });
});

describe('evaluate — result shape', () => {
  it('echoes the template and asset identifiers', () => {
    const result = evaluate(loadAsset('AST-001'), template, {
      now: DURING_CERTIFICATION,
    });

    expect(result.template_id).toBe('ijara-real-estate-v1');
    expect(result.template_version).toBe(template.version);
    expect(result.asset_id).toBe('AST-001');
    expect(result.evaluated_at).toBe(DURING_CERTIFICATION.toISOString());
  });

  it('summary counts reconcile with the results array', () => {
    const result = evaluate(loadAsset('AST-003'), template, {
      now: DURING_CERTIFICATION,
    });

    expect(result.summary.total).toBe(result.results.length);
    expect(result.summary.passed + result.summary.failed).toBe(
      result.summary.total,
    );
  });

  it('represents an absent field as null so it survives JSON serialisation', () => {
    // MISSING is a Symbol, and Symbols vanish silently through JSON.stringify.
    const bare: Asset = {
      asset_id: 'AST-BARE',
      asset_type: 'real_estate',
      name: 'Nothing but identifiers',
    };

    const result = evaluate(bare, template, { now: DURING_CERTIFICATION });
    const tenant = result.results.find((r) => r.condition_id === 'tenant-activity');

    expect(tenant?.actual).toBeNull();
    expect(JSON.parse(JSON.stringify(result)).results[5].actual).toBeNull();
  });

  it('fails an asset that omits the fields conditions address', () => {
    const bare: Asset = {
      asset_id: 'AST-BARE',
      asset_type: 'real_estate',
      name: 'Nothing but identifiers',
    };

    const result = evaluate(bare, template, { now: DURING_CERTIFICATION });

    // Screening must reject what it cannot verify. Silence is not a pass.
    expect(result.passed).toBe(false);
    expect(result.summary.failed).toBeGreaterThan(0);
  });
});

describe('evaluate — governance', () => {
  const AFTER_EXPIRY = new Date('2028-01-01T00:00:00Z');
  const BEFORE_CERTIFICATION = new Date('2025-01-01T00:00:00Z');

  it('refuses to screen against an expired template', () => {
    const result = evaluate(loadAsset('AST-001'), template, {
      now: AFTER_EXPIRY,
    });

    expect(result.passed).toBe(false);
    expect(result.governance).toHaveLength(1);
    expect(result.governance[0].code).toBe('TEMPLATE_EXPIRED');

    // No conditions are evaluated — the board's authority has lapsed, so
    // the question of whether the asset complies does not arise.
    expect(result.results).toHaveLength(0);
  });

  it('names the certifying board and the expiry date in the message', () => {
    const result = evaluate(loadAsset('AST-001'), template, {
      now: AFTER_EXPIRY,
    });

    expect(result.governance[0].message).toContain(
      template.certification.certified_by,
    );
    expect(result.governance[0].message).toContain(
      template.certification.expires_at,
    );
  });

  it('refuses to screen against a template that is not yet effective', () => {
    const result = evaluate(loadAsset('AST-001'), template, {
      now: BEFORE_CERTIFICATION,
    });

    expect(result.passed).toBe(false);
    expect(result.governance.map((g) => g.code)).toContain(
      'TEMPLATE_NOT_YET_EFFECTIVE',
    );
  });

  it('rejects a template with no conditions', () => {
    const empty: Template = { ...template, conditions: [] };
    const result = evaluate(loadAsset('AST-001'), empty, {
      now: DURING_CERTIFICATION,
    });

    expect(result.passed).toBe(false);
    expect(result.governance.map((g) => g.code)).toContain('NO_CONDITIONS');
  });

  it('flags an unreadable expiry date rather than assuming validity', () => {
    const malformed: Template = {
      ...template,
      certification: { ...template.certification, expires_at: 'not-a-date' },
    };

    const result = evaluate(loadAsset('AST-001'), malformed, {
      now: DURING_CERTIFICATION,
    });

    expect(result.passed).toBe(false);
    expect(result.governance[0].code).toBe('TEMPLATE_EXPIRED');
  });
});

describe('evaluate — malformed templates', () => {
  it('fails readably on an operator this build does not implement', () => {
    const malformed = {
      ...template,
      conditions: [
        {
          id: 'bogus',
          field: 'asset_type',
          op: 'approximately' as never,
          value: 'real_estate',
          description: 'Nonsense operator',
        },
      ],
    } as Template;

    const result = evaluate(loadAsset('AST-001'), malformed, {
      now: DURING_CERTIFICATION,
    });

    // A hand-edited template should produce a screening failure, not a crash.
    expect(result.passed).toBe(false);
    expect(result.results[0].reason).toContain('unknown operator');
  });
});
