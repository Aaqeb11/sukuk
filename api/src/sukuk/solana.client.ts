import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Anchor ships CommonJS, and this package runs as ESM. Node's CJS lexer can
// see `AnchorProvider` and `Program` but not `BN`, which Anchor re-exports
// from bn.js through a chain the lexer will not follow — named-importing it
// fails at load time.
//
// The default export is Anchor's whole `module.exports`, where BN is present.
// Taking it from there rather than importing bn.js directly matters: Anchor's
// coder does instanceof checks, and a separately-resolved copy of bn.js would
// be a different class that silently fails them.
import anchor from '@coral-xyz/anchor';
import type { Program } from '@coral-xyz/anchor';

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

// Synced from anchor/target/types/sukuk.ts by `bun run sync:idl`. A pure type
// with no runtime imports — it is what gives `program.account.sukukAsset` and
// `program.methods.initializeSukuk` real types instead of `any`.
import type { Sukuk } from './idl/sukuk.js';

const { AnchorProvider, BN, Program: AnchorProgram } = anchor;

/**
 * The chain boundary.
 *
 * Deliberately split into `build` and `submit` with the signing step in
 * between happening elsewhere. The alternative — a single `issue()` that
 * calls custody internally — would hide the most important sequence in the
 * system inside a method nobody reads. Here, SukukService shows it in one
 * readable function, which is what an auditor needs.
 *
 * This class holds the hot wallet. It pays rent and transaction fees and
 * authorises nothing. The key that authorises is in Vault and is never
 * reachable from here.
 */

const SUKUK_SEED = Buffer.from('sukuk');

export interface BuiltTransaction {
  transaction: Transaction;

  /**
   * The exact bytes each signer signs.
   *
   * Solana signatures are over the serialized *message*, not the transaction.
   * These go to custody untouched — re-serializing after signing would
   * produce a signature over different bytes and the validator would reject
   * it with an error that says nothing useful.
   */
  message: Uint8Array;

  sukukPda: PublicKey;
  mint: PublicKey;
}

@Injectable()
export class SolanaClient implements OnModuleInit {
  private readonly logger = new Logger(SolanaClient.name);

  private readonly connection: Connection;
  private readonly payer: Keypair;
  private readonly program: Program<Sukuk>;
  readonly cluster: string;

  constructor() {
    const endpoint =
      process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
    this.cluster = process.env.SOLANA_CLUSTER ?? 'devnet';

    // "confirmed" rather than the Anchor default of "processed": a read
    // immediately after a write at `processed` can land on a node that is one
    // slot behind and return pre-transaction state.
    this.connection = new Connection(endpoint, 'confirmed');

    this.payer = loadKeypair(
      process.env.SOLANA_PAYER_KEYPAIR ??
        join(process.env.HOME ?? '', '.config/solana/id.json'),
    );

    const idl = JSON.parse(
      readFileSync(
        process.env.SUKUK_IDL_PATH ??
          join(process.cwd(), 'src/sukuk/idl/sukuk.json'),
        'utf8',
      ),
    ) as Sukuk;

    // A provider with a wallet that refuses to sign. Anchor requires one to
    // construct a Program, but this class only ever calls `.instruction()` —
    // it builds instructions and never submits through Anchor. Giving it a
    // wallet that throws makes that structural rather than a convention.
    const provider = new AnchorProvider(
      this.connection,
      new RefusingWallet(this.payer.publicKey),
      { commitment: 'confirmed' },
    );

    this.program = new AnchorProgram<Sukuk>(idl, provider);
  }

  async onModuleInit(): Promise<void> {
    const balance = await this.connection.getBalance(this.payer.publicKey);
    const sol = balance / 1e9;

    this.logger.log(
      `Chain: ${this.cluster} · program ${this.program.programId.toBase58()}`,
    );
    this.logger.log(
      `Fee payer ${this.payer.publicKey.toBase58()} holds ${sol.toFixed(3)} SOL`,
    );

    if (balance < 0.05e9) {
      this.logger.warn(
        'Fee payer is low on SOL. Issuance will fail once it cannot cover rent.',
      );
    }
  }

  // ---------- Addresses ----------

  deriveSukukPda(onChainId: bigint): PublicKey {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(onChainId);
    return PublicKey.findProgramAddressSync(
      [SUKUK_SEED, buf],
      this.program.programId,
    )[0];
  }

  explorerTx(signature: string): string {
    return `https://explorer.solana.com/tx/${signature}?cluster=${this.cluster}`;
  }

  // ---------- Build ----------

  /**
   * Assembles an `initialize_sukuk` transaction, signs it with everything
   * held locally, and returns it together with the bytes custody must sign.
   *
   * Three signers: the fee payer and the new mint's keypair, both local, and
   * the issuance authority, which is not. The authority's signature is added
   * by `submit` once custody has produced it.
   */
  async buildInitializeSukuk(params: {
    onChainId: bigint;
    totalUnits: number;
    authority: PublicKey;
  }): Promise<BuiltTransaction> {
    const { onChainId, totalUnits, authority } = params;

    const sukukPda = this.deriveSukukPda(onChainId);
    const mintKeypair = Keypair.generate();

    const instruction = await this.program.methods
      .initializeSukuk(
        new BN(onChainId.toString()),
        new BN(totalUnits),
      )
      .accountsPartial({
        sukukAsset: sukukPda,
        mint: mintKeypair.publicKey,
        payer: this.payer.publicKey,
        authority,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    const transaction = new Transaction().add(instruction);
    transaction.feePayer = this.payer.publicKey;
    transaction.recentBlockhash = (
      await this.connection.getLatestBlockhash('confirmed')
    ).blockhash;

    // Local signers first. Signatures do not affect the message, so the bytes
    // captured below are the same ones every signer commits to.
    transaction.partialSign(this.payer, mintKeypair);

    return {
      transaction,
      message: Uint8Array.from(transaction.serializeMessage()),
      sukukPda,
      mint: mintKeypair.publicKey,
    };
  }

  // ---------- Submit ----------

  /**
   * Attaches the custody-produced signature and broadcasts.
   *
   * The signature is verified locally first. Without that check, a malformed
   * signature surfaces as a generic simulation failure from the RPC node,
   * and the real cause — that custody signed something other than what we
   * built — is invisible.
   */
  async submit(
    built: BuiltTransaction,
    authority: PublicKey,
    signature: Uint8Array,
  ): Promise<string> {
    built.transaction.addSignature(authority, Buffer.from(signature));

    if (!built.transaction.verifySignatures()) {
      throw new Error(
        'The custody signature does not verify against the transaction message. ' +
          'The bytes signed are not the bytes being submitted.',
      );
    }

    const txSignature = await this.connection.sendRawTransaction(
      built.transaction.serialize(),
      { preflightCommitment: 'confirmed' },
    );

    await this.connection.confirmTransaction(txSignature, 'confirmed');
    return txSignature;
  }

  // ---------- Read ----------

  async fetchSukuk(onChainId: bigint): Promise<Record<string, unknown>> {
    const pda = this.deriveSukukPda(onChainId);
    const account = await this.program.account.sukukAsset.fetch(pda, 'confirmed');
    return account as unknown as Record<string, unknown>;
  }
}

/**
 * Maps an asset's own identifier onto the u64 the program indexes by.
 *
 * The compliance side works in strings — "AST-001", a registry reference, an
 * internal asset code. The program's PDA seed is a u64, because a fixed-width
 * seed keeps the account derivation cheap and unambiguous.
 *
 * Hashing rather than keeping a counter or a lookup table: it is deterministic
 * from the asset ID alone, so the same asset always derives the same PDA with
 * no shared state to keep in sync, and no ordering dependency between whoever
 * screens an asset and whoever issues it.
 *
 * The top bit is cleared so the value is always a valid i64 too — Anchor's BN
 * and several explorers will render a u64 above 2^63 as negative.
 */
export function onChainAssetId(assetId: string): bigint {
  const digest = createHash('sha256').update(assetId, 'utf8').digest();
  return digest.readBigUInt64BE(0) & 0x7fffffffffffffffn;
}

// ---------- Internals ----------

function loadKeypair(path: string): Keypair {
  try {
    const secret = JSON.parse(readFileSync(path, 'utf8')) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(secret));
  } catch (error) {
    throw new Error(
      `Could not load the fee-payer keypair from '${path}'. ` +
        'Set SOLANA_PAYER_KEYPAIR to a valid Solana CLI keypair file. ' +
        `(${(error as Error).message})`,
    );
  }
}

/**
 * Satisfies Anchor's Wallet interface without being able to sign.
 *
 * Anchor's Program constructor requires a provider, and a provider requires a
 * wallet. This one throws on every signing path, so if any code ever reaches
 * for `.rpc()` instead of `.instruction()`, it fails loudly here rather than
 * quietly signing with a local key and bypassing custody entirely.
 */
class RefusingWallet {
  constructor(readonly publicKey: PublicKey) {}

  signTransaction(): never {
    throw new Error(
      'This provider cannot sign. Issuance signatures come from custody — ' +
        'build the instruction and route the message through CustodyService.',
    );
  }

  signAllTransactions(): never {
    return this.signTransaction();
  }
}
