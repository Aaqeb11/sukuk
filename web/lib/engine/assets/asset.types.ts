/**
 * The asset being screened.
 *
 * Deliberately loose. Conditions address fields by dot-notation path, so the
 * evaluator never needs to know an asset's shape — and templates can reference
 * fields this interface does not name.
 *
 * Only the identifying fields are required. Everything a condition might test
 * lives under the open-ended sections below, which means adding a new condition
 * later does not require changing this type.
 */

/** Where the asset's income comes from. */
export interface AssetIncome {
  /**
   * "rent" for an Ijara or Diminishing Musharaka structure.
   * Interest-bearing income is what the structure exists to avoid.
   */
  type?: string;

  /** Annual income, in the asset's currency. */
  annual_amount?: number;

  currency?: string;

  /** Proportion of income from non-permitted sources, 0–1. */
  impure_proportion?: number;

  [key: string]: unknown;
}

/** Who occupies the asset and what they do there. */
export interface AssetTenant {
  name?: string;

  /**
   * The tenant's business activity. This is where business-activity screening
   * actually bites for a real-estate asset: rent from a prohibited activity is
   * impure income regardless of how the structure is drafted.
   */
  activity?: string;

  lease_term_years?: number;

  [key: string]: unknown;
}

/** Legal ownership position. */
export interface AssetOwnership {
  /** Title or deed reference. Assets must be specifically identified. */
  title_reference?: string;

  /** Whether the issuer holds clean title. */
  clear_title?: boolean;

  /** Existing charges, mortgages or liens against the asset. */
  encumbered?: boolean;

  /** Whether title or usufruct can be transferred to the SPV. */
  transferable?: boolean;

  [key: string]: unknown;
}

/** Terms of the proposed structure. */
export interface AssetStructure {
  /** e.g. "diminishing-musharaka", "ijara". */
  type?: string;

  /**
   * Whether the owner retains genuine ownership risk (major maintenance,
   * insurance, total loss). If every risk passes to the lessee, the lease is
   * a loan in costume.
   */
  ownership_risk_retained?: boolean;

  /**
   * Whether buyback is fixed at par. A purchase undertaking at face value
   * effectively guarantees principal, which reintroduces exactly what the
   * structure is meant to avoid.
   */
  buyback_at_par?: boolean;

  /** Proportion of the underlying that is tangible asset rather than receivable. */
  tangible_proportion?: number;

  [key: string]: unknown;
}

export interface Asset {
  asset_id: string;

  /** e.g. "real_estate", "equipment". */
  asset_type: string;

  name: string;

  valuation?: number;

  currency?: string;

  jurisdiction?: string;

  ownership?: AssetOwnership;
  income?: AssetIncome;
  tenant?: AssetTenant;
  structure?: AssetStructure;

  /**
   * Anything a template addresses that is not modelled above.
   * The index signature is the point: conditions are data, so the asset
   * shape must stay open.
   */
  [key: string]: unknown;
}
