"use client";

import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Lock,
  RotateCcw,
  X,
} from "lucide-react";
import { useMemo, useState, type ReactElement, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// The screening engine, copied verbatim from api/src/compliance by
// `bun run sync:engine`. It runs here unchanged: a pure function with no
// Nest, no Vault and no network, which is why it can run in a browser at all.
import { evaluate, type ScreeningResult } from "@/lib/engine/compliance/evaluator";
import type { Asset } from "@/lib/engine/assets/asset.types";
import type { Template } from "@/lib/engine/templates/template.types";
import templateJson from "@/lib/engine/templates/ijara-real-estate-v1.json";
import ast001 from "@/lib/engine/fixtures/ast-001.json";
import ast002 from "@/lib/engine/fixtures/ast-002.json";
import ast003 from "@/lib/engine/fixtures/ast-003.json";

import { distribute, formatSol, parseSol } from "./distribute";
import {
  CUSTODY_SIGNED_ISSUE,
  STEPS,
  SUKUK_PDA,
  TOTAL_UNITS,
  type LifecycleState,
  type LifecycleStep,
} from "./lifecycle";

const TEMPLATE = templateJson as unknown as Template;

const EVALUATOR_SOURCE =
  "https://github.com/aaqeb11/sukuk/blob/main/api/src/compliance/evaluator.ts";

const explorerTx = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
const explorerAddress = (a: string) =>
  `https://explorer.solana.com/address/${a}?cluster=devnet`;
const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;

/* --------------------------------------------------------------------------
   Presets — the API's own fixtures, unmodified.
-------------------------------------------------------------------------- */

const PRESETS = [
  { id: "AST-001", label: "Office tower", asset: ast001 as unknown as Asset },
  { id: "AST-002", label: "Logistics warehouse", asset: ast002 as unknown as Asset },
  { id: "AST-003", label: "Mixed-use block", asset: ast003 as unknown as Asset },
] as const;

type PresetId = (typeof PRESETS)[number]["id"];

function presetAsset(id: PresetId): Asset {
  const found = PRESETS.find((p) => p.id === id) ?? PRESETS[0];
  return structuredClone(found.asset);
}

/** Immutable set of a two-level path, e.g. ("structure", "buyback_at_par"). */
function withField(asset: Asset, section: string, key: string, value: unknown): Asset {
  const current = (asset[section] ?? {}) as Record<string, unknown>;
  return { ...asset, [section]: { ...current, [key]: value } };
}

function read(asset: Asset, section: string, key: string): unknown {
  return (asset[section] as Record<string, unknown> | undefined)?.[key];
}

/** The threshold a board put in the template, so hints show its numbers, not ours. */
function conditionValue(id: string): unknown {
  return TEMPLATE.conditions.find((c) => c.id === id)?.value;
}

const ACTIVITIES: { value: string; label: string }[] = [
  { value: "professional_services", label: "Professional services" },
  { value: "logistics", label: "Logistics" },
  { value: "retail_grocery", label: "Grocery retail" },
  { value: "healthcare", label: "Healthcare" },
  { value: "education", label: "Education" },
  { value: "conventional_banking", label: "Conventional banking" },
  { value: "conventional_insurance", label: "Conventional insurance" },
  { value: "alcohol", label: "Alcohol" },
  { value: "gambling", label: "Gambling" },
  { value: "tobacco", label: "Tobacco" },
];

const CONDITION_TITLES: Record<string, string> = {
  "asset-type": "Asset class",
  "title-identified": "Title identified",
  "clear-title": "Clear title",
  unencumbered: "No liens or charges",
  "income-is-rent": "Income is rent, not interest",
  "tenant-activity": "Tenant activity permitted",
  "impure-income-limit": "Impure income within limit",
  tangibility: "Majority tangible",
  "ownership-risk": "Owner keeps ownership risk",
  "no-guaranteed-principal": "No guaranteed principal",
};

/* ==========================================================================
   Section
========================================================================== */

export function TryIt(): ReactElement {
  const [presetId, setPresetId] = useState<PresetId>("AST-001");
  const [asset, setAsset] = useState<Asset>(() => presetAsset("AST-001"));
  const [step, setStep] = useState(0);

  const result: ScreeningResult = useMemo(() => evaluate(asset, TEMPLATE), [asset]);

  const failing = new Set(
    result.results.filter((r) => !r.passed).map((r) => r.condition_id),
  );

  const loadPreset = (id: PresetId) => {
    setPresetId(id);
    setAsset(presetAsset(id));
    setStep(0);
  };

  const edited =
    JSON.stringify(asset) !== JSON.stringify(presetAsset(presetId));

  return (
    <section id="try" className="border-y border-border bg-[#0d1626]">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-3xl">
          <Badge variant="accent">Try it</Badge>
          <h2 className="mt-6 font-display text-3xl font-bold leading-tight text-cream sm:text-4xl">
            List an asset. Watch it get screened.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Change the asset and the screening re-runs instantly — in your
            browser, on the same engine the platform uses. If it passes, follow
            a real Sukuk through issuance, rent, buyback and redemption.
          </p>
          <p className="mt-4 rounded-lg border border-border bg-background/60 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-cream">What&apos;s live and what&apos;s a replay.</span>{" "}
            Screening is live: the real engine, the real template. The lifecycle
            replays one real 1,000-unit Sukuk on Solana devnet, and every step
            links its transaction. The template&apos;s conditions are illustrative
            placeholders, not a real Shariah board&apos;s.
          </p>
        </div>

        {/* ---------- 1 · List & screen ---------- */}
        <StageHeading n="1" title="List & screen" />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <AssetPanel
            asset={asset}
            presetId={presetId}
            edited={edited}
            failing={failing}
            onPreset={loadPreset}
            onReset={() => loadPreset(presetId)}
            onChange={(next) => {
              setAsset(next);
              setStep(0);
            }}
          />
          <ScreeningPanel result={result} />
        </div>

        {/* ---------- 2 · Issue → Redeem ---------- */}
        <StageHeading n="2" title="Issue, pay out, buy back, redeem" />

        {result.passed ? (
          <LifecyclePanel step={step} onStep={setStep} />
        ) : (
          <BlockedPanel
            failed={result.summary.failed + result.governance.length}
            onLoadPassing={() => loadPreset("AST-001")}
          />
        )}
      </div>
    </section>
  );
}

function StageHeading({ n, title }: { n: string; title: string }): ReactElement {
  return (
    <div className="mb-5 mt-14 flex items-center gap-3">
      <span className="flex size-7 items-center justify-center rounded-full border border-[var(--gold)] font-mono text-xs text-gold-bright">
        {n}
      </span>
      <h3 className="font-display text-xl font-bold text-cream">{title}</h3>
    </div>
  );
}

/* ==========================================================================
   Asset panel
========================================================================== */

function AssetPanel({
  asset,
  presetId,
  edited,
  failing,
  onPreset,
  onReset,
  onChange,
}: {
  asset: Asset;
  presetId: PresetId;
  edited: boolean;
  failing: Set<string>;
  onPreset: (id: PresetId) => void;
  onReset: () => void;
  onChange: (next: Asset) => void;
}): ReactElement {
  const impure = Number(read(asset, "income", "impure_proportion") ?? 0);
  const tangible = Number(read(asset, "structure", "tangible_proportion") ?? 0);
  const impureLimit = Number(conditionValue("impure-income-limit") ?? 0.05);
  const tangibleMin = Number(conditionValue("tangibility") ?? 0.51);

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Start from
        </span>
        {edited && (
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-cream"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Reset
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Example assets">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={p.id === presetId}
            onClick={() => onPreset(p.id)}
            className={`min-h-11 rounded-lg border px-2 py-2 text-left text-xs leading-snug transition-colors ${
              p.id === presetId
                ? "border-[var(--emerald-bright)] bg-[color-mix(in_srgb,var(--emerald)_14%,transparent)] text-cream"
                : "border-border text-muted-foreground hover:border-[var(--emerald-bright)] hover:text-cream"
            }`}
          >
            <span className="block font-medium">{p.label}</span>
            <span className="block font-mono text-[10px] opacity-70">{p.id}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 border-t border-border pt-5">
        <p className="font-display text-lg font-bold text-cream">{asset.name}</p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {String(read(asset, "ownership", "title_reference") ?? "")} ·{" "}
          {asset.valuation ? `${(asset.valuation / 1_000_000).toFixed(1)}M ${asset.currency ?? ""}` : ""}
        </p>
      </div>

      <div className="mt-5 space-y-5">
        <Field label="Income comes from" bad={failing.has("income-is-rent")}>
          <Segmented
            name="Income type"
            value={String(read(asset, "income", "type") ?? "rent")}
            options={[
              { value: "rent", label: "Rent" },
              { value: "interest", label: "Interest" },
            ]}
            onChange={(v) => onChange(withField(asset, "income", "type", v))}
          />
        </Field>

        <Field
          label="Tenant's business"
          htmlFor="tenant-activity"
          bad={failing.has("tenant-activity")}
          hint="Rent from a prohibited activity is impure income."
        >
          <select
            id="tenant-activity"
            value={String(read(asset, "tenant", "activity") ?? "")}
            onChange={(e) => onChange(withField(asset, "tenant", "activity", e.target.value))}
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-cream outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {ACTIVITIES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Impure income"
          htmlFor="impure"
          bad={failing.has("impure-income-limit")}
          value={`${(impure * 100).toFixed(1)}%`}
          hint={`Template limit: ${(impureLimit * 100).toFixed(0)}% or less.`}
        >
          <input
            id="impure"
            type="range"
            min={0}
            max={30}
            step={0.1}
            value={Math.round(impure * 1000) / 10}
            onChange={(e) =>
              onChange(withField(asset, "income", "impure_proportion", Number(e.target.value) / 100))
            }
            className="w-full accent-[var(--emerald-bright)]"
          />
        </Field>

        <Field
          label="Tangible assets"
          htmlFor="tangible"
          bad={failing.has("tangibility")}
          value={`${Math.round(tangible * 100)}%`}
          hint={`Template minimum: ${Math.round(tangibleMin * 100)}%.`}
        >
          <input
            id="tangible"
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(tangible * 100)}
            onChange={(e) =>
              onChange(withField(asset, "structure", "tangible_proportion", Number(e.target.value) / 100))
            }
            className="w-full accent-[var(--emerald-bright)]"
          />
        </Field>

        <div className="space-y-1 rounded-lg border border-border">
          <Toggle
            label="Owner keeps ownership risk"
            hint="Maintenance, insurance, total loss"
            checked={read(asset, "structure", "ownership_risk_retained") === true}
            bad={failing.has("ownership-risk")}
            onChange={(v) => onChange(withField(asset, "structure", "ownership_risk_retained", v))}
          />
          <Toggle
            label="Buyback fixed at par"
            hint="Guarantees principal"
            checked={read(asset, "structure", "buyback_at_par") === true}
            bad={failing.has("no-guaranteed-principal")}
            onChange={(v) => onChange(withField(asset, "structure", "buyback_at_par", v))}
          />
          <Toggle
            label="Title encumbered"
            hint="Existing mortgage or lien"
            checked={read(asset, "ownership", "encumbered") === true}
            bad={failing.has("unencumbered")}
            onChange={(v) => onChange(withField(asset, "ownership", "encumbered", v))}
          />
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  value,
  hint,
  bad,
  children,
}: {
  label: string;
  htmlFor?: string;
  value?: string;
  hint?: string;
  bad?: boolean;
  children: ReactNode;
}): ReactElement {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-sm font-medium text-cream">
          {label}
        </label>
        {value && (
          <span className={`font-mono text-sm ${bad ? "text-[#ff8b8b]" : "text-gold-bright"}`}>
            {value}
          </span>
        )}
      </div>
      {children}
      {hint && (
        <p className={`mt-1.5 text-xs ${bad ? "text-[#ff8b8b]" : "text-muted-foreground"}`}>{hint}</p>
      )}
    </div>
  );
}

function Segmented({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}): ReactElement {
  return (
    <div role="group" aria-label={name} className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-background p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`h-9 rounded-md text-sm transition-colors ${
            o.value === value ? "bg-ink-line text-cream" : "text-muted-foreground hover:text-cream"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  bad,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  bad: boolean;
  onChange: (v: boolean) => void;
}): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center justify-between gap-4 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.02]"
    >
      <span>
        <span className={`block text-sm ${bad ? "text-[#ff8b8b]" : "text-cream"}`}>{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <span
        aria-hidden="true"
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-[var(--emerald)]" : "bg-ink-line"
        }`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-cream transition-transform ${
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

/* ==========================================================================
   Screening panel
========================================================================== */

function ScreeningPanel({ result }: { result: ScreeningResult }): ReactElement {
  const failedCount = result.summary.failed + result.governance.length;
  const cert = TEMPLATE.certification;

  return (
    <div className="flex flex-col rounded-xl border border-border bg-[#080e19]">
      <div
        aria-live="polite"
        className={`rounded-t-xl border-b px-6 py-5 ${
          result.passed
            ? "border-[color-mix(in_srgb,var(--emerald)_50%,transparent)] bg-[color-mix(in_srgb,var(--emerald)_12%,transparent)]"
            : "border-[#5a2630] bg-[#2a1218]"
        }`}
      >
        <p className={`font-display text-xl font-bold ${result.passed ? "text-emerald-bright" : "text-[#ff8b8b]"}`}>
          {result.passed
            ? `Eligible — ${result.summary.passed} of ${result.summary.total} conditions met`
            : `Rejected — ${failedCount} of ${result.summary.total} conditions failed`}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {result.passed
            ? "A signing key would now be created inside custody, and the Sukuk issued."
            : "No signing key is created and nothing reaches the chain. Every failing condition is listed, not just the first."}
        </p>
      </div>

      <div className="border-b border-border px-6 py-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
        {TEMPLATE.template_id} v{TEMPLATE.version} · certified by {cert.certified_by} · valid until{" "}
        {cert.expires_at}
      </div>

      <ul className="flex-grow divide-y divide-border/60">
        {result.governance.map((g) => (
          <li key={g.code} className="flex gap-3 px-6 py-3 text-sm text-[#ff8b8b]">
            <X className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {g.message}
          </li>
        ))}
        {result.results.map((r) => (
          <li key={r.condition_id} className="flex gap-3 px-6 py-3">
            {r.passed ? (
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-bright" aria-label="Passed" />
            ) : (
              <X className="mt-0.5 size-4 shrink-0 text-[#ff8b8b]" aria-label="Failed" />
            )}
            <span className="min-w-0">
              <span className={`block text-sm ${r.passed ? "text-cream" : "font-medium text-[#ff8b8b]"}`}>
                {CONDITION_TITLES[r.condition_id] ?? r.condition_id}
              </span>
              <span className="block break-words text-xs leading-relaxed text-muted-foreground">
                {r.reason}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <p className="rounded-b-xl border-t border-border px-6 py-3 text-xs text-muted-foreground">
        Evaluated in your browser by{" "}
        <a href={EVALUATOR_SOURCE} className="font-mono text-emerald-bright underline decoration-dotted underline-offset-4 hover:text-cream">
          evaluator.ts
        </a>{" "}
        — the same file the API runs.
      </p>
    </div>
  );
}

/* ==========================================================================
   Lifecycle
========================================================================== */

function BlockedPanel({
  failed,
  onLoadPassing,
}: {
  failed: number;
  onLoadPassing: () => void;
}): ReactElement {
  return (
    <div className="flex flex-col items-start gap-4 rounded-xl border border-dashed border-border bg-background/50 p-8 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-4">
        <Lock className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="font-medium text-cream">Issuance is blocked.</p>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
            This asset fails {failed} {failed === 1 ? "condition" : "conditions"}, so no signing key is
            ever created for it — and without a key, nothing can be issued. That ordering is the
            control: a key only exists because an asset passed.
          </p>
        </div>
      </div>
      <Button type="button" variant="outline" onClick={onLoadPassing}>
        Load a passing asset
      </Button>
    </div>
  );
}

function LifecyclePanel({
  step,
  onStep,
}: {
  step: number;
  onStep: (n: number) => void;
}): ReactElement {
  const current = STEPS[step] ?? STEPS[0];
  if (!current) return <></>;

  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <p className="text-sm text-muted-foreground">
          <span className="text-cream">Replaying a real Sukuk on devnet.</span> Your edited asset
          isn&apos;t issued here.
        </p>
        <a
          href={explorerAddress(SUKUK_PDA)}
          className="font-mono text-xs text-emerald-bright underline decoration-dotted underline-offset-4 hover:text-cream"
        >
          Sukuk account {short(SUKUK_PDA)}
        </a>
      </div>

      <ol className="flex gap-1 overflow-x-auto border-b border-border px-4 py-3" aria-label="Lifecycle steps">
        {STEPS.map((s, i) => (
          <li key={s.id} className="shrink-0">
            <button
              type="button"
              aria-current={i === step ? "step" : undefined}
              onClick={() => onStep(i)}
              className={`flex min-h-10 items-center gap-2 rounded-md px-3 text-sm transition-colors ${
                i === step
                  ? "bg-ink-line text-cream"
                  : i < step
                    ? "text-emerald-bright hover:bg-white/[0.03]"
                    : "text-muted-foreground hover:bg-white/[0.03] hover:text-cream"
              }`}
            >
              <span className="font-mono text-[11px] opacity-70">{String(i + 1).padStart(2, "0")}</span>
              {s.label}
            </button>
          </li>
        ))}
      </ol>

      <div className="grid gap-8 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <StepBody step={current} />
        <StatePanel step={current} />
      </div>

      <div className="flex items-center justify-between border-t border-border px-6 py-4">
        <Button type="button" variant="ghost" disabled={isFirst} onClick={() => onStep(step - 1)}>
          <ChevronLeft />
          Back
        </Button>
        <span className="font-mono text-xs text-muted-foreground">
          {step + 1} / {STEPS.length}
        </span>
        <Button type="button" disabled={isLast} onClick={() => onStep(step + 1)}>
          Next
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

function StepBody({ step }: { step: LifecycleStep }): ReactElement {
  return (
    <div>
      <span className="font-mono text-xs text-gold-bright">{step.instruction}</span>
      <h4 className="mt-2 font-display text-2xl font-bold leading-snug text-cream">{step.title}</h4>
      <p className="mt-4 leading-relaxed text-cream/90">{step.what}</p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.why}</p>

      {step.id === "issue" && (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          On the platform, this transaction is signed inside the custody boundary after screening.{" "}
          <a
            href={explorerTx(CUSTODY_SIGNED_ISSUE)}
            className="text-emerald-bright underline decoration-dotted underline-offset-4 hover:text-cream"
          >
            See a custody-signed issuance
          </a>
          .
        </p>
      )}

      <ul className="mt-6 space-y-2">
        {step.txs.map((t) => (
          <li key={t.sig}>
            <a
              href={explorerTx(t.sig)}
              className="group flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:border-[var(--emerald-bright)]"
            >
              <span className="text-sm text-cream">{t.label}</span>
              <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground group-hover:text-emerald-bright">
                {short(t.sig)}
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatePanel({ step }: { step: LifecycleStep }): ReactElement {
  const s = step.state;
  const outstanding = s.a + s.b;

  return (
    <div className="space-y-6">
      <OwnershipBar state={s} />

      <dl className="grid grid-cols-2 gap-3">
        <Stat label="Units outstanding" value={`${outstanding.toLocaleString()} / ${TOTAL_UNITS.toLocaleString()}`} />
        <Stat label="Periods paid" value={String(s.periods)} />
        <Stat label="Rent distributed" value={`${formatSol(s.distributedLamports)} SOL`} />
        <Stat label="Status" value={s.closed ? "Closed" : "Open"} highlight={s.closed} />
      </dl>
      <p className="-mt-3 text-xs text-muted-foreground">Mirrors the fields of the on-chain SukukAsset account.</p>

      {step.rentLamports !== undefined && (
        // Keyed by step so the "try another rent" input resets between periods.
        <Split key={step.id} rentLamports={step.rentLamports} state={s} />
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }): ReactElement {
  return (
    <div className="rounded-lg border border-border bg-background/60 px-4 py-3">
      <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className={`mt-1 font-mono text-base ${highlight ? "text-gold-bright" : "text-cream"}`}>{value}</dd>
    </div>
  );
}

function OwnershipBar({ state }: { state: LifecycleState }): ReactElement {
  const notIssued = TOTAL_UNITS - state.a - state.b - state.boughtBack;
  const pct = (n: number) => `${(n / TOTAL_UNITS) * 100}%`;

  const segments = [
    { key: "a", label: "Investor A", units: state.a, cls: "bg-[var(--emerald)]" },
    { key: "b", label: "Investor B", units: state.b, cls: "bg-[var(--emerald-bright)]" },
    { key: "bb", label: "Bought back", units: state.boughtBack, cls: "bg-[color-mix(in_srgb,var(--gold)_45%,transparent)]" },
    { key: "ni", label: "Not yet issued", units: notIssued, cls: "bg-ink-line" },
  ];

  return (
    <div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        Who owns the asset
      </p>
      <div
        className="flex h-4 overflow-hidden rounded-full bg-ink-line"
        role="img"
        aria-label={segments
          .filter((x) => x.units > 0)
          .map((x) => `${x.label}: ${x.units} units`)
          .join(", ")}
      >
        {segments.map((x) =>
          x.units > 0 ? (
            <span key={x.key} className={`h-full transition-[width] duration-500 ${x.cls}`} style={{ width: pct(x.units) }} />
          ) : null,
        )}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {segments.map((x) => (
          <li key={x.key} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-sm ${x.cls}`} />
            {x.label}
            <span className="ml-auto font-mono text-cream">{x.units}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Split({ rentLamports, state }: { rentLamports: bigint; state: LifecycleState }): ReactElement {
  const actual = formatSol(rentLamports);
  const [input, setInput] = useState(actual);

  const parsed = parseSol(input);
  const rent = parsed ?? rentLamports;
  const recomputed = parsed !== null && parsed !== rentLamports;

  const outstanding = BigInt(state.a + state.b);
  const d = distribute(
    rent,
    [
      { label: "Investor A", units: BigInt(state.a) },
      { label: "Investor B", units: BigInt(state.b) },
    ],
    outstanding,
  );

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          The split
        </span>
        {recomputed ? (
          <span className="rounded-full border border-[color-mix(in_srgb,var(--gold)_45%,transparent)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-gold-bright">
            Recomputed — not on-chain
          </span>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-emerald-bright">As paid on devnet</span>
        )}
      </div>

      <table className="w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th>Holder</th>
            <th>Share</th>
            <th>Paid</th>
          </tr>
        </thead>
        <tbody>
          {d.shares.map((sh) => (
            <tr key={sh.label} className="border-b border-border/60">
              <td className="px-4 py-2.5 text-cream">
                {sh.label} <span className="text-xs text-muted-foreground">· {sh.units.toString()} units</span>
              </td>
              <td className="px-2 py-2.5 text-right font-mono text-xs text-muted-foreground">
                {((Number(sh.units) / Number(outstanding)) * 100).toFixed(1)}%
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-cream">{formatSol(sh.lamports)} SOL</td>
            </tr>
          ))}
          <tr>
            <td className="px-4 py-2.5 text-xs text-muted-foreground">Left undistributed (truncation)</td>
            <td />
            <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">
              {d.dust.toString()} lamports
            </td>
          </tr>
        </tbody>
      </table>

      <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3">
        <label htmlFor="rent-input" className="text-xs text-muted-foreground">
          Try another rent amount
        </label>
        <div className="flex items-center gap-2">
          <input
            id="rent-input"
            inputMode="decimal"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-invalid={parsed === null}
            className="h-9 w-32 rounded-md border border-border bg-background px-3 font-mono text-sm text-cream outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-[#ff8b8b]"
          />
          <span className="text-xs text-muted-foreground">SOL</span>
        </div>
        {recomputed && (
          <button
            type="button"
            onClick={() => setInput(actual)}
            className="text-xs text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-cream"
          >
            Back to {actual}
          </button>
        )}
      </div>
      <p className="px-4 pb-3 text-xs leading-relaxed text-muted-foreground">
        Same integer arithmetic as <span className="font-mono">distribute_profit</span>: multiply
        before dividing, truncate, and leave the remainder undistributed rather than round it onto
        anyone.
      </p>
    </div>
  );
}
