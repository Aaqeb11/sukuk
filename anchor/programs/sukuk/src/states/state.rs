use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct SukukAsset {
    /// Issuer / mint authority. In production this key lives in an HSM.
    pub authority: Pubkey,
    /// SPL mint for the ownership units.
    pub mint: Pubkey,
    /// Reference to the off-chain asset record.
    pub asset_id: u64,
    /// Total units defined at issuance.
    pub total_units: u64,
    /// Units minted to investors so far.
    pub units_issued: u64,
    /// Units still held by investors. Shrinks on buyback.
    pub units_outstanding: u64,
    /// Number of distribution periods completed.
    pub periods_elapsed: u32,
    /// Cumulative rent distributed, for reporting.
    pub total_distributed: u64,
    /// Set true by `redeem`.
    pub is_closed: bool,
    pub bump: u8,
}
