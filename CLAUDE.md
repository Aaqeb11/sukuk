# CLAUDE.md

Project context for AI assistants working in this repo.

## What this is

A **proof-of-concept** for tokenized Sukuk (Islamic asset-backed securities) issuance on Solana, with an HSM-backed custody layer for the signing keys.

This is a **3-week solo PoC built to support an internal pitch**, not a production system and not a real financial instrument. Treat every "compliance" and "Shariah" element in this codebase as a *simulation of the shape* of the real thing.

## Critical framing — read before writing any code

**This does not issue real securities.** No real asset, no real capital, no real investors, no Shariah board has certified anything here. Devnet only.

Do not add code, comments, README text, or UI copy that:
- claims or implies actual Shariah compliance or certification
- implies this is a live, regulated, or investable product
- presents mock data as though it were real attestation, valuation, or ownership data

Mock things must be **visibly labeled as mock in the UI**, not silently faked. The credibility of the pitch depends on the scope boundary being obvious, not hidden.

## Domain primer (enough to write correct code)

- **Sukuk** — an Islamic finance instrument. Not a bond. Investors own a fractional share of a *real asset* and are paid from the income that asset generates (rent), not interest on a loan. Interest (*riba*) is prohibited.
- **Structure used here: Diminishing Musharaka** (lease-ending-in-ownership). The lessee pays rent AND progressively buys back ownership units. Investor ownership shrinks over time until it reaches zero and the asset fully reverts.
- **Why that matters in code:** distributions must be a **pro-rata share of actual rent received**, never a fixed guaranteed return. A hardcoded fixed yield would break the core religious principle the whole instrument exists to satisfy. If you find yourself writing a guaranteed-return calculation, that's a bug, not a shortcut.
- **"Certify once, replicate many"** — the central idea. A Shariah board certifies a *template* one time; each new asset is then screened by an automated rules engine against the board's pre-approved conditions, instead of a fresh board review per asset. This is the scalability thesis.

## Architecture

Turborepo monorepo, three modules:

```
anchor/   Rust — Anchor program (the on-chain lifecycle)
api/      TS  — custody signing service, eligibility rules engine, mock rent feed
web/      TS  — React dashboard (the demo surface)
shared/   TS  — shared types, re-exports Anchor IDL/generated client
```

### Non-negotiable boundary: custody lives server-side

The mint-authority signing key **must never be reachable from the browser**. The entire security story of this project is "the key never leaves the vault." `api/` requests a *signature* from the custody service; it never handles the raw private key, and `web/` never touches signing at all.

If a change would move signing toward the frontend, or store a private key in client-reachable code or env, reject it and flag it. This is the one architectural rule that cannot bend.

### Module notes

- **`anchor/`** — has its own Rust toolchain. Wrapped as a workspace package with scripts shelling out to `anchor build` / `anchor deploy` / `anchor test`.
- **`api/`** — deliberately thin. Holds the things that must NOT be on-chain or in the browser: custody signing, the eligibility engine, the mock rent feed.
- **`web/`** — read-mostly dashboard. Shows holdings, distribution history, shrinking supply, and the compliance panel.
- **`shared/`** — the type bridge. Anchor build output flows here so `api/` and `web/` get compile-time errors on instruction signature changes rather than runtime failures on devnet.

## On-chain program

Instructions:
- `initialize_sukuk` — creates the SukukAsset PDA (asset metadata, total units, rent params)
- `mint_units` — mints SPL fractional ownership tokens to an allowlisted investor
- `distribute_profit` — pays pro-rata share of a supplied rent figure to current holders
- `buyback_and_burn` — burns a slice of units, reducing outstanding supply (the Diminishing Musharaka mechanic)
- `redeem` — burns remaining units at full buyback/maturity, closes the asset

Keep the on-chain surface **minimal**. Eligibility screening, rent attestation, and key custody are deliberately off-chain. Don't migrate them on-chain — that's a design decision, not an oversight.

For the PoC, `distribute_profit` iterates a small known set of holders. The unbounded-holders scaling problem is knowingly out of scope; don't solve it, don't apologize for it in comments.

## What is real vs. mocked

| Component | Status |
|---|---|
| Anchor program + lifecycle | Real, on devnet |
| SPL token mint / burn | Real, on devnet |
| Eligibility rules engine | Real code; the *conditions* are illustrative placeholders |
| Custody signing | Architecture real; backend is KMS-simulated (or Luna HSM if lab access available) |
| Rent / income feed | **Mocked** — manually set. No real oracle, no real attestation |
| Asset data, land title, SPV | **Mocked** — no legal entity, no registry linkage |
| Shariah board certification | **Not done** — simulated as "already happened off-screen" |
| Investors | Mock devnet wallets |

## Conventions

- TypeScript everywhere outside `anchor/`. Prefer the generated/Codama client over hand-rolled IDL consumption.
- Never cache `deploy` tasks in Turborepo — deploys are side-effectful against devnet, and a cache hit silently ships a stale program.
- Scope Anchor build outputs to `target/idl/**` and `target/types/**`, not all of `target/**`.
- Devnet only. Do not add mainnet config, mainnet RPC endpoints, or anything that could be pointed at mainnet by flipping one env var.
- Commit daily, including broken work-in-progress. This repo doubles as proof-of-work for the pitch.

## Priorities if time is short

1. Core lifecycle (`initialize` → `mint` → `distribute` → `buyback` → `redeem`)
2. Custody signing via the HSM/KMS pattern — **this is the differentiator; never cut it**
3. Eligibility engine with 2 passing + 1 failing mock asset
4. Dashboard: holdings, distribution history, shrinking-supply chart
5. Polish, secondary transfer

Cut from the bottom. If something has to go, it's dashboard polish, never custody.

## Known unsolved problems (don't paper over these)

- **The oracle problem.** A chain can't observe the real world. Whoever attests "rent was received" is a trust dependency the blockchain does not remove. Supra/Chainlink solve *delivery*, not *truth*.
- **Title reconciliation.** The token represents ownership; the land registry *is* ownership. If they disagree, the registry wins. Production would need real registry linkage (e.g. DLD).
- **Template scope limits.** Pre-approval covers the asset *type* it was certified for. A genuinely new asset class needs fresh board review. Real deployments also keep periodic re-certification.

If asked to "fix" these in code, don't — they're not code problems. Say so.
