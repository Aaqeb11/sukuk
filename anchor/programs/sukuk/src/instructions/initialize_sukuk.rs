use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};

use crate::constants::SUKUK_SEED;
use crate::states::SukukAsset;
use crate::SukukError;

#[derive(Accounts)]
#[instruction(asset_id: u64)]
pub struct InitializeSukuk<'info> {
    #[account(init, payer = authority, space = 8 + SukukAsset::INIT_SPACE, seeds = [SUKUK_SEED, asset_id.to_le_bytes().as_ref()],
            bump)]
    pub sukuk_asset: Account<'info, SukukAsset>,
    #[account(init, payer = authority, mint::decimals = 0, mint::authority = sukuk_asset)]
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

/// Creates the SukukAsset PDA and the SPL mint for ownership units.
/// Runs once per asset. The off-chain eligibility engine must pass before this is called.
pub(crate) fn handler(
    ctx: Context<InitializeSukuk>,
    asset_id: u64,
    total_units: u64,
) -> Result<()> {
    require!(total_units > 0, SukukError::InvalidUnitCount);

    let asset = &mut ctx.accounts.sukuk_asset;
    asset.asset_id = asset_id;
    asset.total_units = total_units;
    asset.authority = ctx.accounts.authority.key();
    asset.mint = ctx.accounts.mint.key();
    asset.units_outstanding = 0;
    asset.units_issued = 0;
    asset.periods_elapsed = 0;
    asset.total_distributed = 0;
    asset.is_closed = false;
    asset.bump = ctx.bumps.sukuk_asset;

    Ok(())
}
