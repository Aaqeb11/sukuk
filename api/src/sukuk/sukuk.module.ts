import { Module } from '@nestjs/common';

import { ComplianceModule } from '../compliance/compliance.module.js';
import { CustodyModule } from '../custody/custody.module.js';
import { TemplatesModule } from '../templates/templates.module.js';
import { SolanaClient } from './solana.client.js';
import { SukukController } from './sukuk.controller.js';
import { SukukService } from './sukuk.service.js';

/**
 * The only module that depends on both compliance and custody.
 *
 * Keeping that dependency in exactly one place is what lets the other two
 * stay honest: compliance can be tested with no Vault running, custody has
 * no opinion about Shariah, and the sequence that binds them is visible in
 * a single service rather than distributed across both.
 */
@Module({
  imports: [ComplianceModule, CustodyModule, TemplatesModule],
  controllers: [SukukController],
  providers: [SukukService, SolanaClient],
  exports: [SukukService],
})
export class SukukModule {}
