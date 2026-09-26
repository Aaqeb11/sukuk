import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { SukukService } from './sukuk.service.js';
import { IssuanceError, type IssuanceResult } from './sukuk.types.js';
import { IssueSukukDto } from './dto/issue-sukuk.dto.js';

@ApiTags('sukuk')
@Controller('sukuk')
export class SukukController {
  constructor(private readonly sukuk: SukukService) {}

  @Post('issue')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Screen an asset and, if it passes, issue a Sukuk',
    description:
      'Runs the asset against a board-certified template. Only on a pass is an ' +
      'issuance key created in custody, the transaction signed inside that ' +
      'boundary, and the Sukuk created on-chain. A screening failure returns 422 ' +
      'with every condition that failed — no key is created and nothing is submitted.',
  })
  @ApiResponse({ status: 201, description: 'Issued.' })
  @ApiResponse({ status: 422, description: 'The asset did not pass screening.' })
  @ApiResponse({ status: 503, description: 'Custody or the chain is unreachable.' })
  async issue(@Body() dto: IssueSukukDto): Promise<IssuanceResult> {
    try {
      return await this.sukuk.issue({
        asset: dto.asset,
        templateId: dto.templateId,
        totalUnits: dto.totalUnits,
      });
    } catch (error) {
      throw translate(error);
    }
  }

  @Get(':assetId')
  @ApiOperation({
    summary: 'On-chain state for an issued Sukuk',
    description:
      'Reads the SukukAsset account directly from the chain rather than from a ' +
      'local cache. The chain is the record; anything else is a copy of it.',
  })
  @ApiParam({ name: 'assetId', example: 'AST-001' })
  async state(@Param('assetId') assetId: string): Promise<Record<string, unknown>> {
    try {
      return await this.sukuk.getState(assetId);
    } catch {
      throw new NotFoundException(
        `No Sukuk found on-chain for '${assetId}'. It may not have been issued, ` +
          'or the API may be pointed at a different cluster.',
      );
    }
  }
}

/**
 * Maps issuance stages onto HTTP status codes.
 *
 * The distinction that matters: a screening failure is the system working —
 * an asset was assessed and found ineligible, which is a 422 with the reasons
 * attached. Everything downstream failing is an outage, which is a 503. A
 * caller that cannot tell those apart will retry the wrong one.
 */
function translate(error: unknown): Error {
  if (!(error instanceof IssuanceError)) {
    return error instanceof Error ? error : new Error(String(error));
  }

  switch (error.stage) {
    case 'screening':
      return error.screening
        ? new UnprocessableEntityException({
            message: error.message,
            stage: error.stage,
            screening: error.screening,
          })
        : new BadRequestException({ message: error.message, stage: error.stage });

    case 'key-generation':
    case 'signing':
      return new ServiceUnavailableException({
        message: error.message,
        stage: error.stage,
        hint: 'The custody provider is unreachable or misconfigured. No Sukuk was created.',
      });

    case 'building':
    case 'submission':
      return new ServiceUnavailableException({
        message: error.message,
        stage: error.stage,
        hint:
          'The asset passed screening and an issuance key exists, but the ' +
          'transaction did not land. Retrying is safe: the key is not rotated ' +
          'on retry, and the PDA derivation is deterministic, so a duplicate ' +
          'issuance is rejected on-chain rather than creating a second Sukuk.',
      });
  }
}
