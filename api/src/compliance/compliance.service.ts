import { Injectable, Logger } from '@nestjs/common';

import { evaluate, type ScreeningResult } from './evaluator.js';
import { AssetsService } from '../assets/assets.service.js';
import { TemplatesService } from '../templates/templates.service.js';
import type { Asset } from '../assets/asset.types.js';

/**
 * Orchestrates screening.
 *
 * Deliberately thin: it resolves a template, hands it and the asset to the
 * evaluator, and logs the outcome. All the actual logic lives in evaluator.ts,
 * which has no NestJS dependency and is tested directly.
 */
@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    private readonly templates: TemplatesService,
    private readonly assets: AssetsService,
  ) {}

  /** Screens an asset supplied in the request body. */
  screen(templateId: string, asset: Asset): ScreeningResult {
    const template = this.templates.findOne(templateId);
    const result = evaluate(asset, template);

    this.logAudit(result);
    return result;
  }

  /** Screens a stored fixture by id. */
  screenStored(templateId: string, assetId: string): ScreeningResult {
    return this.screen(templateId, this.assets.findOne(assetId));
  }

  /**
   * Every screening decision is logged.
   *
   * The "certify once" model only holds up if there is a record of what was
   * screened, against which template version, and why it passed or failed.
   * A production system would persist this; here it goes to the log.
   */
  private logAudit(result: ScreeningResult): void {
    if (result.governance.length > 0) {
      this.logger.warn(
        `${result.asset_id} not screened — ${result.governance.map((g) => g.code).join(', ')}`,
      );
      return;
    }

    if (result.passed) {
      this.logger.log(
        `${result.asset_id} PASSED ${result.template_id}@${result.template_version} (${result.summary.total} conditions)`,
      );
      return;
    }

    const failed = result.results
      .filter((r) => !r.passed)
      .map((r) => r.condition_id)
      .join(', ');

    this.logger.warn(
      `${result.asset_id} FAILED ${result.template_id}@${result.template_version} on: ${failed}`,
    );
  }
}
