import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';

import {
  CUSTODY_PROVIDER,
  CustodyError,
  type CustodyAuditRecord,
  type CustodyProvider,
  type KeyHandle,
} from './custody.types.js';

/**
 * Wraps a CustodyProvider with the things every custody operation needs
 * regardless of backing store: an audit trail, consistent error handling,
 * and a startup check that the boundary is actually reachable.
 *
 * The provider is injected by interface, so this class never mentions Vault.
 * Swapping in a Luna HSM changes one line in custody.module.ts and nothing
 * here.
 */
@Injectable()
export class CustodyService implements OnModuleInit {
  private readonly logger = new Logger(CustodyService.name);

  /**
   * In-memory for the proof-of-concept. A real deployment writes these to
   * append-only storage — the audit trail is the part a regulator asks for,
   * and it is worth less if it can be lost on restart.
   */
  private readonly auditLog: CustodyAuditRecord[] = [];
  private static readonly AUDIT_LIMIT = 1000;

  constructor(
    @Inject(CUSTODY_PROVIDER) private readonly provider: CustodyProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    const reachable = await this.provider.healthCheck();

    if (reachable) {
      this.logger.log(`Custody provider '${this.provider.name}' is reachable`);
    } else {
      // Not fatal — the rest of the API still works, and failing loudly here
      // is better than every issuance failing with a confusing error later.
      this.logger.error(
        `Custody provider '${this.provider.name}' is NOT reachable. ` +
          'Issuance will fail until it is available.',
      );
    }
  }

  // ---------- Operations ----------

  /**
   * Creates a new issuer key inside the custody boundary.
   *
   * Called once per asset: each Sukuk gets its own key, so a compromise is
   * contained to a single instrument rather than an issuer's whole book.
   */
  async generateIssuerKey(assetId: string, reason?: string): Promise<KeyHandle> {
    // Hyphen, not colon. Vault Transit restricts key names to
    // [A-Za-z0-9_.-] and rejects anything else at the routing layer, which
    // surfaces as a bare 404 rather than a useful error. The provider now
    // validates the label up front; this keeps it valid by construction.
    const handle = `issuer-${assetId}`;

    try {
      const key = await this.provider.generateKey(handle);

      this.record({
        operation: 'generate',
        handle,
        reason: reason ?? `issuer key for ${assetId}`,
        success: true,
      });

      this.logger.log(
        `Issuer key created for ${assetId} — pubkey never left ${this.provider.name}`,
      );

      return key;
    } catch (error) {
      this.record({
        operation: 'generate',
        handle,
        reason,
        success: false,
        error: describe(error),
      });
      throw error;
    }
  }

  async getPublicKey(handle: string): Promise<Uint8Array> {
    try {
      const key = await this.provider.getPublicKey(handle);
      this.record({ operation: 'lookup', handle, success: true });
      return key;
    } catch (error) {
      this.record({
        operation: 'lookup',
        handle,
        success: false,
        error: describe(error),
      });
      throw error;
    }
  }

  /**
   * Signs a message with the key behind `handle`.
   *
   * `reason` is caller context recorded in the audit trail — "initialize_sukuk
   * AST-001", "distribute_profit period 2". Without it the trail says a
   * signature happened but not what it authorised, which is most of the value.
   */
  async sign(
    handle: string,
    message: Uint8Array,
    reason?: string,
  ): Promise<Uint8Array> {
    const messageDigest = createHash('sha256').update(message).digest('hex');

    try {
      const signature = await this.provider.sign(handle, message);

      this.record({
        operation: 'sign',
        handle,
        messageDigest,
        reason,
        success: true,
      });

      return signature;
    } catch (error) {
      this.record({
        operation: 'sign',
        handle,
        messageDigest,
        reason,
        success: false,
        error: describe(error),
      });
      throw error;
    }
  }

  // ---------- Introspection ----------

  async health(): Promise<{ provider: string; reachable: boolean }> {
    return {
      provider: this.provider.name,
      reachable: await this.provider.healthCheck(),
    };
  }

  /** Most recent first. */
  getAuditLog(limit = 100): CustodyAuditRecord[] {
    return this.auditLog.slice(-limit).reverse();
  }

  // ---------- Internals ----------

  private record(
    entry: Omit<CustodyAuditRecord, 'timestamp' | 'provider'>,
  ): void {
    this.auditLog.push({
      timestamp: new Date().toISOString(),
      provider: this.provider.name,
      ...entry,
    });

    if (this.auditLog.length > CustodyService.AUDIT_LIMIT) {
      this.auditLog.shift();
    }
  }
}

function describe(error: unknown): string {
  if (error instanceof CustodyError) return `${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}
