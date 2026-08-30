# Tokenized Sukuk — Proof of Concept

A working proof-of-concept for issuing **Sukuk** (Islamic asset-backed securities) as tokens on Solana, with the signing keys held in an HSM-backed custody service.

> **Scope:** this is a technical proof-of-concept, not a financial product. No real asset, no real capital, no real investors. No Shariah board has certified anything here. Devnet only. See [What this is not](#what-this-is-not).

---

## The problem

Sukuk issuance is slow and manual. A single issuance involves an SPV, an arranger bank, legal counsel, a Shariah board, a registrar and a paying agent — each doing bespoke work, over months. Profit distribution is calculated and paid out by hand on every payment date. Secondary trading is largely over-the-counter and illiquid.

Recent fractional-Sukuk platforms in the UAE have opened retail access, but each bank runs its own closed silo: there is no shared infrastructure, no interoperable settlement, and no standardised custody layer for the keys that authorise token issuance.

That last gap is the one this PoC targets. Anyone can write a token contract; very few can demonstrate bank-grade key protection behind it.

## What a Sukuk is (for engineers)

A Sukuk is **not a bond**. Interest (*riba*) is prohibited, so investors don't lend money — they own a fractional share of a **real asset** and are paid from the income that asset generates.

This PoC models **Diminishing Musharaka** (lease-ending-in-ownership): the lessee pays rent *and* progressively buys back ownership units. Investor holdings shrink each period until they reach zero and the asset fully reverts.

**The constraint that drives the code:** distributions must be a *pro-rata share of actual rent received*, never a fixed guaranteed return. A hardcoded yield would turn this into interest-bearing debt and break the entire premise. That rule is enforced in `distribute_profit` and is the single most important invariant in the program.

## The core idea: certify once, replicate many

A Shariah board certifies the **template** — the contract structure and the smart contract code — one time. Each new asset is then screened by an automated rules engine against the board's pre-approved conditions, rather than going back to the board.

This mirrors how Sukuk programmes and green-Sukuk eligibility frameworks already work, and it's what turns a repeated legal engagement into a repeatable software transaction. It is the scalability argument for the whole design.

---

## Architecture

```
anchor/   Rust — Anchor program (on-chain lifecycle)
api/      TS  — custody signing service, eligibility rules engine, mock rent feed
web/      TS  — React dashboard (demo surface)
shared/   TS  — shared types, re-exports Anchor IDL / generated client
```

Turborepo monorepo. `anchor/` carries its own Rust toolchain, wrapped as a workspace package so the IDL and generated types flow into `api/` and `web/` at build time.

### The custody boundary

**The mint-authority signing key must never be reachable from the browser.** `api/` requests a *signature* from the custody service; it never handles a raw private key, and `web/` never signs at all.

This isn't a stylistic preference — it's the architectural claim the project rests on. In production that signer is a Thales Luna HSM over PKCS#11; in the PoC it's a KMS-backed equivalent with the same shape. The pattern is identical: **the key never leaves the vault, only signatures come out.**

---

## The on-chain program

| Instruction | What it does |
|---|---|
| `initialize_sukuk` | Creates the `SukukAsset` PDA and the SPL mint for one asset |
| `mint_units` | Mints fractional ownership units to an investor |
| `distribute_profit` | Pays a period's rent pro-rata to current holders |
| `buyback_and_burn` | Burns bought-back units — outstanding supply shrinks |
| `redeem` | Closes the instrument once outstanding units reach zero |

### State

`SukukAsset` (one PDA per asset, seeds `[b"sukuk", asset_id]`) holds the issuer, the mint, unit counts, period counter, cumulative distributions and a closed flag.

`units_issued` and `units_outstanding` are deliberately separate: issued only grows, outstanding shrinks on buyback. Collapsing them would make the Diminishing Musharaka mechanic impossible to represent.

---

## Design decisions

**The PDA is the mint authority, not a wallet.**
`mint::authority = sukuk_asset` means no keypair in existence can mint. The only path is `mint_units`, which runs the unit cap, closed-state and mint-match checks first. Minting authority becomes a capability enforced by program logic rather than a secret to be protected — the security property is structural, not procedural.

**`decimals = 0`.**
Ownership units are indivisible; you cannot hold 0.3 of a share. This also removes fixed-point arithmetic from the distribution path.

**Diminishing Musharaka over plain Ijara.**
Both are valid structures. This one was chosen because ownership shrinks progressively rather than terminating in a single event — which makes the instrument's behaviour observable over time rather than only at maturity.

**The eligibility engine is off-chain and deterministic.**
It stays off-chain to keep the on-chain surface minimal, and deterministic (explicit rules, not judgement calls) because the value of "certify once" depends on the board having approved *specific, auditable conditions*. A probabilistic compliance decision would break the audit trail.

**`u128` intermediates in the distribution maths.**
`rent × holder_units` overflows `u64` at realistic figures. Multiply in `u128`, divide, narrow back. Multiplication precedes division to avoid truncating the ownership fraction to zero.

**`redeem` is state-triggered, not discretionary.**
Gated on `units_outstanding == 0`, so the issuer cannot close early.

---

## Running it

```bash
cd anchor
anchor build
anchor test
```

`anchor test` compiles the program, starts a local validator, deploys, and runs the TypeScript suite against it. State is wiped between runs.

Tests are written against the Anchor client (not raw instruction encoding) so the same patterns — PDA derivation, ATA creation, `remainingAccounts` wiring — carry directly into `api/` and `web/`.

---

## What this is not

Stated plainly, because the scope boundary is what makes the rest credible:

- **No Shariah board has reviewed this.** The eligibility conditions in the rules engine are illustrative placeholders, not certified criteria.
- **No legal structure.** No SPV, no title, no registry linkage, no real asset.
- **Not regulated.** No VARA/DFSA licensing. This is not an offering.
- **Rent is mocked.** `rent_collected` is an instruction argument. Nothing on-chain verifies rent was actually collected.
- **Devnet only.** No mainnet configuration exists in this repo, by design.

### Known unsolved problems

These are named rather than hidden, because they're genuine and mostly not code problems:

**The oracle problem.** A chain cannot observe the real world. Whoever attests "rent was received" is a trust dependency that no oracle network removes — oracle infrastructure solves *delivery*, not *truth*. The chain guarantees the split is correct, not that the input is true.

**Title reconciliation.** The token represents ownership; the land registry *is* ownership. If they disagree, the registry wins. Production requires real registry linkage.

**Transfer permissioning.** With a vanilla SPL mint, holders can transfer to any address via the Token Program directly, bypassing the program entirely. Enforcing an allowlist at the token level needs Token-2022 transfer hooks — out of scope here, and named rather than papered over.

**Distribution dust.** Integer division truncates, so distributed totals can fall short of rent collected by up to (holders − 1). Real systems need an explicit remainder policy.

**Unbounded holders.** `distribute_profit` iterates holders passed via `remaining_accounts`, which is bounded by transaction size. Fine for a small demo set; production needs a different mechanism.

**Template scope.** Pre-approval covers the asset *type* it was certified for. A genuinely new asset class needs fresh board review, and real frameworks keep periodic re-certification.

---

## Why this exists

The hard 80% of making tokenized Sukuk real is not engineering — it's Shariah governance, legal structuring, regulatory licensing and issuer relationships. This PoC deliberately proves only the part that *is* engineering: that the token lifecycle works, that compliance screening can be templated and automated, and that the signing authority behind issuance can be held to institutional custody standards.

Everything else is a partnership conversation, not a coding problem.
