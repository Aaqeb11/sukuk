import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import type { ReactElement } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TryIt } from "@/components/try-it/try-it";

/**
 * lucide-react v1 dropped brand icons, so GitHub and X are inline SVG.
 * Both are one path; a dependency for two glyphs is not worth carrying.
 */
function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.2 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/* ---------------------------------------------------------------------------
   TODO — replace these two before you ship.
--------------------------------------------------------------------------- */
const GITHUB = "https://github.com/aaqeb11/sukuk";
const X_URL = "https://x.com/sukukinvest";

const EXPLORER = "https://explorer.solana.com";
const CLUSTER = "?cluster=devnet";

const PROGRAM = "E3qnd2CcmPqfk3BbTD5czpbGr3Bv7BMedriBcCT94pYu";
const SUKUK_ACCOUNT = "5iY5nVk8Y89eJYDDc2S12qsPSGYKhhD3wEuMXYd33GsY";
const AUTHORITY = "DXyk7pVFWsMUxcRd6qdWZWAZaWoJ59RgixbEEgLitzLj";
const LATEST_ISSUE =
  "4z7UhvQMtvG1Ymrrknq6MRbHRzmEk2EnXaFwqwGAy4C4SLfiLxnhgUKbDayjnt2QET8PAhBJRQpcz6pv5kqtBdVe";

const tx = (s: string) => `${EXPLORER}/tx/${s}${CLUSTER}`;
const addr = (s: string) => `${EXPLORER}/address/${s}${CLUSTER}`;
const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <Nav />
      <main>
        <Hero />
        <Why />
        <TryIt />
        <Platform />
        <Assurances />
        <OnChain />
        <Scope />
      </main>
      <Footer />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="#top" className="flex items-center gap-3">
          {/* The logo carries fine circuit detail that turns to fuzz below
              ~40px, so the nav runs it larger than a typical wordmark lockup. */}
          <Image src="/logo.png" alt="" width={38} height={38} priority />
          <span className="font-display text-lg font-bold tracking-[0.12em] text-cream">
            SUKUK
          </span>
        </a>
        <div className="flex items-center gap-5">
          <a
            href="#why"
            className="hidden text-sm text-muted-foreground transition-colors hover:text-cream sm:block"
          >
            How it works
          </a>
          <a
            href="#try"
            className="hidden text-sm text-muted-foreground transition-colors hover:text-cream sm:block"
          >
            Try it
          </a>
          <a
            href="#platform"
            className="hidden text-sm text-muted-foreground transition-colors hover:text-cream sm:block"
          >
            Platform
          </a>
          <a
            href="#on-chain"
            className="hidden text-sm text-muted-foreground transition-colors hover:text-cream sm:block"
          >
            Live on devnet
          </a>
          <a
            href="#scope"
            className="hidden text-sm text-muted-foreground transition-colors hover:text-cream sm:block"
          >
            Scope
          </a>
          <a
            href={X_URL}
            aria-label="Sukuk on X"
            className="text-muted-foreground transition-colors hover:text-cream"
          >
            <XIcon className="size-[17px]" />
          </a>
          <a
            href={GITHUB}
            aria-label="Sukuk on GitHub"
            className="text-muted-foreground transition-colors hover:text-cream"
          >
            <GithubIcon className="size-[18px]" />
          </a>
        </div>
      </nav>
    </header>
  );
}

/* -------------------------------------------------------------------------- */

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-16 lg:pt-20">
        <div className="grid items-start gap-14 lg:grid-cols-[1.02fr_1fr]">
          <div>
            <Badge variant="accent">Real World Assets · Solana</Badge>

            <h1 className="mt-7 font-display text-[2.1rem] font-bold leading-[1.1] tracking-[-0.02em] text-cream sm:text-[3rem] sm:leading-[1.06]">
              Own a square foot
              <br />
              of a tower.
              <br />
              <span className="text-gold-bright">Earn its rent.</span>
            </h1>

            <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Owning property that pays rent has always taken millions. Sukuk
              splits a real building into small units anyone can hold. Own a
              unit and you own that slice of the building, and you get that
              slice of the rent every period. There&apos;s no interest and no
              promised return, just your share of what the building actually
              earns.
            </p>

            <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-2">
              <Audience
                who="If you invest"
                text="Hold as little as one unit of an office tower, a warehouse or a mall. Rent arrives in your wallet in proportion to what you own."
              />
              <Audience
                who="If you own the asset"
                text="List it, have it screened against pre-approved rules in seconds, raise against it, and buy it back over time."
              />
            </div>

            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <a href="#try">
                  Try it yourself
                  <ArrowUpRight />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href={GITHUB}>
                  <GithubIcon className="size-4" />
                  Read the code
                </a>
              </Button>
            </div>

            <p className="mt-5 max-w-xl text-[13px] leading-relaxed text-muted-foreground/80">
              A working proof of concept on Solana devnet. No real buildings,
              investors or money, and nothing here is offered for sale.
            </p>
          </div>

          <div className="space-y-5">
            <SliceExample />
            <Lifecycle />
          </div>
        </div>
      </div>
    </section>
  );
}

function Audience({ who, text }: { who: string; text: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-emerald-bright">
        {who}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-cream/90">{text}</p>
    </div>
  );
}

/**
 * The vision in one picture: a building cut into units, rent following
 * ownership. The figures are an illustration, labelled as one. The
 * arithmetic is the same pro-rata split distribute_profit does on-chain.
 */
function SliceExample() {
  const steps = [
    { value: "100,000 sq ft", label: "one tower" },
    { value: "100,000 units", label: "one per square foot" },
    { value: "AED 10", label: "to each unit" },
  ];
  return (
    <Card className="overflow-hidden bg-[#0d1626]">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          How a slice pays
        </span>
        <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          Illustration
        </span>
      </div>
      <CardContent className="p-5">
        <ol className="grid grid-cols-3 gap-2">
          {steps.map((s, i) => (
            <li key={s.label} className="relative">
              <p className="whitespace-nowrap font-display text-[13px] font-bold text-cream min-[400px]:text-sm sm:text-lg">
                {s.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
              {i < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute right-1 top-1 hidden text-gold-bright sm:block"
                >
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-4 border-t border-border pt-4 text-sm leading-relaxed text-muted-foreground">
          The tower earns <span className="text-cream">AED 1,000,000</span> in
          rent this period, and every unit gets an equal cut. Hold 1 unit, get
          AED 10. Hold 250 units, get AED 2,500. A quiet period pays less, because
          nothing is guaranteed.
        </p>
      </CardContent>
    </Card>
  );
}

/* --------------------------------------------------------------------------
   Why this exists — the problem and the answer, in plain words.

   Written for someone who has never heard the word Sukuk. Each row pairs one
   problem with the part of the platform that answers it, so a reader can
   check the claim against the demo directly below.
-------------------------------------------------------------------------- */

const PROBLEMS = [
  {
    who: "For investors",
    problem: "Most ways to grow money pay interest.",
    problemBody:
      "Savings accounts, bonds and most funds earn interest. For Muslims that is off-limits, and many others simply want returns from real things rather than from lending. Owning property that pays rent is the obvious alternative, but it takes millions to buy in.",
    solution: "Own a slice of a real asset, from a single unit.",
    solutionBody:
      "A building is split into small units. Hold some and you own that share of it, and you receive that share of the rent each period. There's no interest and no promised return, just what the asset really earns. Open to anyone, Muslim or not.",
  },
  {
    who: "For asset owners",
    problem: "Raising money the halal way is slow and expensive.",
    problemBody:
      "Today every new Sukuk needs its own Shariah board review, lawyers and arrangers, and months of structuring. That only makes sense for very large deals, so most owners never get access to it.",
    solution: "Checked in seconds against rules approved once.",
    solutionBody:
      "A Shariah board approves a set of rules for a type of asset one time. After that, each new asset is checked against those rules automatically. If it passes, it can be issued and opened to investors straight away.",
  },
  {
    who: "For everyone",
    problem: "You have to trust the paperwork.",
    problemBody:
      "Who owns how much, whether rent was really paid out, and whether extra shares were quietly created all sit in private records that investors can't see.",
    solution: "The blockchain keeps the books, in public.",
    solutionBody:
      "Ownership, every rent payment and every buyback are recorded on Solana, where anyone can check them. Nobody, including the issuer, can create extra units, and the key that issues them is locked away where no one can copy it.",
  },
];

const HOW = [
  { title: "List", body: "An owner puts forward an income-producing asset." },
  { title: "Check", body: "It's screened against the pre-approved Shariah rules." },
  { title: "Invest", body: "Investors buy units. Each unit is a share of the asset." },
  { title: "Earn", body: "Rent is paid out by share, and the owner buys units back over time." },
];

function Why() {
  return (
    <section id="why" className="border-y border-border bg-[#0d1626]">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-3xl">
          <Badge>Why this exists</Badge>
          <h2 className="mt-6 font-display text-3xl font-bold leading-tight text-cream sm:text-4xl">
            Two billion people want to invest without interest. We’re making room for all of them.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Sukuk are the Islamic alternative to bonds: instead of lending money
            and earning interest, investors own part of a real asset and share
            in what it earns. The idea is centuries old. Getting it to ordinary
            people is the part that has never worked.
          </p>
        </div>

        <ol className="mt-14 space-y-4">
          {PROBLEMS.map((p) => (
            <li
              key={p.who}
              className="grid overflow-hidden rounded-xl border border-border lg:grid-cols-2"
            >
              <div className="bg-background/60 p-6 sm:p-7">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  {p.who} · the problem
                </p>
                <h3 className="mt-3 font-display text-xl font-bold leading-snug text-cream">
                  {p.problem}
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                  {p.problemBody}
                </p>
              </div>
              <div className="border-t border-border bg-card p-6 sm:p-7 lg:border-l lg:border-t-0">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-emerald-bright">
                  What Sukuk does
                </p>
                <h3 className="mt-3 font-display text-xl font-bold leading-snug text-cream">
                  {p.solution}
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                  {p.solutionBody}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-16">
          <h3 className="font-display text-2xl font-bold text-cream">
            How it works, in four steps
          </h3>
          <ol className="mt-6 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {HOW.map((h, i) => (
              <li key={h.title} className="bg-background p-6">
                <span className="font-mono text-xs tracking-[0.2em] text-gold">
                  0{i + 1}
                </span>
                <p className="mt-2 font-display text-lg font-bold text-cream">
                  {h.title}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {h.body}
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-6 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
            Every step after the check happens on Solana, so ownership and
            payouts are visible to anyone.{" "}
            <a href="#try" className="text-emerald-bright underline-offset-4 hover:underline">
              Try the first two steps yourself below
            </a>
            , then follow a real one through to the end.
          </p>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------------
   The lifecycle panel.

   Every row is a real transaction against a real asset. The outstanding-units
   column is the point: ownership shrinks period by period as the lessee buys
   back, which is the Diminishing Musharaka structure and the reason this is
   not a bond.
-------------------------------------------------------------------------- */

const LIFECYCLE = [
  {
    stage: "Listed & screened",
    detail: "10 of 10 conditions passed",
    outstanding: 0,
    total: 1000,
    sig: "1UuoaAiD4d3SNwPCp5oqEwc3GxSTWESAiEk75AoU5wPQxSa4gF56wt4Z6vfurkx1ddhUgxRduMz6udVpKC6XjUf",
  },
  {
    stage: "Investors subscribe",
    detail: "600 units + 400 units",
    outstanding: 1000,
    total: 1000,
    sig: "2yrm2kw4W2qU1nwoR5iGesVuRRnxKEczGkx4HSwEyY8UUPKUJHaGmDyHEsALCEJEHcikoiKmf9EGsR6XjGgSxk3z",
  },
  {
    stage: "Period 1 — rent paid",
    detail: "0.01 SOL, split 60 / 40",
    outstanding: 1000,
    total: 1000,
    sig: "2ujHUj2h2Qc3NoQUN1vJnAXt19BGfFdaXvrEvmKg3n1XSxRTKTizC4HpxGr2699pZeE4MiAbHvJXJsGMTQRpHuxK",
  },
  {
    stage: "Period 2 — units bought back",
    detail: "300 returned, rent re-splits 400 / 300",
    outstanding: 700,
    total: 1000,
    sig: "4jgRHxydC9FSPFikDXFG1qfiKekPFbokMLAb3VVWoUemze3ohq5L5BZozPb54oQM6Mvu8tZtHtpWSoshvAquNV4W",
  },
  {
    stage: "Bought back in full",
    detail: "Asset reverts, instrument closes",
    outstanding: 0,
    total: 1000,
    sig: "4kqEiRdn75htmDVFzwGT1R8zAY5CLWekz5Y3PY34knjDmrhd5jST6Tkn4yaXNq174CWjPrZD93xHzdPdC6JEaDTb",
  },
];

function Lifecycle() {
  return (
    <Card className="overflow-hidden bg-[#080e19] shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          One asset, start to finish
        </span>
        <a
          href={addr(SUKUK_ACCOUNT)}
          className="font-mono text-[11px] text-emerald-bright underline decoration-dotted underline-offset-4 hover:text-cream"
        >
          {short(SUKUK_ACCOUNT)}
        </a>
      </div>

      <CardContent className="p-0">
        <ol>
          {LIFECYCLE.map((row, i) => (
            <li key={row.stage}>
              <a
                href={tx(row.sig)}
                className="group flex items-center gap-4 border-b border-border/60 px-5 py-4 transition-colors last:border-b-0 hover:bg-white/[0.025]"
              >
                <span className="font-mono text-[11px] text-gold">
                  {String(i + 1).padStart(2, "0")}
                </span>

                <span className="min-w-0 flex-grow">
                  <span className="block text-sm font-medium text-cream">
                    {row.stage}
                  </span>
                  <span className="block text-[12.5px] leading-snug text-muted-foreground">
                    {row.detail}
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  <span className="block font-mono text-sm text-cream">
                    {row.outstanding}
                  </span>
                  <span className="block font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    held
                  </span>
                </span>

                {/* Ownership, drawn. It fills as investors subscribe and
                    empties as the lessee buys back. */}
                <span
                  aria-hidden="true"
                  className="flex h-9 w-1.5 shrink-0 flex-col-reverse overflow-hidden rounded-full bg-ink-line"
                >
                  <span
                    className="w-full rounded-full bg-emerald"
                    style={{ height: `${(row.outstanding / row.total) * 100}%` }}
                  />
                </span>

                <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-[var(--emerald-bright)]" />
              </a>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

const CAPABILITIES = [
  {
    n: "01",
    title: "List",
    body: "An issuer submits the asset. It is screened against a board-certified template — title, encumbrance, tangibility, tenant activity, ownership risk — and every condition is reported, not just the first that fails.",
  },
  {
    n: "02",
    title: "Raise",
    body: "On a pass, the instrument is created and ownership units go to investors. Units are indivisible, capped at the amount declared, and can only be minted through the program itself. Investors subscribe directly and receive ownership units into their own wallet.",
  },
  {
    n: "03",
    title: "Distribute",
    body: "Each period's rent is paid pro-rata to whoever holds units at that moment. Never a fixed return — a guaranteed yield would make this interest-bearing debt and break the structure.",
  },
  {
    n: "04",
    title: "Buy back & close",
    body: "The lessee progressively buys ownership back. Holdings shrink each period until they reach zero, the asset reverts in full, and the instrument closes itself.",
  },
];

function Platform() {
  return (
    <section id="platform" className="border-y border-border bg-[#0d1626]">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-3xl">
          <Badge>The platform</Badge>
          <h2 className="mt-6 font-display text-3xl font-bold leading-tight text-cream sm:text-4xl">
            Everything the instrument does, in one place.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Issuing a Sukuk today means an SPV, an arranger, legal counsel, a
            Shariah board, a registrar and a paying agent — each doing bespoke
            work, over months, and then doing all of it again for the next
            asset. Here the four stages are one system, and the compliance
            decision behind each one is recorded rather than remembered.
          </p>
        </div>

        <ol className="mt-14 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((c) => (
            <li key={c.n} className="bg-card p-7">
              <span className="font-mono text-xs tracking-[0.2em] text-gold">
                {c.n}
              </span>
              <h3 className="mt-3 font-display text-xl font-bold text-cream">
                {c.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {c.body}
              </p>
            </li>
          ))}
        </ol>

        <p className="mt-9 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
          <span className="text-cream">The order is the control.</span> The
          signing key for an asset is created only after it passes screening, so
          the existence of a key is itself evidence the asset passed. There is
          no key lying around that could have authorised an issuance for a
          rejected one.
        </p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

const ASSURANCES = [
  {
    title: "Certify once, replicate many",
    body: "Today a Shariah board reviews every issuance, and the review is a committee meeting measured in weeks. Here the board certifies a template — a named set of conditions — and the platform applies them to each asset afterwards, recording how every condition evaluated.",
  },
  {
    title: "The key never leaves the boundary",
    body: "Issuance keys are generated inside HashiCorp Vault Transit as non-exportable — nothing can read the private half back out. The same call shape as a PKCS#11 HSM, so the production swap is one line. Verified against a live Vault, not a mock.",
  },
  {
    title: "The authority cannot hold funds",
    body: "Every instruction takes an authority that signs and is never writable, with separate accounts paying rent and funding distributions. A key inside an HSM cannot be topped up — so the Solana runtime itself refusing to debit it is the guarantee, not a convention.",
  },
];

function Assurances() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-3">
        {ASSURANCES.map((p) => (
          <div key={p.title} className="bg-background p-8">
            <span aria-hidden="true" className="block h-0.5 w-8 bg-gold" />
            <h3 className="mt-5 font-display text-xl font-bold leading-snug text-cream">
              {p.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {p.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function OnChain() {
  return (
    <section id="on-chain" className="border-y border-border bg-[#0d1626]">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <Badge variant="gold">Live on devnet</Badge>
            <h2 className="mt-6 font-display text-3xl font-bold leading-tight text-cream sm:text-4xl">
              Not a diagram. A transaction.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Open the issuance authority. It signed a transaction that created
              two accounts, and it holds zero SOL — the fee payer paid for
              everything. It has no private half anywhere outside Vault.
            </p>
          </div>
          <a
            href={addr(PROGRAM)}
            className="font-mono text-sm text-emerald-bright underline decoration-dotted underline-offset-4 hover:text-cream"
          >
            Program {short(PROGRAM)}
          </a>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          <LinkCard
            label="A listing, end to end"
            value={short(SUKUK_ACCOUNT)}
            href={addr(SUKUK_ACCOUNT)}
            note="1000 units issued, two periods paid, bought back and closed."
          />
          <LinkCard
            label="Issued by the platform"
            value={short(LATEST_ISSUE)}
            href={tx(LATEST_ISSUE)}
            note="Screened, signed inside custody, submitted — no human touched a private key."
          />
          <LinkCard
            label="Issuance authority"
            value={short(AUTHORITY)}
            href={addr(AUTHORITY)}
            note="Authorised the issuance. Balance: zero, by construction."
            accent
          />
        </div>
      </div>
    </section>
  );
}

function LinkCard({
  label,
  value,
  href,
  note,
  accent,
}: {
  label: string;
  value: string;
  href: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <a
      href={href}
      className="group rounded-xl border border-border bg-card p-6 transition-colors hover:border-[var(--emerald-bright)]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-[var(--emerald-bright)]" />
      </div>
      <p
        className={`mt-4 font-mono text-base ${accent ? "text-gold-bright" : "text-cream"}`}
      >
        {value}
      </p>
      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
        {note}
      </p>
    </a>
  );
}

/* -------------------------------------------------------------------------- */

const NOT = [
  "The investor console is in build. Subscription mints units on-chain today; the payment leg and the screens investors will browse and buy through are the next piece of work. Every stage above runs today and is verifiable on-chain; the screens people will browse and subscribe through are the next piece of work.",
  "No Shariah board has reviewed this. The screening engine is real and tested; the template it evaluates carries placeholder conditions.",
  "No legal structure — no SPV, no title, no registry linkage, no real asset.",
  "Not regulated. No VARA or DFSA licensing. This is not an offering.",
  "Vault is a real KMS with genuinely non-exportable keys, but it is not tamper-resistant hardware and not FIPS-validated.",
  "Rent is an input, not an observation. Nothing on-chain verifies rent was actually collected.",
  "Devnet only. No mainnet configuration exists in the repository, by design.",
];

function Scope() {
  return (
    <section id="scope" className="mx-auto max-w-6xl px-6 py-20">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.25fr]">
        <div>
          <Badge>Scope</Badge>
          <h2 className="mt-6 font-display text-3xl font-bold leading-tight text-cream sm:text-4xl">
            What this is not.
          </h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            Stated plainly, because the boundary is what makes the rest
            credible. The hard majority of making tokenized Sukuk real is not
            engineering — it is Shariah governance, legal structuring and
            regulatory licensing. This proves the part that is engineering.
          </p>
        </div>

        <ul className="space-y-px overflow-hidden rounded-xl border border-border bg-border">
          {NOT.map((n) => (
            <li
              key={n}
              className="flex gap-4 bg-background p-5 text-sm leading-relaxed text-muted-foreground"
            >
              <span
                aria-hidden="true"
                className="mt-1.5 h-px w-5 shrink-0 bg-gold"
              />
              {n}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-6 py-10">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="" width={30} height={30} />
          <span className="font-display text-sm font-bold tracking-[0.12em] text-cream">
            SUKUK
          </span>
          <span className="text-sm text-muted-foreground">
            · Built for the Colosseum hackathon
          </span>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <a
            href={GITHUB}
            className="text-muted-foreground transition-colors hover:text-cream"
          >
            GitHub
          </a>
          <a
            href={X_URL}
            className="text-muted-foreground transition-colors hover:text-cream"
          >
            X
          </a>
          <a
            href={addr(PROGRAM)}
            className="text-muted-foreground transition-colors hover:text-cream"
          >
            Explorer
          </a>
        </div>
      </div>
    </footer>
  );
}
