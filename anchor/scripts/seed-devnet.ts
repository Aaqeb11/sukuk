/**
 * Seeds a full Sukuk lifecycle on devnet.
 *
 * Produces real, inspectable transactions against the deployed program so the
 * Explorer shows working activity rather than a bare deployed binary.
 *
 * Run:
 *   ANCHOR_PROVIDER_URL="https://devnet.helius-rpc.com/?api-key=$HELIUS_KEY" \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   bun run scripts/seed-devnet.ts
 *
 * Devnet state persists, so each run uses a timestamp-derived asset ID to
 * avoid colliding with previous runs.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  getAccount,
  getMint,
} from "@solana/spl-token";
import { Sukuk } from "../target/types/sukuk";

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = anchor.workspace.Sukuk as Program<Sukuk>;
const authority = provider.wallet as anchor.Wallet;

// Devnet persists, so derive a fresh id each run.
const ASSET_ID = Math.floor(Date.now() / 1000);

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

function explorer(sig: string) {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

function log(step: string, sig: string) {
  console.log(`  ${step}`);
  console.log(`    ${explorer(sig)}`);
}

async function fund(wallet: PublicKey, sol: number) {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: authority.publicKey,
      toPubkey: wallet,
      lamports: Math.floor(sol * LAMPORTS_PER_SOL),
    })
  );
  await sendAndConfirmTransaction(provider.connection, tx, [
    (authority as any).payer,
  ]);
}

async function main() {
  console.log("Program:", program.programId.toBase58());
  console.log("Issuer: ", authority.publicKey.toBase58());
  console.log("Asset ID:", ASSET_ID);
  console.log("");

  const balance = await provider.connection.getBalance(authority.publicKey);
  console.log(`Issuer balance: ${(balance / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    throw new Error("Issuer needs at least ~0.5 SOL. Run: solana airdrop 2");
  }
  console.log("");

  const sukukPda = deriveSukukPda(ASSET_ID);
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;

  // Devnet airdrops are rate-limited; keep these small and sequential.
  console.log("Funding mock investors...");
  await fund(alice.publicKey, 0.05);
  await fund(bob.publicKey, 0.05);
  console.log("  alice:", alice.publicKey.toBase58());
  console.log("  bob:  ", bob.publicKey.toBase58());
  console.log("");

  // ---------- 1. Issuance ----------
  console.log("1. Issuing a 1000-unit Sukuk");
  {
    const sig = await program.methods
      .initializeSukuk(new anchor.BN(ASSET_ID), new anchor.BN(1000))
      .accountsPartial({
        sukukAsset: sukukPda,
        mint,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([mintKeypair])
      .rpc();
    log("initialize_sukuk", sig);
  }
  console.log("    PDA: ", sukukPda.toBase58());
  console.log("    Mint:", mint.toBase58());
  console.log("");

  // ---------- 2. Investors subscribe ----------
  console.log("2. Minting units (alice 600 / bob 400)");
  await createAssociatedTokenAccount(
    provider.connection,
    (authority as any).payer,
    mint,
    alice.publicKey
  );
  await createAssociatedTokenAccount(
    provider.connection,
    (authority as any).payer,
    mint,
    bob.publicKey
  );
  const aliceAta = getAssociatedTokenAddressSync(mint, alice.publicKey);
  const bobAta = getAssociatedTokenAddressSync(mint, bob.publicKey);

  for (const [ata, units, who] of [
    [aliceAta, 600, "alice"],
    [bobAta, 400, "bob"],
  ] as [PublicKey, number, string][]) {
    const sig = await program.methods
      .mintUnits(new anchor.BN(ASSET_ID), new anchor.BN(units))
      .accountsPartial({
        sukukAsset: sukukPda,
        mint,
        investorTokenAccount: ata,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    log(`mint_units -> ${who} (${units})`, sig);
  }
  console.log("");

  const holders = [
    { pubkey: aliceAta, isSigner: false, isWritable: false },
    { pubkey: alice.publicKey, isSigner: false, isWritable: true },
    { pubkey: bobAta, isSigner: false, isWritable: false },
    { pubkey: bob.publicKey, isSigner: false, isWritable: true },
  ];

  // ---------- 3. Period one ----------
  console.log("3. Period 1: distributing 0.01 SOL of rent (60/40 split)");
  {
    const sig = await program.methods
      .distributeProfit(new anchor.BN(ASSET_ID), new anchor.BN(10_000_000))
      .accountsPartial({
        sukukAsset: sukukPda,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(holders)
      .rpc();
    log("distribute_profit", sig);
  }
  console.log("");

  // ---------- 4. Partial buyback ----------
  console.log("4. Buying back 200 from alice, 100 from bob");
  for (const [ata, holder, units, who] of [
    [aliceAta, alice, 200, "alice"],
    [bobAta, bob, 100, "bob"],
  ] as [PublicKey, Keypair, number, string][]) {
    const sig = await program.methods
      .buybackAndBurn(new anchor.BN(ASSET_ID), new anchor.BN(units))
      .accountsPartial({
        sukukAsset: sukukPda,
        mint,
        holderTokenAccount: ata,
        holder: holder.publicKey,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([holder])
      .rpc();
    log(`buyback_and_burn <- ${who} (${units})`, sig);
  }
  console.log("");

  // ---------- 5. Period two, on the reduced base ----------
  // Ownership is now 400/300 of 700. The same instruction therefore splits
  // differently — returns follow ownership, and ownership is shrinking.
  console.log("5. Period 2: distributing 0.007 SOL (now a 400/300 of 700 split)");
  {
    const sig = await program.methods
      .distributeProfit(new anchor.BN(ASSET_ID), new anchor.BN(7_000_000))
      .accountsPartial({
        sukukAsset: sukukPda,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(holders)
      .rpc();
    log("distribute_profit", sig);
  }
  console.log("");

  // ---------- 6. Final buyback ----------
  console.log("6. Buying back the remainder (alice 400, bob 300)");
  for (const [ata, holder, units, who] of [
    [aliceAta, alice, 400, "alice"],
    [bobAta, bob, 300, "bob"],
  ] as [PublicKey, Keypair, number, string][]) {
    const sig = await program.methods
      .buybackAndBurn(new anchor.BN(ASSET_ID), new anchor.BN(units))
      .accountsPartial({
        sukukAsset: sukukPda,
        mint,
        holderTokenAccount: ata,
        holder: holder.publicKey,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([holder])
      .rpc();
    log(`buyback_and_burn <- ${who} (${units})`, sig);
  }
  console.log("");

  // ---------- 7. Closure ----------
  console.log("7. Redeeming");
  {
    const sig = await program.methods
      .redeem(new anchor.BN(ASSET_ID))
      .accountsPartial({
        sukukAsset: sukukPda,
        authority: authority.publicKey,
      })
      .rpc();
    log("redeem", sig);
  }
  console.log("");

  // ---------- Final state ----------
  const asset = await program.account.sukukAsset.fetch(sukukPda);
  const mintInfo = await getMint(provider.connection, mint);
  const aliceBal = await getAccount(provider.connection, aliceAta);
  const bobBal = await getAccount(provider.connection, bobAta);

  console.log("Final state");
  console.log("  units issued:      ", asset.unitsIssued.toString());
  console.log("  units outstanding: ", asset.unitsOutstanding.toString());
  console.log("  periods elapsed:   ", asset.periodsElapsed);
  console.log("  total distributed: ", asset.totalDistributed.toString(), "lamports");
  console.log("  closed:            ", asset.isClosed);
  console.log("  mint supply:       ", mintInfo.supply.toString());
  console.log("  alice / bob units: ", aliceBal.amount.toString(), "/", bobBal.amount.toString());
  console.log("");
  console.log("Sukuk account:");
  console.log(
    `  https://explorer.solana.com/address/${sukukPda.toBase58()}?cluster=devnet`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
