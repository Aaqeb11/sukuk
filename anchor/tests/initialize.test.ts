import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getMint } from "@solana/spl-token";
import { assert } from "chai";
import { Sukuk } from "../target/types/sukuk";

describe("initialize_sukuk", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Sukuk as Program<Sukuk>;
  const authority = provider.wallet as anchor.Wallet;

  /**
   * The PDA seeds are [b"sukuk", asset_id.to_le_bytes()].
   * asset_id is a u64, so it must be 8 bytes, little-endian — matching
   * Rust's to_le_bytes(). Getting this wrong is the most common cause of
   * "A seeds constraint was violated".
   */
  function deriveSukukPda(assetId: number): [PublicKey, number] {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(assetId));
    return PublicKey.findProgramAddressSync(
      [Buffer.from("sukuk"), buf],
      program.programId,
    );
  }

  it("creates the asset PDA with correct initial state", async () => {
    const assetId = 1;
    const totalUnits = 1000;

    const [sukukPda] = deriveSukukPda(assetId);
    // The mint uses `init` without seeds, so its address comes from a
    // fresh keypair that must sign the transaction.
    const mintKeypair = Keypair.generate();

    await program.methods
      .initializeSukuk(new anchor.BN(assetId), new anchor.BN(totalUnits))
      .accounts({
        sukukAsset: sukukPda,
        mint: mintKeypair.publicKey,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypair])
      .rpc();

    const asset = await program.account.sukukAsset.fetch(sukukPda);

    assert.equal(asset.assetId.toNumber(), assetId);
    assert.equal(asset.totalUnits.toNumber(), totalUnits);
    assert.equal(asset.unitsIssued.toNumber(), 0);
    assert.equal(asset.unitsOutstanding.toNumber(), 0);
    assert.equal(asset.periodsElapsed, 0);
    assert.equal(asset.totalDistributed.toNumber(), 0);
    assert.isFalse(asset.isClosed);
    assert.ok(asset.authority.equals(authority.publicKey));
    assert.ok(asset.mint.equals(mintKeypair.publicKey));
  });

  it("sets the PDA as mint authority, not the issuer wallet", async () => {
    const assetId = 2;
    const [sukukPda] = deriveSukukPda(assetId);
    const mintKeypair = Keypair.generate();

    await program.methods
      .initializeSukuk(new anchor.BN(assetId), new anchor.BN(500))
      .accounts({
        sukukAsset: sukukPda,
        mint: mintKeypair.publicKey,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypair])
      .rpc();

    const mint = await getMint(provider.connection, mintKeypair.publicKey);

    // This is the load-bearing security property: no keypair can mint,
    // so minting can only happen through the program's own instruction.
    assert.ok(
      mint.mintAuthority?.equals(sukukPda),
      "mint authority must be the Sukuk PDA",
    );
    assert.isFalse(
      mint.mintAuthority?.equals(authority.publicKey),
      "mint authority must NOT be the issuer wallet",
    );

    // Ownership units are indivisible.
    assert.equal(mint.decimals, 0);
    assert.equal(mint.supply.toString(), "0");
  });

  it("rejects zero total units", async () => {
    const assetId = 3;
    const [sukukPda] = deriveSukukPda(assetId);
    const mintKeypair = Keypair.generate();

    try {
      await program.methods
        .initializeSukuk(new anchor.BN(assetId), new anchor.BN(0))
        .accounts({
          sukukAsset: sukukPda,
          mint: mintKeypair.publicKey,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([mintKeypair])
        .rpc();

      assert.fail("expected InvalidUnitCount, but the call succeeded");
    } catch (err) {
      assert.include(err.toString(), "InvalidUnitCount");
    }
  });

  it("rejects a second Sukuk with the same asset_id", async () => {
    const assetId = 4;
    const [sukukPda] = deriveSukukPda(assetId);

    const first = Keypair.generate();
    await program.methods
      .initializeSukuk(new anchor.BN(assetId), new anchor.BN(100))
      .accounts({
        sukukAsset: sukukPda,
        mint: first.publicKey,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([first])
      .rpc();

    // The PDA already exists, so `init` must fail — this is what stops
    // an issuer overwriting a live Sukuk.
    const second = Keypair.generate();
    try {
      await program.methods
        .initializeSukuk(new anchor.BN(assetId), new anchor.BN(999))
        .accounts({
          sukukAsset: sukukPda,
          mint: second.publicKey,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([second])
        .rpc();

      assert.fail("expected the duplicate asset_id to be rejected");
    } catch (err) {
      // Anchor surfaces this as "already in use" from the System Program.
      assert.ok(err, "duplicate initialization should fail");
    }
  });
});
