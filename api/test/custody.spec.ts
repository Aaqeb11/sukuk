import { describe, it, expect, beforeAll } from 'vitest';
import { createPublicKey, verify as cryptoVerify } from 'node:crypto';

import { VaultCustodyProvider } from '../src/custody/vault-custody.provider.js';
import { CustodyService } from '../src/custody/custody.service.js';
import { CustodyError } from '../src/custody/custody.types.js';

/**
 * Integration tests. These talk to a real Vault.
 *
 * That is the point. A mocked CustodyProvider would only prove that
 * CustodyService calls the method it was told to call — which is visible by
 * reading it. The claim worth testing is that Vault produces Ed25519
 * signatures that verify under RFC 8032, because everything downstream
 * assumes it and nothing so far has checked.
 *
 * Run with Vault up:
 *   vault server -dev -dev-root-token-id=dev-only-token
 *   vault secrets enable transit
 *
 * Verification here deliberately does NOT go through the provider's own
 * selfTest(). If the provider is wrong about how signatures work, a test that
 * asks the provider to check itself is wrong in the same direction.
 */

const ADDRESS = process.env.VAULT_ADDR ?? 'http://127.0.0.1:8200';
const TOKEN = process.env.VAULT_TOKEN ?? '';
const MOUNT = process.env.VAULT_TRANSIT_MOUNT ?? 'transit';

/**
 * Fixed labels, not randomised ones.
 *
 * Transit keys are created with deletion disabled, so a per-run label would
 * leave undeletable keys behind on every test run. Creating a key that already
 * exists is a no-op, so reusing these is both safe and the only version that
 * doesn't accumulate junk in the keyring.
 */
const KEYS = {
  basic: 'test-custody-basic',
  /** Uses the real handle shape the service produces — see the test below. */
  issuerShaped: 'issuer-TEST-001',
  exportable: 'test-custody-exportable',
  wrongType: 'test-custody-ecdsa',
  missing: 'test-custody-does-not-exist',
} as const;

const provider = new VaultCustodyProvider();

// ---------- Helpers ----------

/** Raw Vault access, so tests can assert on fields the provider hides. */
async function vault(
  path: string,
  body?: unknown,
): Promise<Record<string, any>> {
  const res = await fetch(`${ADDRESS}/v1/${MOUNT}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'X-Vault-Token': TOKEN,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 204) return {};
  const json = (await res.json()) as { data?: Record<string, any> };
  return json.data ?? {};
}

/**
 * Independent Ed25519 verification.
 *
 * Node's implementation is RFC 8032, the same specification ed25519-dalek
 * implements on the validator side. The 12-byte prefix is the fixed SPKI
 * DER header for an Ed25519 public key; Node will not accept 32 raw bytes.
 */
function verifyEd25519(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
): boolean {
  const spki = Buffer.concat([
    Buffer.from('302a300506032b6570032100', 'hex'),
    Buffer.from(publicKey),
  ]);

  return cryptoVerify(
    null, // Ed25519 hashes internally; there is no separate digest algorithm
    Buffer.from(message),
    createPublicKey({ key: spki, format: 'der', type: 'spki' }),
    Buffer.from(signature),
  );
}

const MESSAGE = new TextEncoder().encode(
  'initialize_sukuk AST-001 — not a real transaction, but the right shape',
);

// ---------- Suite ----------

beforeAll(async () => {
  const reachable = await provider.healthCheck();

  if (!reachable) {
    throw new Error(
      `Vault is not reachable at ${ADDRESS}. These are integration tests and ` +
        'skipping them silently would be worse than failing. Start Vault with:\n' +
        '  vault server -dev -dev-root-token-id=dev-only-token\n' +
        '  export VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=dev-only-token\n' +
        '  vault secrets enable transit',
    );
  }
});

describe('VaultCustodyProvider — key generation', () => {
  it('creates a key and returns a 32-byte public half', async () => {
    const key = await provider.generateKey(KEYS.basic);

    expect(key.handle).toBe(KEYS.basic);
    expect(key.publicKey).toBeInstanceOf(Uint8Array);
    expect(key.publicKey.length).toBe(32);
    expect(Number.isNaN(Date.parse(key.createdAt))).toBe(false);
  });

  it('accepts the `issuer-<assetId>` handle format the service produces', async () => {
    // CustodyService builds handles as `issuer-${assetId}`. Vault restricts
    // key-name characters, so this is worth proving now rather than
    // discovering at first issuance. If it fails, handles need slugifying.
    const key = await provider.generateKey(KEYS.issuerShaped);

    expect(key.publicKey.length).toBe(32);

    const readBack = await provider.getPublicKey(KEYS.issuerShaped);
    expect(Buffer.from(readBack)).toEqual(Buffer.from(key.publicKey));
  });

  it('does not rotate the key when the same label is generated twice', async () => {
    // Issuance is idempotent-by-retry: a network blip could cause
    // generateIssuerKey to run twice for one asset. If the second call
    // rotated the key, the on-chain authority recorded by the first would be
    // orphaned and the Sukuk would become permanently unmanageable.
    const first = await provider.generateKey(KEYS.basic);
    const second = await provider.generateKey(KEYS.basic);

    expect(Buffer.from(second.publicKey)).toEqual(Buffer.from(first.publicKey));
  });

  it('creates keys that Vault reports as non-exportable', async () => {
    await provider.generateKey(KEYS.basic);
    const meta = await vault(`keys/${encodeURIComponent(KEYS.basic)}`);

    // This is the entire custody claim, asserted against Vault's own view
    // rather than against what we asked for.
    expect(meta.exportable).toBe(false);
    expect(meta.allow_plaintext_backup).toBe(false);
    expect(meta.type).toBe('ed25519');
  });
});

describe('VaultCustodyProvider — refusing unsafe keys', () => {
  it('refuses a key that is exportable', async () => {
    // Created out-of-band, the way an operator with a curl command or a
    // restored backup would create one. The guarantee has to hold for keys
    // this provider did not make.
    await vault(`keys/${encodeURIComponent(KEYS.exportable)}`, {
      type: 'ed25519',
      exportable: true,
    });

    await expect(provider.getPublicKey(KEYS.exportable)).rejects.toMatchObject({
      code: 'MISCONFIGURED',
    });
  });

  it('refuses a key that is not ed25519', async () => {
    await vault(`keys/${encodeURIComponent(KEYS.wrongType)}`, {
      type: 'ecdsa-p256',
    });

    await expect(provider.getPublicKey(KEYS.wrongType)).rejects.toMatchObject({
      code: 'MISCONFIGURED',
    });
  });

  it('reports a missing key as KEY_NOT_FOUND rather than a generic failure', async () => {
    await expect(provider.getPublicKey(KEYS.missing)).rejects.toBeInstanceOf(
      CustodyError,
    );
    await expect(provider.getPublicKey(KEYS.missing)).rejects.toMatchObject({
      code: 'KEY_NOT_FOUND',
    });
  });
});

describe('VaultCustodyProvider — signing', () => {
  it('returns a 64-byte signature', async () => {
    await provider.generateKey(KEYS.basic);
    const signature = await provider.sign(KEYS.basic, MESSAGE);

    expect(signature.length).toBe(64);
  });

  it('produces a signature that verifies against the public key', async () => {
    // The load-bearing test. Everything downstream — every transaction this
    // platform ever submits — depends on this being true.
    const { publicKey } = await provider.generateKey(KEYS.basic);
    const signature = await provider.sign(KEYS.basic, MESSAGE);

    expect(verifyEd25519(publicKey, MESSAGE, signature)).toBe(true);
  });

  it('signs deterministically, as RFC 8032 requires', async () => {
    // Ed25519 derives its nonce from the key and message rather than from
    // randomness. Non-determinism here would mean Vault is doing something
    // non-standard, and non-standard is the failure mode that produces
    // signatures the validator quietly rejects.
    const a = await provider.sign(KEYS.basic, MESSAGE);
    const b = await provider.sign(KEYS.basic, MESSAGE);

    expect(Buffer.from(a)).toEqual(Buffer.from(b));
  });

  it('produces a signature that fails against a tampered message', async () => {
    // Guards against the test above passing for a trivial reason.
    const { publicKey } = await provider.generateKey(KEYS.basic);
    const signature = await provider.sign(KEYS.basic, MESSAGE);

    const tampered = Uint8Array.from(MESSAGE);
    tampered[0] ^= 0xff;

    expect(verifyEd25519(publicKey, tampered, signature)).toBe(false);
  });

  it('signs different messages to different signatures', async () => {
    const a = await provider.sign(KEYS.basic, MESSAGE);
    const b = await provider.sign(KEYS.basic, new TextEncoder().encode('other'));

    expect(Buffer.from(a)).not.toEqual(Buffer.from(b));
  });

  it('passes its own self-test', async () => {
    expect(await provider.selfTest()).toBe(true);
  });
});

describe('CustodyService — audit trail', () => {
  it('records generation and signing with the digest of what was signed', async () => {
    const service = new CustodyService(provider);

    await service.generateIssuerKey('AUDIT-001', 'test issuance');
    await service.sign(
      'issuer-AUDIT-001',
      MESSAGE,
      'initialize_sukuk AUDIT-001',
    );

    const log = service.getAuditLog();

    // Most recent first.
    expect(log[0]).toMatchObject({
      operation: 'sign',
      handle: 'issuer-AUDIT-001',
      reason: 'initialize_sukuk AUDIT-001',
      success: true,
      provider: 'vault-transit',
    });

    // The digest must be of the message, not of anything the service invented.
    const { createHash } = await import('node:crypto');
    expect(log[0].messageDigest).toBe(
      createHash('sha256').update(MESSAGE).digest('hex'),
    );

    expect(log.some((e) => e.operation === 'generate' && e.success)).toBe(true);
  });

  it('records failures rather than swallowing them', async () => {
    const service = new CustodyService(provider);

    await expect(
      service.sign(KEYS.missing, MESSAGE, 'should fail'),
    ).rejects.toBeInstanceOf(CustodyError);

    const log = service.getAuditLog();

    expect(log[0]).toMatchObject({
      operation: 'sign',
      handle: KEYS.missing,
      success: false,
    });
    expect(log[0].error).toContain('KEY_NOT_FOUND');

    // A failed signature still records what was attempted. An audit trail
    // that only contains successes cannot answer the question it exists for.
    expect(log[0].messageDigest).toBeDefined();
  });
});
