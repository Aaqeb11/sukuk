use anchor_lang::prelude::*;

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
