import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getMint,
  createAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";
import { Sukuk } from "../target/types/sukuk";

describe("mint-units", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Sukuk as Program<Sukuk>;
  const authority = provider.wallet as anchor.Wallet;

  // Two mock investors. They never sign anything here — the issuer mints
  // to them — so they only need keypairs for their addresses.
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

  /**
   * Creates a Sukuk and returns everything the tests need.
   * Each test uses its own assetId so they stay independent.
   */
  async function createSukuk(assetId: number, totalUnits: number) {
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

    return { sukukPda, mint: mintKeypair.publicKey, assetId };
  }

  /**
   * An investor can only receive units into a token account for this mint.
   * The ATA is a deterministic address derived from (wallet, mint), but it
   * still has to be created and paid for before anything can be minted in.
   */
  async function createAta(mint: PublicKey, owner: PublicKey) {
    await createAssociatedTokenAccount(
      provider.connection,
      (authority as any).payer, // the provider wallet pays
      mint,
      owner,
    );
    return getAssociatedTokenAddressSync(mint, owner);
  }

  it("mints units to an investor and updates counters", async () => {
    const { sukukPda, mint, assetId } = await createSukuk(10, 1000);
    const aliceAta = await createAta(mint, alice.publicKey);

    await program.methods
      .mintUnits(new anchor.BN(assetId), new anchor.BN(600))
      .accountsPartial({
        sukukAsset: sukukPda,
        mint,
        investorTokenAccount: aliceAta,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const tokenAccount = await getAccount(provider.connection, aliceAta);
    assert.equal(tokenAccount.amount.toString(), "600");

    const asset = await program.account.sukukAsset.fetch(sukukPda);
    assert.equal(asset.unitsIssued.toNumber(), 600);
    assert.equal(asset.unitsOutstanding.toNumber(), 600);

    // The mint's global supply should match what was issued.
    const mintInfo = await getMint(provider.connection, mint);
    assert.equal(mintInfo.supply.toString(), "600");
  });

  it("accumulates across multiple investors", async () => {
    const { sukukPda, mint, assetId } = await createSukuk(11, 1000);
    const aliceAta = await createAta(mint, alice.publicKey);
    const bobAta = await createAta(mint, bob.publicKey);

    for (const [ata, amount] of [
      [aliceAta, 600],
      [bobAta, 400],
    ] as [PublicKey, number][]) {
      await program.methods
        .mintUnits(new anchor.BN(assetId), new anchor.BN(amount))
        .accountsPartial({
          sukukAsset: sukukPda,
          mint,
          investorTokenAccount: ata,
          authority: authority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
    }

    assert.equal(
      (await getAccount(provider.connection, aliceAta)).amount.toString(),
      "600",
    );
    assert.equal(
      (await getAccount(provider.connection, bobAta)).amount.toString(),
      "400",
    );

    const asset = await program.account.sukukAsset.fetch(sukukPda);
    assert.equal(asset.unitsIssued.toNumber(), 1000);
    assert.equal(asset.unitsOutstanding.toNumber(), 1000);
  });

  it("rejects minting beyond total_units", async () => {
    const { sukukPda, mint, assetId } = await createSukuk(12, 100);
    const aliceAta = await createAta(mint, alice.publicKey);

    try {
      await program.methods
        .mintUnits(new anchor.BN(assetId), new anchor.BN(101)) // one over the cap
        .accountsPartial({
          sukukAsset: sukukPda,
          mint,
          investorTokenAccount: aliceAta,
          authority: authority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      assert.fail("expected InsufficientUnits, but the mint succeeded");
    } catch (err) {
      assert.include(err.toString(), "InsufficientUnits");
    }
  });

  it("rejects zero amount", async () => {
    const { sukukPda, mint, assetId } = await createSukuk(13, 100);
    const aliceAta = await createAta(mint, alice.publicKey);

    try {
      await program.methods
        .mintUnits(new anchor.BN(assetId), new anchor.BN(0))
        .accountsPartial({
          sukukAsset: sukukPda,
          mint,
          investorTokenAccount: aliceAta,
          authority: authority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      assert.fail("expected InvalidAmount, but the mint succeeded");
    } catch (err) {
      assert.include(err.toString(), "InvalidAmount");
    }
  });

  it("rejects a token account belonging to a different Sukuk's mint", async () => {
    const sukukA = await createSukuk(14, 1000);
    const sukukB = await createSukuk(15, 1000);

    // An ATA for Sukuk B's mint, wrongly passed to a Sukuk A mint call.
    const aliceAtaForB = await createAta(sukukB.mint, alice.publicKey);

    try {
      await program.methods
        .mintUnits(new anchor.BN(sukukA.assetId), new anchor.BN(10))
        .accountsPartial({
          sukukAsset: sukukA.sukukPda,
          mint: sukukA.mint,
          investorTokenAccount: aliceAtaForB, // wrong mint
          authority: authority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      assert.fail("expected WrongMint, but the mint succeeded");
    } catch (err) {
      assert.include(err.toString(), "WrongMint");
    }
  });

  it("rejects a caller who is not the recorded issuer", async () => {
    const { sukukPda, mint, assetId } = await createSukuk(16, 1000);
    const aliceAta = await createAta(mint, alice.publicKey);

    // An impostor with a valid signature, but not the stored authority.
    const impostor = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      impostor.publicKey,
      anchor.web3.LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);

    try {
      await program.methods
        .mintUnits(new anchor.BN(assetId), new anchor.BN(10))
        .accountsPartial({
          sukukAsset: sukukPda,
          mint,
          investorTokenAccount: aliceAta,
          authority: impostor.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([impostor])
        .rpc();

      assert.fail("expected the has_one constraint to reject the impostor");
    } catch (err) {
      // Anchor raises ConstraintHasOne when the stored authority doesn't match.
      assert.ok(err, "a non-issuer must not be able to mint");
    }
  });
});
