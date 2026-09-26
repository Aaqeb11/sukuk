import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { PublicKey } from '@solana/web3.js';

import { ComplianceService } from '../compliance/compliance.service.js';
import { CustodyService } from '../custody/custody.service.js';
import { TemplatesService } from '../templates/templates.service.js';
import { SolanaClient, onChainAssetId } from './solana.client.js';
import {
  IssuanceError,
  type IssuanceRequest,
  type IssuanceResult,
} from './sukuk.types.js';
import type { ScreeningResult } from '../compliance/evaluator.js';

/**
 * Issuance.
 *
 * The whole module exists for one function, and that function is deliberately
 * written to be read top to bottom. The sequence is the control: screening
 * happens before a key exists, the key signs before anything is submitted,
 * and each step's failure is attributable.
 */
@Injectable()
export class SukukService {
  private readonly logger = new Logger(SukukService.name);

  constructor(
    private readonly compliance: ComplianceService,
    private readonly templates: TemplatesService,
    private readonly custody: CustodyService,
    private readonly chain: SolanaClient,
  ) {}

  async issue(request: IssuanceRequest): Promise<IssuanceResult> {
    const { asset, templateId, totalUnits } = request;
    const assetId = String(asset.asset_id ?? '');

    if (!assetId) {
      throw new IssuanceError(
        'The asset has no asset_id. Issuance is keyed on it — the custody ' +
          'handle and the on-chain PDA are both derived from it.',
        'screening',
      );
    }

    // ---------- 1. Screen ----------
    // Before anything else, and before any key exists. A rejection here costs
    // nothing and leaves no trace on-chain or in the keyring.

    let screening: ScreeningResult;
    try {
      screening = this.compliance.screen(templateId, asset);
    } catch (error) {
      throw new IssuanceError(
        `Screening could not run: ${(error as Error).message}`,
        'screening',
        undefined,
        error,
      );
    }

    if (!screening.passed) {
      const why =
        screening.governance.length > 0
          ? screening.governance.map((g) => g.code).join(', ')
          : screening.results
              .filter((r) => !r.passed)
              .map((r) => r.condition_id)
              .join(', ');

      throw new IssuanceError(
        `${assetId} did not pass screening against ${templateId}: ${why}`,
        'screening',
        screening,
      );
    }

    const template = this.templates.findOne(templateId);
    const screeningHash = hashScreening(screening, template.certification);
    const reason = `initialize_sukuk ${assetId} · screening ${screeningHash.slice(0, 16)}`;

    // ---------- 2. Generate the issuance key ----------
    // Only now. The key's existence is downstream of the pass, which is what
    // makes "there is an issuer key for this asset" mean something.

    let handle: string;
    let authority: PublicKey;
    try {
      const key = await this.custody.generateIssuerKey(assetId, reason);
      handle = key.handle;
      // Custody returns raw bytes on purpose — it must not depend on a
      // blockchain library. This module is where they become a Solana type.
      authority = new PublicKey(key.publicKey);
    } catch (error) {
      throw new IssuanceError(
        `Could not create an issuance key for ${assetId}: ${(error as Error).message}`,
        'key-generation',
        screening,
        error,
      );
    }

    // ---------- 3. Build ----------

    const onChainId = onChainAssetId(assetId);

    let built;
    try {
      built = await this.chain.buildInitializeSukuk({
        onChainId,
        totalUnits,
        authority,
      });
    } catch (error) {
      throw new IssuanceError(
        `Could not build the issuance transaction: ${(error as Error).message}`,
        'building',
        screening,
        error,
      );
    }

    // ---------- 4. Sign, inside the custody boundary ----------
    // The message bytes go to Vault and a signature comes back. No private
    // key exists in this process at any point.

    let signature: Uint8Array;
    try {
      signature = await this.custody.sign(handle, built.message, reason);
    } catch (error) {
      throw new IssuanceError(
        `Custody refused or could not sign for ${assetId}: ${(error as Error).message}`,
        'signing',
        screening,
        error,
      );
    }

    // ---------- 5. Submit ----------

    let txSignature: string;
    try {
      txSignature = await this.chain.submit(built, authority, signature);
    } catch (error) {
      throw new IssuanceError(
        `Submission failed for ${assetId}: ${(error as Error).message}`,
        'submission',
        screening,
        error,
      );
    }

    this.logger.log(
      `Issued ${assetId} (${totalUnits} units) — authority ${authority.toBase58()} · ${txSignature}`,
    );

    return {
      assetId,
      onChainAssetId: onChainId.toString(),
      screening: {
        templateId: screening.template_id,
        templateVersion: screening.template_version,
        certifiedBy: template.certification.certified_by,
        expiresAt: template.certification.expires_at,
        conditionsEvaluated: screening.summary.total,
        evaluatedAt: screening.evaluated_at,
        hash: screeningHash,
      },
      custody: {
        provider: (await this.custody.health()).provider,
        handle,
        authority: authority.toBase58(),
      },
      chain: {
        signature: txSignature,
        sukukAccount: built.sukukPda.toBase58(),
        mint: built.mint.toBase58(),
        explorer: this.chain.explorerTx(txSignature),
      },
      completedAt: new Date().toISOString(),
    };
  }

  /** Current on-chain state for an issued Sukuk. */
  async getState(assetId: string): Promise<Record<string, unknown>> {
    const onChainId = onChainAssetId(assetId);
    const account = await this.chain.fetchSukuk(onChainId);

    return {
      assetId,
      onChainAssetId: onChainId.toString(),
      account: serializeAccount(account),
    };
  }
}

/**
 * A digest of the screening decision.
 *
 * Covers what was screened, against which template and version, under whose
 * certification, and the verdict on every individual condition. Two screenings
 * that agree on all of that produce the same hash; any change to the template,
 * the certification, or a single condition's outcome produces a different one.
 *
 * Field order is fixed because JSON.stringify preserves insertion order for
 * string keys — the object is built explicitly rather than spread, so the
 * serialization is stable across runs and across Node versions.
 */
function hashScreening(
  screening: ScreeningResult,
  certification: { certified_by: string; certified_at: string; expires_at: string },
): string {
  const canonical = {
    asset_id: screening.asset_id,
    template_id: screening.template_id,
    template_version: screening.template_version,
    certified_by: certification.certified_by,
    certified_at: certification.certified_at,
    expires_at: certification.expires_at,
    passed: screening.passed,
    conditions: screening.results.map((r) => ({
      id: r.condition_id,
      passed: r.passed,
    })),
  };

  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/** Anchor returns BN and PublicKey instances; neither serializes usefully. */
function serializeAccount(account: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(account)) {
    if (value instanceof PublicKey) {
      out[key] = value.toBase58();
    } else if (typeof value === 'object' && value !== null && 'toString' in value) {
      out[key] = value.toString();
    } else {
      out[key] = value;
    }
  }

  return out;
}
