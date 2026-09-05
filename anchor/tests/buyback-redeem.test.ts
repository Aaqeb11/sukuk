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
  getAccount,
  getMint,
} from "@solana/spl-token";
import { assert } from "chai";
import { Sukuk } from "../target/types/sukuk";
import { describe, it, beforeAll } from "bun:test";

describe("buyback-redeem", () => {
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

  /** Burns `units` from a holder. The holder signs to authorize the burn. */
  async function buyback(
    sukukPda: PublicKey,
    assetId: number,
    mint: PublicKey,
    holderAta: PublicKey,
    holder: Keypair,
    units: number
  ) {
    return program.methods
      .buybackAndBurn(new anchor.BN(assetId), new anchor.BN(units))
      .accountsPartial({
        sukukAsset: sukukPda,
        mint,
        holderTokenAccount: holderAta,
        holder: holder.publicKey,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([holder])
      .rpc();
  }

  // Investor wallets must exist on-chain and hold SOL to sign transactions.
  beforeAll(async () => {
    for (const wallet of [alice, bob]) {
      const sig = await provider.connection.requestAirdrop(
        wallet.publicKey,
        LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    }
  });

  // ---------- buyback_and_burn ----------

  it("buyback reduces outstanding units and investor tokens", async () => {
    const { sukukPda, assetId, aliceAta, mint } = await setupSukuk(
      30,
      1000,
      600,
      400
    );

    await buyback(sukukPda, assetId, mint, aliceAta, alice, 100);

    // Alice's holding drops from 600 to 500.
    const aliceAccount = await getAccount(provider.connection, aliceAta);
    assert.equal(aliceAccount.amount.toString(), "500");

    const asset = await program.account.sukukAsset.fetch(sukukPda);

    // Outstanding shrinks — this is the Diminishing Musharaka mechanic.
    assert.equal(asset.unitsOutstanding.toNumber(), 900);

    // But units_issued does NOT change. This is why the two fields exist
    // separately: issued is a historical record, outstanding is live state.
    assert.equal(asset.unitsIssued.toNumber(), 1000);

    // The mint's global supply drops too, since tokens were burned.
    const mintInfo = await getMint(provider.connection, mint);
    assert.equal(mintInfo.supply.toString(), "900");
  });

  it("accumulates across sequential buybacks", async () => {
    const { sukukPda, assetId, aliceAta, mint } = await setupSukuk(
      31,
      1000,
      600,
      400
    );

    await buyback(sukukPda, assetId, mint, aliceAta, alice, 100);
    await buyback(sukukPda, assetId, mint, aliceAta, alice, 200);

    const asset = await program.account.sukukAsset.fetch(sukukPda);
    // 1000 -> 900 -> 700. A single buyback could not prove this accumulates.
    assert.equal(asset.unitsOutstanding.toNumber(), 700);

    const aliceAccount = await getAccount(provider.connection, aliceAta);
    assert.equal(aliceAccount.amount.toString(), "300");
  });

  it("rejects burning more units than the holder owns", async () => {
    const { sukukPda, assetId, aliceAta, mint } = await setupSukuk(
      32,
      1000,
      600,
      400
    );

    try {
      // Alice holds 600.
      await buyback(sukukPda, assetId, mint, aliceAta, alice, 700);
      assert.fail("expected InsufficientUnits, but the burn succeeded");
    } catch (err) {
      assert.include(err.toString(), "InsufficientUnits");
    }
  });

  it("rejects a signer who does not own the token account", async () => {
    const { sukukPda, assetId, aliceAta, mint } = await setupSukuk(
      33,
      1000,
      600,
      400
    );

    try {
      // Bob signs, but the token account is Alice's. The Token Program
      // requires the account's owner to authorize a burn.
      await buyback(sukukPda, assetId, mint, aliceAta, bob, 100);
      assert.fail("expected the burn to be rejected");
    } catch (err) {
      assert.ok(err, "a non-owner must not be able to burn another's units");
    }
  });

  it("rejects zero units", async () => {
    const { sukukPda, assetId, aliceAta, mint } = await setupSukuk(
      34,
      1000,
      600,
      400
    );

    try {
      await buyback(sukukPda, assetId, mint, aliceAta, alice, 0);
      assert.fail("expected InvalidAmount, but the burn succeeded");
    } catch (err) {
      assert.include(err.toString(), "InvalidAmount");
    }
  });

  // ---------- redeem ----------

  it("refuses to redeem while units are still outstanding", async () => {
    const { sukukPda, assetId } = await setupSukuk(35, 1000, 600, 400);

    try {
      await program.methods
        .redeem(new anchor.BN(assetId))
        .accountsPartial({
          sukukAsset: sukukPda,
          authority: authority.publicKey,
        })
        .rpc();

      assert.fail("expected UnitsStillOutstanding, but redeem succeeded");
    } catch (err) {
      assert.include(err.toString(), "UnitsStillOutstanding");
    }
  });

  it("redeems once every unit has been bought back", async () => {
    const { sukukPda, assetId, aliceAta, bobAta, mint } = await setupSukuk(
      36,
      1000,
      600,
      400
    );

    // Both investors sell their entire holdings back.
    await buyback(sukukPda, assetId, mint, aliceAta, alice, 600);
    await buyback(sukukPda, assetId, mint, bobAta, bob, 400);

    const before = await program.account.sukukAsset.fetch(sukukPda);
    assert.equal(before.unitsOutstanding.toNumber(), 0);
    assert.isFalse(before.isClosed);

    await program.methods
      .redeem(new anchor.BN(assetId))
      .accountsPartial({
        sukukAsset: sukukPda,
        authority: authority.publicKey,
      })
      .rpc();

    const after = await program.account.sukukAsset.fetch(sukukPda);
    assert.isTrue(after.isClosed);
    // The historical record survives closure.
    assert.equal(after.unitsIssued.toNumber(), 1000);

    // Supply is fully burned.
    const mintInfo = await getMint(provider.connection, mint);
    assert.equal(mintInfo.supply.toString(), "0");
  });

  it("refuses to redeem a Sukuk that is already closed", async () => {
    const { sukukPda, assetId, aliceAta, bobAta, mint } = await setupSukuk(
      37,
      1000,
      600,
      400
    );

    await buyback(sukukPda, assetId, mint, aliceAta, alice, 600);
    await buyback(sukukPda, assetId, mint, bobAta, bob, 400);

    await program.methods
      .redeem(new anchor.BN(assetId))
      .accountsPartial({ sukukAsset: sukukPda, authority: authority.publicKey })
      .rpc();

    try {
      await program.methods
        .redeem(new anchor.BN(assetId))
        .accountsPartial({
          sukukAsset: sukukPda,
          authority: authority.publicKey,
        })
        .rpc();

      assert.fail("expected AlreadyClosed, but the second redeem succeeded");
    } catch (err) {
      assert.include(err.toString(), "AlreadyClosed");
    }
  });

  // ---------- closed-state gating ----------
  // A closed flag that gates nothing is just a label. These prove the
  // is_closed check in the other instructions actually does something.

  it("refuses to mint units on a closed Sukuk", async () => {
    const { sukukPda, assetId, aliceAta, bobAta, mint } = await setupSukuk(
      38,
      1000,
      600,
      400
    );

    await buyback(sukukPda, assetId, mint, aliceAta, alice, 600);
    await buyback(sukukPda, assetId, mint, bobAta, bob, 400);
    await program.methods
      .redeem(new anchor.BN(assetId))
      .accountsPartial({ sukukAsset: sukukPda, authority: authority.publicKey })
      .rpc();

    try {
      await program.methods
        .mintUnits(new anchor.BN(assetId), new anchor.BN(10))
        .accountsPartial({
          sukukAsset: sukukPda,
          mint,
          investorTokenAccount: aliceAta,
          authority: authority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      assert.fail("expected AlreadyClosed, but the mint succeeded");
    } catch (err) {
      assert.include(err.toString(), "AlreadyClosed");
    }
  });

  it("refuses to distribute profit on a closed Sukuk", async () => {
    const { sukukPda, assetId, aliceAta, bobAta, mint } = await setupSukuk(
      39,
      1000,
      600,
      400
    );

    await buyback(sukukPda, assetId, mint, aliceAta, alice, 600);
    await buyback(sukukPda, assetId, mint, bobAta, bob, 400);
    await program.methods
      .redeem(new anchor.BN(assetId))
      .accountsPartial({ sukukAsset: sukukPda, authority: authority.publicKey })
      .rpc();

    try {
      await program.methods
        .distributeProfit(new anchor.BN(assetId), new anchor.BN(1_000_000))
        .accountsPartial({
          sukukAsset: sukukPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts([
          { pubkey: aliceAta, isSigner: false, isWritable: false },
          { pubkey: alice.publicKey, isSigner: false, isWritable: true },
        ])
        .rpc();

      assert.fail("expected AlreadyClosed, but the distribution succeeded");
    } catch (err) {
      assert.include(err.toString(), "AlreadyClosed");
    }
  });
});
