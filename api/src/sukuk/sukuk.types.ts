import type { ScreeningResult } from '../compliance/evaluator.js';
import type { Asset } from '../assets/asset.types.js';

/**
 * Issuance: the one place compliance and custody meet.
 *
 * Neither of those modules imports the other. Compliance is a pure function
 * over JSON and needs no Vault; custody is bytes-in-bytes-out and has never
 * heard of Shariah. This module depends on both, and the order in which it
 * calls them is itself the control:
 *
 *   screen → (pass) → generate key → build → sign → submit
 *
 * Because the issuer key is created only after a pass, the existence of a key
 * for an asset is evidence that the asset passed. There is no key lying around
 * that could have authorised an issuance for a rejected asset.
 */

export interface IssuanceRequest {
  /** The asset document to screen. Its `asset_id` identifies the instrument. */
  asset: Asset;

  /** Which board-certified template to screen against. */
  templateId: string;

  /** Total ownership units to create. Indivisible — the mint has 0 decimals. */
  totalUnits: number;
}

/**
 * Where issuance got to. Recorded on failures so a rejection says which step
 * refused, not merely that something went wrong.
 *
 * `screening` failing is a normal business outcome. Anything after it failing
 * is an operational problem, and the distinction matters to whoever is paged.
 */
export type IssuanceStage =
  | 'screening'
  | 'key-generation'
  | 'building'
  | 'signing'
  | 'submission';

export interface IssuanceResult {
  /** The asset's own identifier, e.g. "AST-001". */
  assetId: string;

  /**
   * The u64 the program uses, derived deterministically from `assetId`.
   * See `onChainAssetId` in solana.client.ts for why this exists.
   */
  onChainAssetId: string;

  screening: {
    templateId: string;
    templateVersion: string;
    certifiedBy: string;
    expiresAt: string;
    conditionsEvaluated: number;
    evaluatedAt: string;

    /**
     * SHA-256 over the screening decision — template identity and version,
     * the certification block, and every condition's verdict.
     *
     * This is what turns "certify once, replicate many" from a claim into
     * evidence. It is recorded as the custody signing reason, so the audit
     * trail can answer: this signature authorised this issuance, which this
     * screening against this certified template permitted.
     *
     * Not yet written on-chain. When it is, the instrument itself carries
     * proof of the screening that allowed it to exist.
     */
    hash: string;
  };

  custody: {
    provider: string;
    handle: string;
    /** Base58. The issuance authority recorded on-chain. */
    authority: string;
  };

  chain: {
    signature: string;
    sukukAccount: string;
    mint: string;
    explorer: string;
  };

  completedAt: string;
}

/**
 * Raised when issuance cannot proceed.
 *
 * `stage` is the useful part: a rejection at `screening` is the system working
 * as designed, while a failure at `signing` means the custody boundary is
 * unreachable and issuance is down.
 */
export class IssuanceError extends Error {
  constructor(
    message: string,
    readonly stage: IssuanceStage,
    /** Present when the stage is `screening`. */
    readonly screening?: ScreeningResult,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'IssuanceError';
  }
}
