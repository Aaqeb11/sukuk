use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount};

declare_id!("GS18oFeFhDvUzuiVEoe1HTT7gGMhULy2RZzLZibzs4Zd");

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

    /// Mints fractional ownership units to an investor.
    /// The PDA is the mint authority, so minting can only happen through this instruction.
    /// TODO: enforce allowlist before minting.
    pub fn mint_units(ctx: Context<MintUnits>, _asset_id: u64, amount: u64) -> Result<()> {
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
        let signer_seeds: &[&[&[u8]]] = &[&[b"sukuk", asset_id_bytes.as_ref(), &[asset.bump]]];

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

    //// Distributes a period's rent pro-rata across current holders.
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

    /// Lessee buys back a slice of ownership from a holder; those units are burned.
    /// This is the Diminishing Musharaka mechanic — units_outstanding shrinks each period.
    ///
    /// PoC note: the holder signs to authorize the burn. In production the buyback is
    /// pre-agreed in the lease contract, so the holder would delegate burn authority to
    /// the PDA at mint time and the burn would run pro-rata across all holders.
    pub fn buyback_and_burn(ctx: Context<BuybackAndBurn>, units: u64) -> Result<()> {
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

    /// Closes the instrument once units_outstanding reaches zero.
    /// Triggered by state, not by choice — the issuer cannot close early.
    pub fn redeem(ctx: Context<Redeem>) -> Result<()> {
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
}

// ---------- State ----------

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

// ---------- Accounts ----------

#[derive(Accounts)]
#[instruction(asset_id: u64)]
pub struct InitializeSukuk<'info> {
    #[account(init, payer = authority, space = 8 + SukukAsset::INIT_SPACE, seeds = [b"sukuk", asset_id.to_le_bytes().as_ref()],
            bump)]
    pub sukuk_asset: Account<'info, SukukAsset>,
    #[account(init, payer = authority, mint::decimals = 0, mint::authority = sukuk_asset)]
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(asset_id: u64)]
pub struct MintUnits<'info> {
    #[account(
        mut,
        seeds = [b"sukuk", asset_id.to_le_bytes().as_ref()],
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

#[derive(Accounts)]
pub struct DistributeProfit<'info> {
    #[account(
        mut,
        seeds = [b"sukuk", sukuk_asset.asset_id.to_le_bytes().as_ref()],
        bump = sukuk_asset.bump,
        has_one = authority,
    )]
    pub sukuk_asset: Account<'info, SukukAsset>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
    // Holder accounts passed via ctx.remaining_accounts (PoC: small known set).
}

#[derive(Accounts)]
pub struct BuybackAndBurn<'info> {
    #[account(
        mut,
        seeds = [b"sukuk", sukuk_asset.asset_id.to_le_bytes().as_ref()],
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

#[derive(Accounts)]
pub struct Redeem<'info> {
    #[account(
        mut,
        seeds = [b"sukuk", sukuk_asset.asset_id.to_le_bytes().as_ref()],
        bump = sukuk_asset.bump,
        has_one = authority,
    )]
    pub sukuk_asset: Account<'info, SukukAsset>,

    pub authority: Signer<'info>,
}

// ---------- Events ----------

#[event]
pub struct ProfitDistributed {
    pub asset_id: u64,
    pub period: u32,
    pub rent_collected: u64,
    pub distributed: u64,
}

#[event]
pub struct UnitsBoughtBack {
    pub asset_id: u64,
    pub units: u64,
    pub units_outstanding: u64,
}

#[event]
pub struct SukukRedeemed {
    pub asset_id: u64,
    pub periods_elapsed: u32,
    pub total_distributed: u64,
}

// ---------- Errors ----------

#[error_code]
pub enum SukukError {
    #[msg("Total units must be greater than zero")]
    InvalidUnitCount,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Not enough unissued units remaining")]
    InsufficientUnits,
    #[msg("This Sukuk is already closed")]
    AlreadyClosed,
    #[msg("Units still outstanding; cannot redeem yet")]
    UnitsStillOutstanding,
    #[msg("No units outstanding to distribute to")]
    NoUnitsOutstanding,
    #[msg("Investor is not on the allowlist")]
    NotAllowlisted,
    #[msg("Token account does not belong to this Sukuk's mint")]
    WrongMint,
    #[msg("Token account owner does not match the wallet provided")]
    HolderMismatch,
    #[msg("Holder accounts must be provided as [token_account, wallet] pairs")]
    InvalidHolderAccounts,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
