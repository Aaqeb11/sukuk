  import { Controller, Get, Param, Query } from '@nestjs/common';
  import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';

  import { CustodyService } from './custody.service.js';
  import type { CustodyAuditRecord } from './custody.types.js';

  /**
   * Read-only.
   *
   * There is deliberately no endpoint that creates or deletes a key. Key
   * generation happens as part of issuance, driven by the sukuk module after
   * an asset passes screening — not as a standalone call anyone can make.
   * Deletion is a Vault-admin operation with its own authentication path and
   * is not reachable from this API at all.
   */
  @ApiTags('custody')
  @Controller('custody')
  export class CustodyController {
    constructor(private readonly custody: CustodyService) {}

    @Get('health')
    @ApiOperation({
      summary: 'Custody provider status',
      description:
        'Reports which provider is backing custody and whether it is reachable.',
    })
    health(): Promise<{ provider: string; reachable: boolean }> {
      return this.custody.health();
    }

    @Get('keys/:handle')
    @ApiOperation({
      summary: 'Public key for a handle',
      description:
        'Returns only the public half. There is no endpoint that returns key material — the private key cannot leave the custody boundary by any path.',
    })
    @ApiParam({ name: 'handle', example: 'issuer:AST-001' })
    async publicKey(
      @Param('handle') handle: string,
    ): Promise<{ handle: string; publicKey: string }> {
      const bytes = await this.custody.getPublicKey(handle);

      return {
        handle,
        // Hex rather than base58: this module stays free of Solana encoding.
        publicKey: Buffer.from(bytes).toString('hex'),
      };
    }

    @Get('audit')
    @ApiOperation({
      summary: 'Signing audit trail',
      description:
        'Every key generation and signing request, most recent first. Each signature records a digest of what was signed and the caller context that requested it.',
    })
    @ApiQuery({ name: 'limit', required: false, example: 50 })
    audit(@Query('limit') limit?: string): CustodyAuditRecord[] {
      const parsed = Number(limit);
      return this.custody.getAuditLog(
        Number.isFinite(parsed) && parsed > 0 ? parsed : 100,
      );
    }
  }
