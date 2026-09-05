use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::TokenAccount;

use crate::constants::SUKUK_SEED;
use crate::states::SukukAsset;
use crate::errors::SukukError;
use crate::events::ProfitDistributed;

#[derive(Accounts)]
#[instruction(asset_id: u64)]
pub struct DistributeProfit<'info> {
    #[account(
        mut,
        seeds = [SUKUK_SEED, asset_id.to_le_bytes().as_ref()],
        bump = sukuk_asset.bump,
        has_one = authority,
    )]
    pub sukuk_asset: Account<'info, SukukAsset>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
    // Holder accounts passed via ctx.remaining_accounts (PoC: small known set).
}

//// Distributes a period's rent pro-rata across current holders.
///
/// `rent_collected` is supplied by the off-chain attestation source (mocked in the PoC).
/// MUST be a pro-rata share of actual rent, never a fixed guaranteed return — a fixed
/// return would make this interest-bearing debt and break Shariah compliance.
///
/// Holders are passed via `remaining_accounts` as PAIRS, in order:
///   [token_account_1, wallet_1, token_account_2, wallet_2, ...]
/// Every wallet must be writable. PoC only: a small, known set of holders.
pub(crate) fn handler<'info>(
    ctx: Context<'_, '_, 'info, 'info, DistributeProfit<'info>>,
    _asset_id: u64,
    rent_collected: u64,
) -> Result<()> {
    let asset = &ctx.accounts.sukuk_asset;
    require!(!asset.is_closed, SukukError::AlreadyClosed);
    require!(rent_collected > 0, SukukError::InvalidAmount);
    require!(asset.units_outstanding > 0, SukukError::NoUnitsOutstanding);

    let outstanding = asset.units_outstanding;
    let asset_mint = asset.mint;

    let remaining = ctx.remaining_accounts;
    require!(
        !remaining.is_empty() && remaining.len() % 2 == 0,
        SukukError::InvalidHolderAccounts
    );

    let mut distributed: u64 = 0;

    for pair in remaining.chunks(2) {
        let token_account_info = &pair[0];
        let wallet_info = &pair[1];

        // Deserialize and validate the holder's token account.
        let holder_token: Account<TokenAccount> = Account::try_from(token_account_info)?;
        require_keys_eq!(holder_token.mint, asset_mint, SukukError::WrongMint);
        require_keys_eq!(
            holder_token.owner,
            wallet_info.key(),
            SukukError::HolderMismatch
        );

        if holder_token.amount == 0 {
            continue;
        }

        // share = rent * holder_units / total_outstanding
        // u128 intermediate so a large rent figure cannot overflow mid-calculation.
        let share = (rent_collected as u128)
            .checked_mul(holder_token.amount as u128)
            .ok_or(SukukError::MathOverflow)?
            .checked_div(outstanding as u128)
            .ok_or(SukukError::MathOverflow)? as u64;

        if share == 0 {
            continue;
        }

        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.authority.to_account_info(),
                to: wallet_info.clone(),
            },
        );
        system_program::transfer(cpi_ctx, share)?;

        distributed = distributed
            .checked_add(share)
            .ok_or(SukukError::MathOverflow)?;
    }

    let asset = &mut ctx.accounts.sukuk_asset;
    asset.periods_elapsed = asset
        .periods_elapsed
        .checked_add(1)
        .ok_or(SukukError::MathOverflow)?;
    asset.total_distributed = asset
        .total_distributed
        .checked_add(distributed)
        .ok_or(SukukError::MathOverflow)?;

    emit!(ProfitDistributed {
        asset_id: asset.asset_id,
        period: asset.periods_elapsed,
        rent_collected,
        distributed,
    });

    Ok(())
}
