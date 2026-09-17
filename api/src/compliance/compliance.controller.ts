import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ComplianceService } from './compliance.service.js';
import { AssetsService } from '../assets/assets.service.js';
import { TemplatesService } from '../templates/templates.service.js';
import { ScreenRequestDto } from './dto/screen-request.dto.js';
import type { ScreeningResult } from './evaluator.js';
import type { Template } from '../templates/template.types.js';
import type { Asset } from '../assets/asset.types.js';

@ApiTags('compliance')
@Controller()
export class ComplianceController {
  constructor(
    private readonly compliance: ComplianceService,
    private readonly templates: TemplatesService,
    private readonly assets: AssetsService,
  ) {}

  @Get('templates')
  @ApiOperation({
    summary: 'List certified templates',
    description:
      'Each template is a set of conditions certified once by a Shariah board. Assets are screened against these conditions without further board involvement until re-certification.',
  })
  listTemplates(): Template[] {
    return this.templates.findAll();
  }

  @Get('templates/:id')
  @ApiOperation({ summary: 'Get one template with its conditions' })
  @ApiParam({ name: 'id', example: 'ijara-real-estate-v1' })
  @ApiResponse({ status: 404, description: 'No template with that id' })
  getTemplate(@Param('id') id: string): Template {
    return this.templates.findOne(id);
  }

  @Get('assets')
  @ApiOperation({ summary: 'List demo asset fixtures' })
  listAssets(): Asset[] {
    return this.assets.findAll();
  }

  @Get('assets/:id')
  @ApiOperation({ summary: 'Get one asset fixture' })
  @ApiParam({ name: 'id', example: 'AST-001' })
  @ApiResponse({ status: 404, description: 'No asset with that id' })
  getAsset(@Param('id') id: string): Asset {
    return this.assets.findOne(id);
  }

  @Post('screen')
  @ApiOperation({
    summary: 'Screen an asset against a certified template',
    description:
      'Returns a per-condition breakdown, not just a verdict. Each result carries the field examined, the value found, and a readable reason — a failing asset must explain itself.',
  })
  @ApiResponse({ status: 404, description: 'No template with that id' })
  screen(@Body() body: ScreenRequestDto): ScreeningResult {
    return this.compliance.screen(body.template_id, body.asset as Asset);
  }

  @Post('assets/:id/screen/:templateId')
  @ApiOperation({ summary: 'Screen a stored fixture against a template' })
  @ApiParam({ name: 'id', example: 'AST-003' })
  @ApiParam({ name: 'templateId', example: 'ijara-real-estate-v1' })
  @ApiResponse({ status: 404, description: 'No such asset or template' })
  screenStored(
    @Param('id') assetId: string,
    @Param('templateId') templateId: string,
  ): ScreeningResult {
    return this.compliance.screenStored(templateId, assetId);
  }
}
