use anchor_lang::prelude::*;

use crate::constants::SUKUK_SEED;
use crate::states::SukukAsset;
use crate::{SukukError, SukukRedeemed};

#[derive(Accounts)]
#[instruction(asset_id: u64)]
pub struct Redeem<'info> {
    #[account(
        mut,
        seeds = [SUKUK_SEED, asset_id.to_le_bytes().as_ref()],
        bump = sukuk_asset.bump,
        has_one = authority,
    )]
    pub sukuk_asset: Account<'info, SukukAsset>,

    pub authority: Signer<'info>,
}

/// Closes the instrument once units_outstanding reaches zero.
/// Triggered by state, not by choice — the issuer cannot close early.
pub(crate) fn handler(ctx: Context<Redeem>, _asset_id: u64) -> Result<()> {
    let asset = &mut ctx.accounts.sukuk_asset;
    require!(!asset.is_closed, SukukError::AlreadyClosed);
    require!(
        asset.units_outstanding == 0,
        SukukError::UnitsStillOutstanding
    );

    asset.is_closed = true;

    emit!(SukukRedeemed {
        asset_id: asset.asset_id,
        periods_elapsed: asset.periods_elapsed,
        total_distributed: asset.total_distributed,
    });

    Ok(())
}
