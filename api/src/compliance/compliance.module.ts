import { Module } from '@nestjs/common';

import { ComplianceController } from './compliance.controller.js';
import { ComplianceService } from './compliance.service.js';
import { AssetsModule } from '../assets/assets.module.js';
import { TemplatesModule } from '../templates/templates.module.js';

/**
 * The screening surface.
 *
 * The controller lives here rather than in Templates/Assets so that every
 * route is defined in one place — templates and assets are read-only
 * dependencies of screening, not features in their own right.
 */
@Module({
  imports: [TemplatesModule, AssetsModule],
  controllers: [ComplianceController],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
