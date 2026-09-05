use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount};

use crate::constants::SUKUK_SEED;
use crate::states::SukukAsset;
use crate::errors::SukukError;
use crate::events::UnitsBoughtBack;

#[derive(Accounts)]
#[instruction(asset_id: u64)]
pub struct BuybackAndBurn<'info> {
    #[account(
        mut,
        seeds = [SUKUK_SEED, asset_id.to_le_bytes().as_ref()],
        bump = sukuk_asset.bump,
        has_one = authority,
        has_one = mint,
    )]
    pub sukuk_asset: Account<'info, SukukAsset>,

    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub holder_token_account: Account<'info, TokenAccount>,

    /// The investor selling units back. Must sign to authorize the burn.
    pub holder: Signer<'info>,

    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

/// Lessee buys back a slice of ownership from a holder; those units are burned.
/// This is the Diminishing Musharaka mechanic — units_outstanding shrinks each period.
///
/// PoC note: the holder signs to authorize the burn. In production the buyback is
/// pre-agreed in the lease contract, so the holder would delegate burn authority to
/// the PDA at mint time and the burn would run pro-rata across all holders.
pub(crate) fn handler(ctx: Context<BuybackAndBurn>, _asset_id: u64, units: u64) -> Result<()> {
    let asset = &ctx.accounts.sukuk_asset;
    require!(!asset.is_closed, SukukError::AlreadyClosed);
    require!(units > 0, SukukError::InvalidAmount);
    require!(
        units <= asset.units_outstanding,
        SukukError::InsufficientUnits
    );
    require!(
        ctx.accounts.holder_token_account.amount >= units,
        SukukError::InsufficientUnits
    );
    require_keys_eq!(
        ctx.accounts.holder_token_account.mint,
        asset.mint,
        SukukError::WrongMint
    );

    // Burn is authorized by the token account owner, not the PDA.
    let cpi_accounts = Burn {
        mint: ctx.accounts.mint.to_account_info(),
        from: ctx.accounts.holder_token_account.to_account_info(),
        authority: ctx.accounts.holder.to_account_info(),
    };
    token::burn(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
        units,
    )?;

    let asset = &mut ctx.accounts.sukuk_asset;
    asset.units_outstanding = asset
        .units_outstanding
        .checked_sub(units)
        .ok_or(SukukError::MathOverflow)?;

    emit!(UnitsBoughtBack {
        asset_id: asset.asset_id,
        units,
        units_outstanding: asset.units_outstanding,
    });

    Ok(())
}
