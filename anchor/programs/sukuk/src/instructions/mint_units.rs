use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};

use crate::constants::SUKUK_SEED;
use crate::states::SukukAsset;
use crate::errors::SukukError;

#[derive(Accounts)]
#[instruction(asset_id: u64)]
pub struct MintUnits<'info> {
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
    pub investor_token_account: Account<'info, TokenAccount>,

    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

/// Mints fractional ownership units to an investor.
/// The PDA is the mint authority, so minting can only happen through this instruction.
/// TODO: enforce allowlist before minting.
pub(crate) fn handler(ctx: Context<MintUnits>, _asset_id: u64, amount: u64) -> Result<()> {
    let asset = &ctx.accounts.sukuk_asset;
    require!(!asset.is_closed, SukukError::AlreadyClosed);
    require!(amount > 0, SukukError::InvalidAmount);
    require_keys_eq!(
        ctx.accounts.investor_token_account.mint,
        asset.mint,
        SukukError::WrongMint
    );

    // Cannot issue more than the total units defined at issuance.
    let new_issued = asset
        .units_issued
        .checked_add(amount)
        .ok_or(SukukError::MathOverflow)?;

    require!(
        new_issued <= asset.total_units,
        SukukError::InsufficientUnits
    );

    // The PDA has no private key, so the program signs on its behalf with the seeds.
    let asset_id_bytes = asset.asset_id.to_le_bytes();
    let signer_seeds: &[&[&[u8]]] = &[&[SUKUK_SEED, asset_id_bytes.as_ref(), &[asset.bump]]];

    let cpi_accounts = MintTo {
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.investor_token_account.to_account_info(),
        authority: ctx.accounts.sukuk_asset.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );
    token::mint_to(cpi_ctx, amount)?;

    let asset = &mut ctx.accounts.sukuk_asset;
    asset.units_issued = new_issued;
    asset.units_outstanding = asset
        .units_outstanding
        .checked_add(amount)
        .ok_or(SukukError::MathOverflow)?;

    Ok(())
}
