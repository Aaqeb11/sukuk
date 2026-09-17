import { Module } from '@nestjs/common';

import { TemplatesService } from './templates.service.js';

/**
 * Templates are certification artefacts. This module owns loading and
 * serving them; it exports the service so ComplianceModule can resolve a
 * template when screening.
 */
@Module({
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
