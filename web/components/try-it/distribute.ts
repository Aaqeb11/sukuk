/**
 * The pro-rata split, computed exactly as `distribute_profit` computes it.
 *
 * Mirrors anchor/programs/sukuk/src/instructions/distribute_profit.rs:
 *
 *   share = rent_collected * holder_units / units_outstanding
 *
 * in a u128 intermediate, multiplying before dividing, with integer division
 * that truncates. Holders with zero units are skipped, and so is any share
 * that truncates to zero. Whatever does not divide evenly is left
 * undistributed — the "dust" — rather than rounded onto someone.
 *
 * BigInt rather than Number so the arithmetic is the same integer arithmetic
 * the program does, not a floating-point approximation of it.
 */

export interface Holding {
  label: string;
  units: bigint;
}

export interface Share extends Holding {
  lamports: bigint;
}

export interface Distribution {
  shares: Share[];
  distributed: bigint;
  /** rent - distributed: what truncation left behind. */
  dust: bigint;
}

export function distribute(
  rentLamports: bigint,
  holdings: Holding[],
  unitsOutstanding: bigint,
): Distribution {
  const shares: Share[] = [];
  let distributed = 0n;

  for (const h of holdings) {
    if (h.units === 0n || unitsOutstanding === 0n) continue;

    const lamports = (rentLamports * h.units) / unitsOutstanding;
    if (lamports === 0n) continue;

    shares.push({ ...h, lamports });
    distributed += lamports;
  }

  return { shares, distributed, dust: rentLamports - distributed };
}

export const LAMPORTS_PER_SOL = 1_000_000_000n;

/** 10_000_000n → "0.01" — exact, no float rounding. */
export function formatSol(lamports: bigint): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const frac = (lamports % LAMPORTS_PER_SOL).toString().padStart(9, "0");
  const trimmed = frac.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole.toString();
}

/** "0.01" → 10_000_000n. Returns null for anything that isn't a valid amount. */
export function parseSol(input: string): bigint | null {
  const s = input.trim();
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;

  const [whole = "0", frac = ""] = s.split(".");
  if (frac.length > 9) return null;

  return (
    BigInt(whole || "0") * LAMPORTS_PER_SOL +
    BigInt(frac.padEnd(9, "0") || "0")
  );
}
