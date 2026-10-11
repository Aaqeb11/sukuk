/**
 * A real Sukuk, replayed.
 *
 * Every step below is a transaction from one end-to-end run on Solana devnet
 * (scripts/seed-devnet.ts). The units, holdings and amounts are what the chain
 * recorded — nothing here is invented, and every step links its transaction so
 * a reader can check that for themselves.
 *
 * The `state` on each step mirrors the fields of the on-chain SukukAsset
 * account after that step: units outstanding, periods paid, total distributed,
 * and whether the instrument has closed.
 */

export const SUKUK_PDA = "5iY5nVk8Y89eJYDDc2S12qsPSGYKhhD3wEuMXYd33GsY";
export const MINT = "cue3U7QuSkatLWkzSyoyn3oTUTDKNARAUZujn4iCJG5";
export const TOTAL_UNITS = 1000;

/** The platform-issued transaction: screened, then signed inside custody. */
export const CUSTODY_SIGNED_ISSUE =
  "4z7UhvQMtvG1Ymrrknq6MRbHRzmEk2EnXaFwqwGAy4C4SLfiLxnhgUKbDayjnt2QET8PAhBJRQpcz6pv5kqtBdVe";

export interface LifecycleState {
  /** Units held by investor A. */
  a: number;
  /** Units held by investor B. */
  b: number;
  /** Units the lessee has bought back and burned. */
  boughtBack: number;
  periods: number;
  distributedLamports: bigint;
  closed: boolean;
}

export interface LifecycleStep {
  id: string;
  /** Short label for the step rail. */
  label: string;
  title: string;
  /** The on-chain instruction(s) this step called. */
  instruction: string;
  what: string;
  why: string;
  txs: { label: string; sig: string }[];
  state: LifecycleState;
  /** Present on distribution steps: the rent paid out that period. */
  rentLamports?: bigint;
}

export const STEPS: LifecycleStep[] = [
  {
    id: "issue",
    label: "Issue",
    title: "The Sukuk is created",
    instruction: "initialize_sukuk",
    what: "A 1,000-unit instrument is created against the asset, with its own mint. No units exist yet — the cap is declared, not issued.",
    why: "The mint's authority is the program's own address, which has no private key. No wallet anywhere can mint units directly; only the program can, after its checks.",
    txs: [
      {
        label: "initialize_sukuk",
        sig: "1UuoaAiD4d3SNwPCp5oqEwc3GxSTWESAiEk75AoU5wPQxSa4gF56wt4Z6vfurkx1ddhUgxRduMz6udVpKC6XjUf",
      },
    ],
    state: { a: 0, b: 0, boughtBack: 0, periods: 0, distributedLamports: 0n, closed: false },
  },
  {
    id: "subscribe",
    label: "Subscribe",
    title: "Investors take up units",
    instruction: "mint_units",
    what: "Investor A takes 600 units and investor B takes 400. The instrument is fully subscribed.",
    why: "The program refuses to mint past the declared 1,000 — so nobody, including the issuer, can create more units later and dilute the people who already hold them.",
    txs: [
      {
        label: "600 → investor A",
        sig: "2yrm2kw4W2qU1nwoR5iGesVuRRnxKEczGkx4HSwEyY8UUPKUJHaGmDyHEsALCEJEHcikoiKmf9EGsR6XjGgSxk3z",
      },
      {
        label: "400 → investor B",
        sig: "3geiKiJMYC9qNVhoUqLbvZmygWSayL7Px3mCscyVRbDKeqdr7cK6zgg8TMzPGWK6jZwa881HReW37Q4bXjGLLidF",
      },
    ],
    state: { a: 600, b: 400, boughtBack: 0, periods: 0, distributedLamports: 0n, closed: false },
  },
  {
    id: "period-1",
    label: "Rent · 1",
    title: "Period 1 — rent is paid out",
    instruction: "distribute_profit",
    what: "0.01 SOL of rent is split across current holders in proportion to what they own.",
    why: "Returns are a share of actual rent, never a fixed yield. A guaranteed return would make this interest-bearing debt — the one thing the structure exists to avoid.",
    txs: [
      {
        label: "distribute_profit",
        sig: "2ujHUj2h2Qc3NoQUN1vJnAXt19BGfFdaXvrEvmKg3n1XSxRTKTizC4HpxGr2699pZeE4MiAbHvJXJsGMTQRpHuxK",
      },
    ],
    rentLamports: 10_000_000n,
    state: { a: 600, b: 400, boughtBack: 0, periods: 1, distributedLamports: 10_000_000n, closed: false },
  },
  {
    id: "buyback",
    label: "Buy back",
    title: "The lessee starts buying ownership back",
    instruction: "buyback_and_burn",
    what: "300 units are bought back and burned — 200 from A, 100 from B. Outstanding ownership falls to 700.",
    why: "This is Diminishing Musharaka: the lessee pays rent and progressively acquires the asset, so investor ownership shrinks period by period.",
    txs: [
      {
        label: "200 ← investor A",
        sig: "UpgUqrgwPxxagkvu2sorU5grK39RccoTfaEgt1qRi6AS7R67H7Wd3UzvBfNHZKAzf3vG2Unz6XyktYEcB8pvV7b",
      },
      {
        label: "100 ← investor B",
        sig: "ME9yRfvJyv6Cktut9SocYwHwMJbvjEn1ZXkcQwkuEBXPAeJ67fagCGWZMwpRfzZyn1cy6pzznGVTMZfFaHvDeBV",
      },
    ],
    state: { a: 400, b: 300, boughtBack: 300, periods: 1, distributedLamports: 10_000_000n, closed: false },
  },
  {
    id: "period-2",
    label: "Rent · 2",
    title: "Period 2 — the split has moved",
    instruction: "distribute_profit",
    what: "0.007 SOL of rent, now split 400 / 300 across 700 outstanding units. A's share drops from 60% to 57%.",
    why: "Same instruction, same two wallets, different split — because ownership changed in between. Returns follow ownership, and ownership is shrinking.",
    txs: [
      {
        label: "distribute_profit",
        sig: "4jgRHxydC9FSPFikDXFG1qfiKekPFbokMLAb3VVWoUemze3ohq5L5BZozPb54oQM6Mvu8tZtHtpWSoshvAquNV4W",
      },
    ],
    rentLamports: 7_000_000n,
    state: { a: 400, b: 300, boughtBack: 300, periods: 2, distributedLamports: 17_000_000n, closed: false },
  },
  {
    id: "final-buyback",
    label: "Buy out",
    title: "The remaining units are bought back",
    instruction: "buyback_and_burn",
    what: "A's last 400 units and B's last 300 are bought back. No units remain outstanding.",
    why: "The asset has fully reverted to the lessee. Every unit ever issued has now been bought back at a price, not repaid as principal.",
    txs: [
      {
        label: "400 ← investor A",
        sig: "3w5zUPXoqyh84KN589Tg1XvcEQJXgavJCc6JF2ybeU32gG7DwQHpcKwL3qW8GrHY7kXbZBYjXcLTzcC7ibhGCXhW",
      },
      {
        label: "300 ← investor B",
        sig: "Q4mYggx9VHNH9eGcJ7JBWdawjPEanynwCRk921GAXouHQyCPVTa7uqpwJji6UxWFUEpetgDgyHVJiob5T7jQaNi",
      },
    ],
    state: { a: 0, b: 0, boughtBack: 1000, periods: 2, distributedLamports: 17_000_000n, closed: false },
  },
  {
    id: "redeem",
    label: "Redeem",
    title: "The instrument closes",
    instruction: "redeem",
    what: "With zero units outstanding, the Sukuk is redeemed and closed. Two periods paid, 0.017 SOL distributed in total.",
    why: "Redemption is gated on outstanding units reaching zero, so the issuer cannot close it early. Once closed, minting and distribution are refused for good.",
    txs: [
      {
        label: "redeem",
        sig: "4kqEiRdn75htmDVFzwGT1R8zAY5CLWekz5Y3PY34knjDmrhd5jST6Tkn4yaXNq174CWjPrZD93xHzdPdC6JEaDTb",
      },
    ],
    state: { a: 0, b: 0, boughtBack: 1000, periods: 2, distributedLamports: 17_000_000n, closed: true },
  },
];
