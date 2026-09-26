import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';

import { AssetsService } from '../src/assets/assets.service.js';
import { ComplianceService } from '../src/compliance/compliance.service.js';
import { CustodyService } from '../src/custody/custody.service.js';
import { TemplatesService } from '../src/templates/templates.service.js';
import { VaultCustodyProvider } from '../src/custody/vault-custody.provider.js';
import { SukukService } from '../src/sukuk/sukuk.service.js';
import { onChainAssetId, type BuiltTransaction } from '../src/sukuk/solana.client.js';
import { IssuanceError } from '../src/sukuk/sukuk.types.js';
import type { Asset } from '../src/assets/asset.types.js';

/**
 * Issuance, end to end, with one substitution: the chain.
 *
 * Everything else is real — the real template loaded from disk, the real
 * evaluator, the real Vault. What is replaced is only the RPC round trip,
 * because devnet adds latency, SOL cost and flakiness while proving nothing
 * the local assertions don't.
 *
 * The substitution is deliberately shallow. The fake still builds a genuine
 * `Transaction`, still hands over the genuine `serializeMessage()` bytes, and
 * still calls `verifySignatures()` — which is the same check the validator
 * performs. So the question this file answers is the one that was still open:
 * does a signature produced inside Vault actually satisfy Solana?
 *
 * Requires Vault:
 *   vault server -dev -dev-root-token-id=dev-only-token
 *   vault secrets enable transit
 */

const TEMPLATE_ID = 'ijara-real-estate-v1';

/** Fixed, so the test reuses one Vault key instead of creating one per run. */
const PASSING_ASSET_ID = 'AST-TEST-ISSUE';

const provider = new VaultCustodyProvider();

let compliance: ComplianceService;
let templates: TemplatesService;
let custody: CustodyService;

// ---------- The chain, faked at exactly one layer ----------

/**
 * Builds real transactions and verifies real signatures; only the RPC calls
 * are absent. `submit` runs `verifySignatures()` before returning, so a bad
 * custody signature fails here exactly as it would on-chain.
 */
class FakeSolanaClient {
  readonly cluster = 'test';
  readonly payer = Keypair.generate();
  readonly submitted: Transaction[] = [];

  /** Set to make `submit` throw, for testing stage attribution. */
  failOnSubmit: string | null = null;

  async buildInitializeSukuk(params: {
    onChainId: bigint;
    totalUnits: number;
    authority: PublicKey;
  }): Promise<BuiltTransaction> {
    // A transfer *from* the authority makes it a required signer, which is
    // the same signing shape initialize_sukuk has: a local fee payer plus a
    // custody-held authority that signs but is never debited in the real
    // instruction.
    const instruction = SystemProgram.transfer({
      fromPubkey: params.authority,
      toPubkey: this.payer.publicKey,
      lamports: 1,
    });

    const transaction = new Transaction().add(instruction);
    transaction.feePayer = this.payer.publicKey;
    // Any valid 32-byte base58 value works; no RPC needed to serialize.
    transaction.recentBlockhash = PublicKey.default.toBase58();
    transaction.partialSign(this.payer);

    return {
      transaction,
      message: Uint8Array.from(transaction.serializeMessage()),
      sukukPda: this.deriveSukukPda(params.onChainId),
      mint: Keypair.generate().publicKey,
    };
  }

  async submit(
    built: BuiltTransaction,
    authority: PublicKey,
    signature: Uint8Array,
  ): Promise<string> {
    if (this.failOnSubmit) throw new Error(this.failOnSubmit);

    built.transaction.addSignature(authority, Buffer.from(signature));

    // The assertion the whole file exists for. `verifySignatures` is
    // tweetnacl over the serialized message — the same arithmetic
    // ed25519-dalek performs on the validator.
    if (!built.transaction.verifySignatures()) {
      throw new Error('signature does not verify against the transaction');
    }

    this.submitted.push(built.transaction);
    return 'FakeTxSignature' + this.submitted.length;
  }

  deriveSukukPda(onChainId: bigint): PublicKey {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(onChainId);
    return PublicKey.findProgramAddressSync(
      [Buffer.from('sukuk'), buf],
      SystemProgram.programId,
    )[0];
  }

  explorerTx(signature: string): string {
    return `https://explorer.solana.com/tx/${signature}?cluster=test`;
  }

  async fetchSukuk(): Promise<Record<string, unknown>> {
    throw new Error('not needed for these tests');
  }
}

// ---------- Fixtures ----------

function fixture(id: string): Asset {
  return JSON.parse(
    readFileSync(join(__dirname, '..', 'fixtures', `${id}.json`), 'utf8'),
  ) as Asset;
}

/** A fixture under a different asset_id, so a test can be hermetic. */
function withId(asset: Asset, assetId: string): Asset {
  return { ...asset, asset_id: assetId };
}

function service(chain: FakeSolanaClient): SukukService {
  return new SukukService(compliance, templates, custody, chain as any);
}

beforeAll(async () => {
  if (!(await provider.healthCheck())) {
    throw new Error(
      'Vault is not reachable. Custody is not mockable here — the point is to ' +
        'prove real signatures verify. Start it with:\n' +
        '  vault server -dev -dev-root-token-id=dev-only-token\n' +
        '  vault secrets enable transit',
    );
  }

  templates = new TemplatesService();
  templates.onModuleInit();

  const assets = new AssetsService();
  assets.onModuleInit();

  compliance = new ComplianceService(templates, assets);
  custody = new CustodyService(provider);
});

// ---------- The ordering control ----------

describe('issuance refuses before it commits anything', () => {
  it('rejects an asset that fails screening, and creates no key for it', async () => {
    // A unique id so nothing from an earlier run can mask the assertion.
    const assetId = `AST-FAIL-${Date.now()}`;
    const asset = withId(fixture('AST-003'), assetId);
    const chain = new FakeSolanaClient();

    await expect(
      service(chain).issue({ asset, templateId: TEMPLATE_ID, totalUnits: 1000 }),
    ).rejects.toMatchObject({ stage: 'screening' });

    // The control, stated as a test rather than as a comment: no issuance key
    // exists for an asset that did not pass. Because the key is created only
    // after a pass, "there is a key for this asset" is itself evidence.
    await expect(
      custody.getPublicKey(`issuer-${assetId}`),
    ).rejects.toMatchObject({ code: 'KEY_NOT_FOUND' });

    // And nothing reached the chain.
    expect(chain.submitted).toHaveLength(0);
  });

  it('reports every failed condition, not just the first', async () => {
    const asset = withId(fixture('AST-003'), `AST-FAIL-${Date.now()}`);

    try {
      await service(new FakeSolanaClient()).issue({
        asset,
        templateId: TEMPLATE_ID,
        totalUnits: 1000,
      });
      expect.unreachable('a failing asset must not issue');
    } catch (error) {
      const issuance = error as IssuanceError;
      const failed = issuance.screening!.results.filter((r) => !r.passed);

      // An issuer who has to resubmit four times to discover four problems
      // will not use the platform twice.
      expect(failed.length).toBeGreaterThan(1);
    }
  });

  it('refuses an asset with no asset_id', async () => {
    const asset = { ...fixture('AST-001') } as Asset;
    delete (asset as Record<string, unknown>).asset_id;

    await expect(
      service(new FakeSolanaClient()).issue({
        asset,
        templateId: TEMPLATE_ID,
        totalUnits: 1000,
      }),
    ).rejects.toMatchObject({ stage: 'screening' });
  });
});

// ---------- The signature ----------

describe('a Vault-held key can authorise a Solana transaction', () => {
  it('issues, and the custody signature verifies against the transaction', async () => {
    const asset = withId(fixture('AST-001'), PASSING_ASSET_ID);
    const chain = new FakeSolanaClient();

    const result = await service(chain).issue({
      asset,
      templateId: TEMPLATE_ID,
      totalUnits: 1000,
    });

    // `submit` threw if verification failed, so reaching here is the proof.
    // Asserting again makes the intent explicit rather than incidental.
    expect(chain.submitted).toHaveLength(1);
    expect(chain.submitted[0].verifySignatures()).toBe(true);

    expect(result.assetId).toBe(PASSING_ASSET_ID);
    expect(result.custody.handle).toBe(`issuer-${PASSING_ASSET_ID}`);
    expect(result.custody.provider).toBe('vault-transit');

    // The authority on the transaction is the Vault public key, not a local
    // keypair. No private key for it exists anywhere in this process.
    expect(result.custody.authority).toBe(
      new PublicKey(await custody.getPublicKey(result.custody.handle)).toBase58(),
    );
  });

  it('records the screening hash in the custody audit trail', async () => {
    const asset = withId(fixture('AST-001'), PASSING_ASSET_ID);

    const result = await service(new FakeSolanaClient()).issue({
      asset,
      templateId: TEMPLATE_ID,
      totalUnits: 500,
    });

    const signEntry = custody
      .getAuditLog()
      .find((e) => e.operation === 'sign' && e.handle === result.custody.handle);

    expect(signEntry).toBeDefined();
    // Without this, the trail records that a signature happened but not what
    // authorised it, which is most of the value gone.
    expect(signEntry!.reason).toContain(result.screening.hash.slice(0, 16));
    expect(signEntry!.messageDigest).toBeDefined();
  });

  it('reuses the existing key when the same asset is issued again', async () => {
    // Retrying a failed issuance must not rotate the key. If it did, the
    // authority recorded by the first attempt would be orphaned.
    const asset = withId(fixture('AST-001'), PASSING_ASSET_ID);

    const first = await service(new FakeSolanaClient()).issue({
      asset,
      templateId: TEMPLATE_ID,
      totalUnits: 1000,
    });
    const second = await service(new FakeSolanaClient()).issue({
      asset,
      templateId: TEMPLATE_ID,
      totalUnits: 1000,
    });

    expect(second.custody.authority).toBe(first.custody.authority);
  });
});

// ---------- Attribution ----------

describe('failures say which step refused', () => {
  it('attributes a submission failure to submission, with the screening attached', async () => {
    const asset = withId(fixture('AST-001'), PASSING_ASSET_ID);
    const chain = new FakeSolanaClient();
    chain.failOnSubmit = 'blockhash not found';

    try {
      await service(chain).issue({
        asset,
        templateId: TEMPLATE_ID,
        totalUnits: 1000,
      });
      expect.unreachable('submission was set to fail');
    } catch (error) {
      const issuance = error as IssuanceError;

      // A screening rejection is the system working; a submission failure is
      // an outage. Whoever is paged needs to be able to tell them apart, and
      // the controller maps these onto 422 and 503 respectively.
      expect(issuance.stage).toBe('submission');
      expect(issuance.screening?.passed).toBe(true);
    }
  });
});

// ---------- Identity ----------

describe('onChainAssetId', () => {
  it('is deterministic', () => {
    expect(onChainAssetId('AST-001')).toBe(onChainAssetId('AST-001'));
  });

  it('separates assets whose ids differ by one character', () => {
    expect(onChainAssetId('AST-001')).not.toBe(onChainAssetId('AST-002'));
  });

  it('stays inside the signed 64-bit range', () => {
    // Anchor's BN and several explorers render a u64 above 2^63 as negative.
    // Clearing the top bit costs one bit of space and avoids a class of
    // confusing display bugs.
    for (const id of ['AST-001', 'AST-999', 'a', '', 'x'.repeat(200)]) {
      const value = onChainAssetId(id);
      expect(value).toBeGreaterThanOrEqual(0n);
      expect(value).toBeLessThan(2n ** 63n);
    }
  });
});
