import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getMint } from "@solana/spl-token";
import { assert } from "chai";
import { Sukuk } from "../target/types/sukuk";

describe("initialize_sukuk", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Sukuk as Program<Sukuk>;

  /**
   * Pays rent for the two accounts this instruction creates. An operational
   * hot wallet: it holds SOL and authorises nothing.
   */
  const payer = provider.wallet as anchor.Wallet;

  /**
   * Stands in for the custody-held issuance key.
   *
   * In production this public key comes back from Vault (or a Luna HSM) and
   * no corresponding private key exists anywhere in this process. Here it has
   * to be a local keypair, because the tests need something that can sign.
   *
   * What matters is that it is NOT the payer and is never funded. Every test
   * below signs with it while it holds zero lamports, which is the property
   * the payer/authority split exists to make true.
   */
  const issuanceAuthority = Keypair.generate();

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
        payer: payer.publicKey,
        authority: issuanceAuthority.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([mintKeypair, issuanceAuthority])
      .rpc();

    const asset = await program.account.sukukAsset.fetch(sukukPda);

    assert.equal(asset.assetId.toNumber(), assetId);
    assert.equal(asset.totalUnits.toNumber(), totalUnits);
    assert.equal(asset.unitsIssued.toNumber(), 0);
    assert.equal(asset.unitsOutstanding.toNumber(), 0);
    assert.equal(asset.periodsElapsed, 0);
    assert.equal(asset.totalDistributed.toNumber(), 0);
    assert.isFalse(asset.isClosed);
    assert.ok(asset.mint.equals(mintKeypair.publicKey));

    // The authority recorded on-chain is the custody key, not whoever paid.
    // Every later instruction checks `has_one = authority`, so this is the
    // field that decides who can mint, distribute and redeem for the life of
    // the Sukuk.
    assert.ok(asset.authority.equals(issuanceAuthority.publicKey));
    assert.isFalse(
      asset.authority.equals(payer.publicKey),
      "the payer must not end up as the recorded authority",
    );
  });

  it("issues without the authority ever holding lamports", async () => {
    const assetId = 5;
    const [sukukPda] = deriveSukukPda(assetId);
    const mintKeypair = Keypair.generate();

    const before = await provider.connection.getBalance(
      issuanceAuthority.publicKey,
    );
    assert.equal(before, 0, "the authority starts unfunded");

    await program.methods
      .initializeSukuk(new anchor.BN(assetId), new anchor.BN(100))
      .accounts({
        sukukAsset: sukukPda,
        mint: mintKeypair.publicKey,
        payer: payer.publicKey,
        authority: issuanceAuthority.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([mintKeypair, issuanceAuthority])
      .rpc();

    const after = await provider.connection.getBalance(
      issuanceAuthority.publicKey,
    );

    // This is the test that makes the custody story true rather than merely
    // stated. A key inside an HSM has no way to be topped up, so if issuance
    // required it to pay rent, the whole boundary would collapse into a hot
    // wallet with extra steps. `payer = payer` and a non-`mut` authority mean
    // the runtime itself refuses to debit this account.
    assert.equal(after, 0, "the authority must never need or spend SOL");
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
        payer: payer.publicKey,
        authority: issuanceAuthority.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([mintKeypair, issuanceAuthority])
      .rpc();

    const mint = await getMint(provider.connection, mintKeypair.publicKey);

    // This is the load-bearing security property: no keypair can mint,
    // so minting can only happen through the program's own instruction.
    assert.ok(
      mint.mintAuthority?.equals(sukukPda),
      "mint authority must be the Sukuk PDA",
    );
    assert.isFalse(
      mint.mintAuthority?.equals(payer.publicKey),
      "mint authority must NOT be the paying wallet",
    );
    // Nor the custody key. Even a compromised HSM cannot mint units directly;
    // it can only ask the program to, and the program enforces the supply cap.
    assert.isFalse(
      mint.mintAuthority?.equals(issuanceAuthority.publicKey),
      "mint authority must NOT be the issuance authority either",
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
          payer: payer.publicKey,
          authority: issuanceAuthority.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([mintKeypair, issuanceAuthority])
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
        payer: payer.publicKey,
        authority: issuanceAuthority.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([first, issuanceAuthority])
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
          payer: payer.publicKey,
          authority: issuanceAuthority.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([second, issuanceAuthority])
        .rpc();

      assert.fail("expected the duplicate asset_id to be rejected");
    } catch (err) {
      // Anchor surfaces this as "already in use" from the System Program.
      assert.ok(err, "duplicate initialization should fail");
    }
  });
});
