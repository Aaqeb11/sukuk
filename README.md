# sukuk

A Turborepo + Bun monorepo. Proposed direction: a proof-of-concept for tokenized Sukuk issuance on Solana. This README documents only what currently exists in the repo — see [CLAUDE.md](./CLAUDE.md) for the fuller proposed scope.

## Current modules

| Module | Type | Status |
|---|---|---|
| `web/` | Next.js app | Default `create-turbo` starter page, unmodified |
| `docs/` | Next.js app | Default `create-turbo` starter page, unmodified |
| `packages/ui` | React component library (`@repo/ui`) | Stub components (`Button`, `Card`, `Code`) from the template |
| `packages/eslint-config` | Shared ESLint flat configs | From the template (`base`, `next-js`, `react-internal`) |
| `packages/typescript-config` | Shared `tsconfig.json` bases | From the template (`base`, `nextjs`, `react-library`) |
| `anchor/` | Solana Anchor program (Rust) | Default `anchor init` scaffold — a single placeholder `initialize` instruction, no program logic yet |
| `api/` | Bun service | Default `bun init` scaffold (`console.log("Hello via Bun!")`), not yet wired into the Turborepo/Bun workspaces |

`anchor/` and `api/` are not currently part of the root `workspaces` list in `package.json` (which is `web`, `docs`, `packages/*`), so `turbo run` commands do not yet cover them.

## Commands

Package manager is **Bun** (`bun@1.4.0`, pinned via `devEngines.packageManager`).

```sh
bun install

bun run build         # turbo run build
bun run dev           # turbo run dev
bun run lint          # turbo run lint
bun run check-types   # turbo run check-types
bun run format        # prettier --write "**/*.{ts,tsx,md}"
```

Scope to a single workspace with `--filter`:

```sh
turbo run dev --filter=web     # port 3000
turbo run dev --filter=docs    # port 3001
```

`anchor/` uses its own Rust/Anchor toolchain (`anchor build`, `anchor test`, `anchor deploy`), run directly from that directory — it is not invoked through `turbo` yet.

`api/` is run directly with Bun (`bun run index.ts` from that directory) — it is not invoked through `turbo` yet.

## Proposed / not yet implemented

Everything below is direction only, not present in the code today:

- Sukuk asset lifecycle instructions in the Anchor program (`initialize_sukuk`, `mint_units`, `distribute_profit`, `buyback_and_burn`, `redeem`)
- Custody signing service, eligibility rules engine, and mock rent feed in `api/`
- A `shared/` package bridging Anchor's generated IDL/client types to `api/` and `web/`
- A dashboard in `web/` showing holdings, distribution history, and compliance status
