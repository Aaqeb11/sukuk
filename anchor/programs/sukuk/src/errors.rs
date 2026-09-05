use anchor_lang::prelude::*;

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
