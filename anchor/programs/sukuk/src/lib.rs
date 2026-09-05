use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod states;

use instructions::*;

declare_id!("E3qnd2CcmPqfk3BbTD5czpbGr3Bv7BMedriBcCT94pYu");

#[program]
pub mod sukuk {

    use super::*;

    /// Creates the SukukAsset PDA and the SPL mint for ownership units.
    /// Runs once per asset. The off-chain eligibility engine must pass before this is called.
    pub fn initialize_sukuk(
        ctx: Context<InitializeSukuk>,
        asset_id: u64,
        total_units: u64,
    ) -> Result<()> {
        instructions::initialize_sukuk::handler(ctx, asset_id, total_units)
    }

    /// Mints fractional ownership units to an investor.
    /// The PDA is the mint authority, so minting can only happen through this instruction.
    /// TODO: enforce allowlist before minting.
    pub fn mint_units(ctx: Context<MintUnits>, asset_id: u64, amount: u64) -> Result<()> {
        instructions::mint_units::handler(ctx, asset_id, amount)
    }

    /// Distributes a period's rent pro-rata across current holders.
    ///
    /// `rent_collected` is supplied by the off-chain attestation source (mocked in the PoC).
    /// MUST be a pro-rata share of actual rent, never a fixed guaranteed return — a fixed
    /// return would make this interest-bearing debt and break Shariah compliance.
    ///
    /// Holders are passed via `remaining_accounts` as PAIRS, in order:
    ///   [token_account_1, wallet_1, token_account_2, wallet_2, ...]
    /// Every wallet must be writable. PoC only: a small, known set of holders.
    pub fn distribute_profit<'info>(
        ctx: Context<'_, '_, 'info, 'info, DistributeProfit<'info>>,
        asset_id: u64,
        rent_collected: u64,
    ) -> Result<()> {
        instructions::distribute_profit::handler(ctx, asset_id, rent_collected)
    }

    /// Lessee buys back a slice of ownership from a holder; those units are burned.
    /// This is the Diminishing Musharaka mechanic — units_outstanding shrinks each period.
    ///
    /// PoC note: the holder signs to authorize the burn. In production the buyback is
    /// pre-agreed in the lease contract, so the holder would delegate burn authority to
    /// the PDA at mint time and the burn would run pro-rata across all holders.
    pub fn buyback_and_burn(ctx: Context<BuybackAndBurn>, asset_id: u64, units: u64) -> Result<()> {
        instructions::buyback_and_burn::handler(ctx, asset_id, units)
    }

    /// Closes the instrument once units_outstanding reaches zero.
    /// Triggered by state, not by choice — the issuer cannot close early.
    pub fn redeem(ctx: Context<Redeem>, asset_id: u64) -> Result<()> {
        instructions::redeem::handler(ctx, asset_id)
    }
}
