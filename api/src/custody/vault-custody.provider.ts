import { Injectable, Logger } from '@nestjs/common';
import { createPublicKey, verify as cryptoVerify } from 'node:crypto';

import {
  CustodyError,
  type CustodyProvider,
  type KeyHandle,
} from './custody.types.js';

/**
 * HashiCorp Vault Transit as the custody backing store.
 *
 * Transit is a key management service: keys are created inside Vault and,
 * with `exportable: false`, cannot be read back out by any API call. The
 * application sends a message and receives a signature. That is the same
 * shape as a PKCS#11 HSM call, which is what makes this a stand-in for
 * production hardware rather than a simulation of one.
 *
 * Vault specifics this class absorbs so nothing else has to know them:
 *   - input and output are base64
 *   - signatures come back prefixed "vault:v1:"
 *   - the public key lives under keys[<version>].public_key
 */
@Injectable()
export class VaultCustodyProvider implements CustodyProvider {
  readonly name = 'vault-transit';

  private readonly logger = new Logger(VaultCustodyProvider.name);

  private readonly address =
    process.env.VAULT_ADDR ?? 'http://127.0.0.1:8200';
  private readonly token = process.env.VAULT_TOKEN ?? '';
  private readonly mount = process.env.VAULT_TRANSIT_MOUNT ?? 'transit';

  constructor() {
    if (!this.token) {
      // Not fatal at construction — healthCheck reports it, and the service
      // surfaces it at startup rather than at first signature.
      this.logger.warn('VAULT_TOKEN is not set; custody operations will fail');
    }
  }

  // ---------- CustodyProvider ----------

  async generateKey(label: string): Promise<KeyHandle> {
    assertValidLabel(label);

    // exportable=false is the whole claim. With it true, Vault would expose
    // an /export endpoint and the key could leave the boundary.
    await this.request(`keys/${encodeURIComponent(label)}`, {
      type: 'ed25519',
      exportable: false,
      allow_plaintext_backup: false,
    });

    this.logger.log(`Generated non-exportable ed25519 key '${label}' in Vault`);

    const publicKey = await this.getPublicKey(label);
    return { handle: label, publicKey, createdAt: new Date().toISOString() };
  }

  async getPublicKey(handle: string): Promise<Uint8Array> {
    assertValidLabel(handle);

    const data = await this.request<VaultKeyResponse>(
      `keys/${encodeURIComponent(handle)}`,
    );

    // Checked before the key is read, not after. If the key turns out to be
    // exportable, this process should never have held its public half in a
    // variable in the first place — the point is to refuse the key, not to
    // use it and complain.
    //
    // This is not paranoia about our own `generateKey`. It catches a key
    // created out-of-band: by an operator with a curl command, by a restored
    // backup, by a Terraform module written six months from now. The
    // guarantee has to be checked at the point of use, because that is the
    // only place that knows the key is about to matter.
    if (data.exportable === true) {
      throw new CustodyError(
        `Key '${handle}' is exportable — its private half can be read out of Vault, ` +
          'so it does not satisfy the custody guarantee and will not be used',
        'MISCONFIGURED',
      );
    }

    if (data.type !== undefined && data.type !== 'ed25519') {
      throw new CustodyError(
        `Key '${handle}' is of type '${data.type}', not ed25519 — Solana will not ` +
          'accept signatures from it',
        'MISCONFIGURED',
      );
    }

    const version = String(data.latest_version);
    const encoded = data.keys?.[version]?.public_key;

    if (!encoded) {
      throw new CustodyError(
        `Vault returned no public key for '${handle}'`,
        'KEY_NOT_FOUND',
      );
    }

    const bytes = Uint8Array.from(Buffer.from(encoded, 'base64'));

    if (bytes.length !== 32) {
      throw new CustodyError(
        `Expected a 32-byte ed25519 public key for '${handle}', got ${bytes.length}`,
        'MISCONFIGURED',
      );
    }

    return bytes;
  }

  async sign(handle: string, message: Uint8Array): Promise<Uint8Array> {
    assertValidLabel(handle);

    // Ed25519 does its own internal hashing, so the raw message goes in.
    // Pre-hashing here would produce a signature over the wrong bytes and
    // Solana would reject it.
    const data = await this.request<VaultSignResponse>(
      `sign/${encodeURIComponent(handle)}`,
      { input: Buffer.from(message).toString('base64') },
    );

    if (!data.signature) {
      throw new CustodyError(
        `Vault returned no signature for '${handle}'`,
        'SIGNING_FAILED',
      );
    }

    // "vault:v1:<base64>" — the version prefix is Vault's key-rotation marker.
    const encoded = data.signature.split(':').pop() ?? '';
    const signature = Uint8Array.from(Buffer.from(encoded, 'base64'));

    if (signature.length !== 64) {
      throw new CustodyError(
        `Expected a 64-byte ed25519 signature, got ${signature.length}`,
        'SIGNING_FAILED',
      );
    }

    return signature;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.token) return false;

    try {
      const res = await fetch(`${this.address}/v1/sys/health`, {
        headers: { 'X-Vault-Token': this.token },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ---------- Self-test ----------

  /**
   * Proves end to end that this provider produces signatures Solana will
   * accept: generate a key, sign a known message, verify the signature
   * against the returned public key.
   *
   * Worth running at startup rather than trusting documentation. A provider
   * that pre-hashes, or returns a signature over re-encoded bytes, fails
   * here rather than silently producing transactions the network rejects.
   */
  async selfTest(): Promise<boolean> {
    // A fixed label, not a timestamped one. Vault keys are created with
    // deletion disabled, so a per-run label would leave one undeletable key
    // behind every time the process starts. Creating a key that already
    // exists is a no-op in Transit, so reusing the label is both safe and
    // the only version of this that doesn't litter.
    const label = 'custody-selftest';
    const message = new TextEncoder().encode('custody self-test');

    try {
      const { publicKey } = await this.generateKey(label);
      const signature = await this.sign(label, message);

      // Node needs an SPKI-wrapped key; the 12-byte prefix is fixed for ed25519.
      const spki = Buffer.concat([
        Buffer.from('302a300506032b6570032100', 'hex'),
        Buffer.from(publicKey),
      ]);

      const ok = cryptoVerify(
        null, // ed25519 takes no separate digest algorithm
        Buffer.from(message),
        createPublicKey({ key: spki, format: 'der', type: 'spki' }),
        Buffer.from(signature),
      );

      if (ok) {
        this.logger.log('Custody self-test passed: signature verifies');
      } else {
        this.logger.error(
          'Custody self-test FAILED: signature does not verify against the public key',
        );
      }

      return ok;
    } catch (error) {
      this.logger.error(`Custody self-test failed: ${(error as Error).message}`);
      return false;
    }
  }

  // ---------- Vault HTTP ----------

  private async request<T = unknown>(
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.address}/v1/${this.mount}/${path}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: {
          'X-Vault-Token': this.token,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      throw new CustodyError(
        `Cannot reach Vault at ${this.address}`,
        'PROVIDER_UNREACHABLE',
        error,
      );
    }

    if (!res.ok) {
      const detail = await res.text();

      // Vault reports a missing key differently depending on the endpoint:
      // GET /keys/:name returns 404, POST /sign/:name returns 400 with
      // {"errors":["signing key not found"]}. Callers care that the key is
      // absent, not which endpoint happened to notice — and the orchestration
      // layer needs to tell "key missing, regenerate it" apart from "signing
      // failed, retry it". Collapsing them here keeps that distinction usable.
      if (
        res.status === 404 ||
        (res.status === 400 && detail.includes('key not found'))
      ) {
        throw new CustodyError(`No key found at '${path}'`, 'KEY_NOT_FOUND');
      }

      throw new CustodyError(
        `Vault returned ${res.status} for '${path}': ${detail}`,
        res.status === 403 ? 'MISCONFIGURED' : 'SIGNING_FAILED',
      );
    }

    // Key creation returns 204 with no body.
    if (res.status === 204) return {} as T;

    const json = (await res.json()) as { data?: T };
    return (json.data ?? {}) as T;
  }
}

// ---------- Vault response shapes ----------

interface VaultKeyResponse {
  latest_version: number;
  keys?: Record<string, { public_key?: string; creation_time?: string }>;
  exportable?: boolean;
  type?: string;
}

interface VaultSignResponse {
  signature?: string;
}

// ---------- Label validation ----------

/**
 * Vault Transit key names are restricted to this character set. A name
 * outside it does not produce a helpful error — Vault's router simply fails
 * to match and returns a bare 404, which reads as "no such key" and sends you
 * looking in the wrong place entirely.
 *
 * Handles are derived from asset IDs, which arrive in user-supplied JSON, so
 * this is an input-validation boundary rather than an internal invariant.
 */
const VALID_LABEL = /^[A-Za-z0-9_.-]+$/;

function assertValidLabel(label: string): void {
  if (!VALID_LABEL.test(label)) {
    throw new CustodyError(
      `'${label}' is not a usable Vault key name. Transit accepts only ` +
        'letters, digits, underscore, dot and hyphen. Asset IDs containing ' +
        'other characters must be hashed or encoded before use as a handle — ' +
        'not stripped, which would let two assets collide onto one key.',
      'MISCONFIGURED',
    );
  }
}
