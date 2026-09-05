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

/**
 * Full lifecycle: one Sukuk followed from issuance to closure.
 *
 * The other test files check each instruction in isolation. This one checks
 * they compose — that state carried between instructions stays consistent,
 * and that the Diminishing Musharaka shape (ownership shrinking to zero over
 * successive periods) actually holds end to end.
 */
describe("sukuk lifecycle", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Sukuk as Program<Sukuk>;
  const authority = provider.wallet as anchor.Wallet;

  // Unique per file, so asset IDs never collide across test files.
  let nextId = 5000;
  const assetId = () => nextId++;

  const alice = Keypair.generate();
  const bob = Keypair.generate();

  function deriveSukukPda(id: number): PublicKey {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(id));
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

  function holderPairs(pairs: [PublicKey, PublicKey][]) {
    return pairs.flatMap(([ata, wallet]) => [
      { pubkey: ata, isSigner: false, isWritable: false },
      { pubkey: wallet, isSigner: false, isWritable: true },
    ]);
  }

  beforeAll(async () => {
    for (const wallet of [alice, bob]) {
      const sig = await provider.connection.requestAirdrop(
        wallet.publicKey,
        LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    }
  });

  it("runs a Sukuk from issuance through to closure", async () => {
    const id = assetId();
    const sukukPda = deriveSukukPda(id);
    const mintKeypair = Keypair.generate();
    const mint = mintKeypair.publicKey;

    // ---------- 1. Issuance ----------
    // A 1000-unit Sukuk against one asset. In production the off-chain
    // eligibility engine screens the asset before this point.

    await program.methods
      .initializeSukuk(new anchor.BN(id), new anchor.BN(1000))
      .accountsPartial({
        sukukAsset: sukukPda,
        mint,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([mintKeypair])
      .rpc();

    let asset = await program.account.sukukAsset.fetch(sukukPda);
    assert.equal(asset.totalUnits.toNumber(), 1000);
    assert.equal(asset.unitsOutstanding.toNumber(), 0);
    assert.isFalse(asset.isClosed);

    // Minting authority sits with the PDA, so no keypair can mint directly.
    const mintAtIssuance = await getMint(provider.connection, mint);
    assert.ok(mintAtIssuance.mintAuthority?.equals(sukukPda));

    // ---------- 2. Investors subscribe ----------
    // Alice takes 600 units, Bob 400. The asset is fully subscribed.

    const aliceAta = await createAta(mint, alice.publicKey);
    const bobAta = await createAta(mint, bob.publicKey);

    for (const [ata, units] of [
      [aliceAta, 600],
      [bobAta, 400],
    ] as [PublicKey, number][]) {
      await program.methods
        .mintUnits(new anchor.BN(id), new anchor.BN(units))
        .accountsPartial({
          sukukAsset: sukukPda,
          mint,
          investorTokenAccount: ata,
          authority: authority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
    }

    asset = await program.account.sukukAsset.fetch(sukukPda);
    assert.equal(asset.unitsIssued.toNumber(), 1000);
    assert.equal(asset.unitsOutstanding.toNumber(), 1000);

    // ---------- 3. Period one: rent distributed ----------
    // 1,000,000 lamports of rent, split by ownership: 60% / 40%.

    const holders = holderPairs([
      [aliceAta, alice.publicKey],
      [bobAta, bob.publicKey],
    ]);

    const aliceBeforeP1 = await provider.connection.getBalance(alice.publicKey);
    const bobBeforeP1 = await provider.connection.getBalance(bob.publicKey);

    await program.methods
      .distributeProfit(new anchor.BN(id), new anchor.BN(1_000_000))
      .accountsPartial({
        sukukAsset: sukukPda,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(holders)
      .rpc();

    assert.equal(
      (await provider.connection.getBalance(alice.publicKey)) - aliceBeforeP1,
      600_000
    );
    assert.equal(
      (await provider.connection.getBalance(bob.publicKey)) - bobBeforeP1,
      400_000
    );

    // ---------- 4. Period one: partial buyback ----------
    // The lessee buys back 200 units from Alice and 100 from Bob.
    // Outstanding ownership starts shrinking — the Diminishing Musharaka
    // mechanic. Note units_issued stays at 1000 throughout: it is a
    // historical record, not live state.

    await program.methods
      .buybackAndBurn(new anchor.BN(id), new anchor.BN(200))
      .accountsPartial({
        sukukAsset: sukukPda,
        mint,
        holderTokenAccount: aliceAta,
        holder: alice.publicKey,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([alice])
      .rpc();

    await program.methods
      .buybackAndBurn(new anchor.BN(id), new anchor.BN(100))
      .accountsPartial({
        sukukAsset: sukukPda,
        mint,
        holderTokenAccount: bobAta,
        holder: bob.publicKey,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([bob])
      .rpc();

    asset = await program.account.sukukAsset.fetch(sukukPda);
    assert.equal(asset.unitsOutstanding.toNumber(), 700); // 1000 - 300
    assert.equal(asset.unitsIssued.toNumber(), 1000); // unchanged
    assert.equal(
      (await getMint(provider.connection, mint)).supply.toString(),
      "700"
    );

    // ---------- 5. Period two: rent on the reduced base ----------
    // Alice now holds 400 of 700, Bob 300 of 700. The same rent figure
    // therefore splits differently — this is the point of the structure:
    // returns follow ownership, and ownership is shrinking.

    const aliceBeforeP2 = await provider.connection.getBalance(alice.publicKey);
    const bobBeforeP2 = await provider.connection.getBalance(bob.publicKey);

    await program.methods
      .distributeProfit(new anchor.BN(id), new anchor.BN(700_000))
      .accountsPartial({
        sukukAsset: sukukPda,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(holders)
      .rpc();

    // 700_000 * 400 / 700 = 400_000 | 700_000 * 300 / 700 = 300_000
    assert.equal(
      (await provider.connection.getBalance(alice.publicKey)) - aliceBeforeP2,
      400_000
    );
    assert.equal(
      (await provider.connection.getBalance(bob.publicKey)) - bobBeforeP2,
      300_000
    );

    asset = await program.account.sukukAsset.fetch(sukukPda);
    assert.equal(asset.periodsElapsed, 2);
    assert.equal(asset.totalDistributed.toNumber(), 1_700_000);

    // ---------- 6. Redemption is blocked while units remain ----------

    try {
      await program.methods
        .redeem(new anchor.BN(id))
        .accountsPartial({
          sukukAsset: sukukPda,
          authority: authority.publicKey,
        })
        .rpc();
      assert.fail("redeem should be blocked while units are outstanding");
    } catch (err) {
      assert.include(err.toString(), "UnitsStillOutstanding");
    }

    // ---------- 7. Final buyback: ownership fully reverts ----------

    await program.methods
      .buybackAndBurn(new anchor.BN(id), new anchor.BN(400))
      .accountsPartial({
        sukukAsset: sukukPda,
        mint,
        holderTokenAccount: aliceAta,
        holder: alice.publicKey,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([alice])
      .rpc();

    await program.methods
      .buybackAndBurn(new anchor.BN(id), new anchor.BN(300))
      .accountsPartial({
        sukukAsset: sukukPda,
        mint,
        holderTokenAccount: bobAta,
        holder: bob.publicKey,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([bob])
      .rpc();

    asset = await program.account.sukukAsset.fetch(sukukPda);
    assert.equal(asset.unitsOutstanding.toNumber(), 0);

    // Both investors are fully bought out.
    assert.equal(
      (await getAccount(provider.connection, aliceAta)).amount.toString(),
      "0"
    );
    assert.equal(
      (await getAccount(provider.connection, bobAta)).amount.toString(),
      "0"
    );
    assert.equal(
      (await getMint(provider.connection, mint)).supply.toString(),
      "0"
    );

    // ---------- 8. Closure ----------

    await program.methods
      .redeem(new anchor.BN(id))
      .accountsPartial({
        sukukAsset: sukukPda,
        authority: authority.publicKey,
      })
      .rpc();

    asset = await program.account.sukukAsset.fetch(sukukPda);
    assert.isTrue(asset.isClosed);

    // The record survives closure: 1000 units were issued, 2 periods ran,
    // 1,700,000 lamports were distributed. Outstanding is zero.
    assert.equal(asset.unitsIssued.toNumber(), 1000);
    assert.equal(asset.unitsOutstanding.toNumber(), 0);
    assert.equal(asset.periodsElapsed, 2);
    assert.equal(asset.totalDistributed.toNumber(), 1_700_000);

    // ---------- 9. A closed Sukuk is inert ----------

    try {
      await program.methods
        .mintUnits(new anchor.BN(id), new anchor.BN(10))
        .accountsPartial({
          sukukAsset: sukukPda,
          mint,
          investorTokenAccount: aliceAta,
          authority: authority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      assert.fail("minting on a closed Sukuk should fail");
    } catch (err) {
      assert.include(err.toString(), "AlreadyClosed");
    }

    try {
      await program.methods
        .distributeProfit(new anchor.BN(id), new anchor.BN(1000))
        .accountsPartial({
          sukukAsset: sukukPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(holders)
        .rpc();
      assert.fail("distributing on a closed Sukuk should fail");
    } catch (err) {
      assert.include(err.toString(), "AlreadyClosed");
    }
  });
});
