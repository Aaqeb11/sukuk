use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount};

declare_id!("GS18oFeFhDvUzuiVEoe1HTT7gGMhULy2RZzLZibzs4Zd");

#[program]
pub mod anchor {
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
    /// TODO: enforce allowlist before minting.
    pub fn mint_units(_ctx: Context<MintUnits>, _amount: u64) -> Result<()> {
        Ok(())
    }

    /// Distributes a period's rent pro-rata across current holders.
    /// `rent_collected` is supplied by the off-chain attestation source (mocked in the PoC).
    /// MUST be a pro-rata share of actual rent, never a fixed guaranteed return.
    pub fn distribute_profit(_ctx: Context<DistributeProfit>, _rent_collected: u64) -> Result<()> {
        Ok(())
    }

    /// Lessee buys back a slice of ownership; those units are burned.
    /// This is the Diminishing Musharaka mechanic — units_outstanding shrinks each period.
    pub fn buyback_and_burn(_ctx: Context<BuybackAndBurn>, _units: u64) -> Result<()> {
        Ok(())
    }

    /// Closes the instrument once units_outstanding reaches zero.
    pub fn redeem(_ctx: Context<Redeem>) -> Result<()> {
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
pub struct MintUnits<'info> {
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

// ---------- Errors ----------

#[error_code]
pub enum SukukError {
    #[msg("Total units must be greater than zero")]
    InvalidUnitCount,
    #[msg("Not enough unissued units remaining")]
    InsufficientUnits,
    #[msg("This Sukuk is already closed")]
    AlreadyClosed,
    #[msg("Units still outstanding; cannot redeem yet")]
    UnitsStillOutstanding,
    #[msg("Investor is not on the allowlist")]
    NotAllowlisted,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
