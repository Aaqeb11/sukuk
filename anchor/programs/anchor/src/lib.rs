use anchor_lang::prelude::*;

declare_id!("GS18oFeFhDvUzuiVEoe1HTT7gGMhULy2RZzLZibzs4Zd");

#[program]
pub mod anchor {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
