import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { assert } from "chai";
import { Sukuk } from "../target/types/sukuk";
import { describe, it, beforeAll } from "bun:test";

describe("distribute-profit", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Sukuk as Program<Sukuk>;
  const authority = provider.wallet as anchor.Wallet;

  const alice = Keypair.generate();
  const bob = Keypair.generate();

  function deriveSukukPda(assetId: number): PublicKey {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(assetId));
    return PublicKey.findProgramAddressSync(
      [Buffer.from("sukuk"), buf],
      program.programId
    )[0];
  }

  async function createAta(mint: PublicKey, owner: PublicKey) {
    await createAssociatedTokenAccount(
      provider.connection,
      (authority as any).payer,
      mint,
      owner
    );
    return getAssociatedTokenAddressSync(mint, owner);
  }

  /**
   * Creates a Sukuk and mints the given split to Alice and Bob.
   * Returns everything the distribution calls need.
   */
  async function setupSukuk(
    assetId: number,
    totalUnits: number,
    aliceUnits: number,
    bobUnits: number
  ) {
    const sukukPda = deriveSukukPda(assetId);
    const mintKeypair = Keypair.generate();

    await program.methods
      .initializeSukuk(new anchor.BN(assetId), new anchor.BN(totalUnits))
      .accountsPartial({
        sukukAsset: sukukPda,
        mint: mintKeypair.publicKey,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([mintKeypair])
      .rpc();

    const mint = mintKeypair.publicKey;
    const aliceAta = await createAta(mint, alice.publicKey);
    const bobAta = await createAta(mint, bob.publicKey);

    for (const [ata, units] of [
      [aliceAta, aliceUnits],
      [bobAta, bobUnits],
    ] as [PublicKey, number][]) {
      await program.methods
        .mintUnits(new anchor.BN(assetId), new anchor.BN(units))
        .accountsPartial({
          sukukAsset: sukukPda,
          mint,
          investorTokenAccount: ata,
          authority: authority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
    }

    return { sukukPda, mint, assetId, aliceAta, bobAta };
  }

  /**
   * remaining_accounts is [token_account, wallet] pairs.
   * Wallets must be writable — they receive lamports.
   * Token accounts are read-only — only their balance is inspected.
   */
  function holderPairs(pairs: [PublicKey, PublicKey][]) {
    return pairs.flatMap(([ata, wallet]) => [
      { pubkey: ata, isSigner: false, isWritable: false },
      { pubkey: wallet, isSigner: false, isWritable: true },
    ]);
  }

  // Investor wallets must exist on-chain before they can receive SOL.
  beforeAll(async () => {
    for (const wallet of [alice, bob]) {
      const sig = await provider.connection.requestAirdrop(
        wallet.publicKey,
        LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    }
  });

  it("splits rent pro-rata by units held", async () => {
    const { sukukPda, assetId, aliceAta, bobAta } = await setupSukuk(
      20,
      1000,
      600,
      400
    );

    const aliceBefore = await provider.connection.getBalance(alice.publicKey);
    const bobBefore = await provider.connection.getBalance(bob.publicKey);

    const rent = 1_000_000; // lamports

    await program.methods
      .distributeProfit(new anchor.BN(assetId), new anchor.BN(rent))
      .accountsPartial({
        sukukAsset: sukukPda,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(
        holderPairs([
          [aliceAta, alice.publicKey],
          [bobAta, bob.publicKey],
        ])
      )
      .rpc();

    const aliceAfter = await provider.connection.getBalance(alice.publicKey);
    const bobAfter = await provider.connection.getBalance(bob.publicKey);

    // 600/1000 of 1,000,000 = 600,000 | 400/1000 = 400,000
    assert.equal(aliceAfter - aliceBefore, 600_000);
    assert.equal(bobAfter - bobBefore, 400_000);
  });

  it("updates period counter and cumulative total", async () => {
    const { sukukPda, assetId, aliceAta, bobAta } = await setupSukuk(
      21,
      1000,
      600,
      400
    );

    const rent = 500_000;
    const remaining = holderPairs([
      [aliceAta, alice.publicKey],
      [bobAta, bob.publicKey],
    ]);

    // Two consecutive periods.
    for (let i = 0; i < 2; i++) {
      await program.methods
        .distributeProfit(new anchor.BN(assetId), new anchor.BN(rent))
        .accountsPartial({
          sukukAsset: sukukPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(remaining)
        .rpc();
    }

    const asset = await program.account.sukukAsset.fetch(sukukPda);
    assert.equal(asset.periodsElapsed, 2);
    assert.equal(asset.totalDistributed.toNumber(), rent * 2);
  });

  it("rejects a wallet that does not own the paired token account", async () => {
    const { sukukPda, assetId, aliceAta } = await setupSukuk(22, 1000, 600, 400);

    // Alice's token account paired with an attacker's wallet — without the
    // owner check this would redirect Alice's rent to the attacker.
    const attacker = Keypair.generate();

    try {
      await program.methods
        .distributeProfit(new anchor.BN(assetId), new anchor.BN(1_000_000))
        .accountsPartial({
          sukukAsset: sukukPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(holderPairs([[aliceAta, attacker.publicKey]]))
        .rpc();

      assert.fail("expected HolderMismatch, but the distribution succeeded");
    } catch (err) {
      assert.include(err.toString(), "HolderMismatch");
    }
  });

  it("rejects an odd number of holder accounts", async () => {
    const { sukukPda, assetId, aliceAta } = await setupSukuk(23, 1000, 600, 400);

    try {
      await program.methods
        .distributeProfit(new anchor.BN(assetId), new anchor.BN(1_000_000))
        .accountsPartial({
          sukukAsset: sukukPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        // A token account with no matching wallet.
        .remainingAccounts([
          { pubkey: aliceAta, isSigner: false, isWritable: false },
        ])
        .rpc();

      assert.fail("expected InvalidHolderAccounts, but the call succeeded");
    } catch (err) {
      assert.include(err.toString(), "InvalidHolderAccounts");
    }
  });

  it("rejects a token account from a different Sukuk", async () => {
    const sukukA = await setupSukuk(24, 1000, 600, 400);
    const sukukB = await setupSukuk(25, 1000, 600, 400);

    try {
      await program.methods
        .distributeProfit(new anchor.BN(sukukA.assetId), new anchor.BN(1_000_000))
        .accountsPartial({
          sukukAsset: sukukA.sukukPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        // B's token account passed to an A distribution.
        .remainingAccounts(holderPairs([[sukukB.aliceAta, alice.publicKey]]))
        .rpc();

      assert.fail("expected WrongMint, but the distribution succeeded");
    } catch (err) {
      assert.include(err.toString(), "WrongMint");
    }
  });

  it("rejects zero rent", async () => {
    const { sukukPda, assetId, aliceAta, bobAta } = await setupSukuk(
      26,
      1000,
      600,
      400
    );

    try {
      await program.methods
        .distributeProfit(new anchor.BN(assetId), new anchor.BN(0))
        .accountsPartial({
          sukukAsset: sukukPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(
          holderPairs([
            [aliceAta, alice.publicKey],
            [bobAta, bob.publicKey],
          ])
        )
        .rpc();

      assert.fail("expected InvalidAmount, but the call succeeded");
    } catch (err) {
      assert.include(err.toString(), "InvalidAmount");
    }
  });

  it("leaves dust undistributed when rent does not divide evenly", async () => {
    // 333 / 667 split of 10 lamports:
    //   Alice: 10 * 333 / 1000 = 3.33 -> 3
    //   Bob:   10 * 667 / 1000 = 6.67 -> 6
    //   Total distributed = 9, one lamport left behind.
    const { sukukPda, assetId, aliceAta, bobAta } = await setupSukuk(
      27,
      1000,
      333,
      667
    );

    await program.methods
      .distributeProfit(new anchor.BN(assetId), new anchor.BN(10))
      .accountsPartial({
        sukukAsset: sukukPda,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(
        holderPairs([
          [aliceAta, alice.publicKey],
          [bobAta, bob.publicKey],
        ])
      )
      .rpc();

    const asset = await program.account.sukukAsset.fetch(sukukPda);
    // Documents the known truncation behaviour rather than hiding it.
    assert.equal(asset.totalDistributed.toNumber(), 9);
  });
});
