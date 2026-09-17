import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ComplianceController } from './compliance/compliance.controller.js';
import { ComplianceModule } from './compliance/compliance.module.js';

@Module({
  imports: [ComplianceModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
