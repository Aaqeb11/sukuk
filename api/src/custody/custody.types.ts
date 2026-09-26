/**
 * The custody boundary.
 *
 * Everything in this module exists to enforce one property: the private key
 * that authorises issuance is generated inside a hardware or software security
 * boundary and never crosses back out. The application holds a *handle* — a
 * reference by which it can request a signature — and never the key itself.
 *
 * Two deliberate constraints on this interface:
 *
 *   1. It knows nothing about Solana. `sign` takes raw message bytes and
 *      returns raw signature bytes. Transaction assembly belongs to the sukuk
 *      module; this module does key management. Keeping the boundary at
 *      "bytes in, bytes out" is what makes the claim precise rather than
 *      approximate.
 *
 *   2. It is deliberately small. A provider that could export a key, or that
 *      exposed anything beyond generate/sign, would weaken the property this
 *      module exists to guarantee. If a method would let a caller obtain key
 *      material, it does not belong here.
 */

/**
 * A reference to a key held inside the custody boundary.
 *
 * `handle` is not sensitive. Without access to the backing provider it is a
 * meaningless string — which is precisely why it is safe to persist alongside
 * ordinary application data.
 */
export interface KeyHandle {
  /** Provider-scoped identifier used to request signatures, e.g. "issuer:AST-001". */
  handle: string;

  /**
   * The Ed25519 public key, 32 raw bytes.
   *
   * Raw bytes rather than a Solana `PublicKey` on purpose: this module must
   * not depend on a blockchain library. Callers wrap it.
   */
  publicKey: Uint8Array;

  /** ISO 8601. Useful for the audit trail and for key rotation policy. */
  createdAt: string;
}

/**
 * Implemented once per backing store.
 *
 * `VaultCustodyProvider` implements it today. A `LunaCustodyProvider` speaking
 * PKCS#11 would implement the same three methods, and nothing that consumes
 * this interface would change.
 */
export interface CustodyProvider {
  /** Shown in audit records and health output, e.g. "vault-transit", "luna-hsm". */
  readonly name: string;

  /**
   * Creates a new Ed25519 key *inside* the boundary and returns only its
   * public half.
   *
   * The distinction between generating inside and generating-then-storing is
   * the entire point. A key created in application memory has already been
   * exposed, however briefly, and however carefully it is subsequently stored.
   *
   * Implementations MUST create the key as non-exportable.
   */
  generateKey(label: string): Promise<KeyHandle>;

  /** Retrieves the public key for an existing handle. */
  getPublicKey(handle: string): Promise<Uint8Array>;

  /**
   * Signs a message with the key behind `handle`.
   *
   * The message is the raw bytes to be signed — for Solana, a serialized
   * transaction message. This module neither builds nor inspects it.
   *
   * @returns a 64-byte Ed25519 signature
   */
  sign(handle: string, message: Uint8Array): Promise<Uint8Array>;

  /** True if the provider is reachable and configured. */
  healthCheck(): Promise<boolean>;
}

/**
 * One signing or key-generation request.
 *
 * The audit trail is not incidental. "Certify once" and custodial issuance
 * both depend on being able to answer, later, who authorised what and when.
 * A custody service without a record of its own operations is only half of
 * the control it claims to be.
 */
export interface CustodyAuditRecord {
  timestamp: string;
  operation: 'generate' | 'sign' | 'lookup';
  provider: string;
  handle: string;

  /**
   * SHA-256 of the signed message, hex-encoded.
   *
   * The message itself is not retained — it can be large, and the digest is
   * enough to prove after the fact that a particular transaction was the one
   * signed. Present only for `sign`.
   */
  messageDigest?: string;

  /** Free-form caller context, e.g. "initialize_sukuk AST-001". */
  reason?: string;

  success: boolean;

  /** Present when `success` is false. */
  error?: string;
}

/** Raised when the custody boundary cannot service a request. */
export class CustodyError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'PROVIDER_UNREACHABLE'
      | 'KEY_NOT_FOUND'
      | 'KEY_ALREADY_EXISTS'
      | 'SIGNING_FAILED'
      | 'MISCONFIGURED',
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CustodyError';
  }
}

/** Injection token. Nest resolves the concrete provider against this. */
export const CUSTODY_PROVIDER = Symbol('CUSTODY_PROVIDER');
