import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ComplianceController } from './compliance/compliance.controller.js';
import { ComplianceModule } from './compliance/compliance.module.js';
import { CustodyModule } from './custody/custody.module.js';
import { SukukModule } from './sukuk/sukuk.module.js';

@Module({
  imports: [ComplianceModule, CustodyModule, SukukModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
