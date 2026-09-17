import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import type { Asset } from './asset.types.js';

/**
 * Loads demo asset fixtures from disk.
 *
 * In production an asset would arrive from an issuer portal, backed by
 * documents and diligence. For the proof-of-concept these are fixtures, and
 * the service exists so the API surface matches what the real thing would
 * look like rather than hardcoding assets into controllers.
 */
@Injectable()
export class AssetsService implements OnModuleInit {
  private readonly logger = new Logger(AssetsService.name);
  private readonly assets = new Map<string, Asset>();

  private readonly directory =
    process.env.FIXTURES_DIR ?? join(process.cwd(), 'fixtures');

  onModuleInit(): void {
    this.load();
  }

  private load(): void {
    if (!existsSync(this.directory)) {
      this.logger.warn(`No fixtures directory at ${this.directory}`);
      return;
    }

    const files = readdirSync(this.directory).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      try {
        const raw = JSON.parse(
          readFileSync(join(this.directory, file), 'utf8'),
        ) as unknown;
        const asset = this.parse(raw);
        this.assets.set(asset.asset_id, asset);
      } catch (error) {
        this.logger.error(
          `Failed to load fixture ${file}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.log(`Loaded ${this.assets.size} asset fixture(s)`);
  }

  /**
   * Only the identifying fields are required.
   *
   * The asset shape stays deliberately open: conditions address fields by
   * path, so a template may reference something this service has never heard
   * of. Validating the full shape here would defeat that.
   */
  private parse(raw: unknown): Asset {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error('asset is not an object');
    }

    const a = raw as Record<string, unknown>;

    for (const key of ['asset_id', 'asset_type', 'name']) {
      if (typeof a[key] !== 'string') {
        throw new Error(`missing or invalid '${key}'`);
      }
    }

    return raw as Asset;
  }

  findAll(): Asset[] {
    return [...this.assets.values()];
  }

  findOne(assetId: string): Asset {
    const asset = this.assets.get(assetId);
    if (!asset) {
      throw new NotFoundException(`No asset with id '${assetId}'`);
    }
    return asset;
  }
}
