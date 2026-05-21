import { TypeNameRaw } from "@cetusprotocol/common-sdk";
import { bcs } from "@mysten/sui/bcs";




export const PositionRewardRaw = bcs.struct("PositionReward", {
  growth_inside: bcs.u128(),
  amount_owned: bcs.u64(),
});


export const PositionInfoRaw = bcs.struct("PositionInfo", {
  position_id: bcs.Address,
  liquidity: bcs.u128(),
  tick_lower_index: bcs.u32(),
  tick_upper_index: bcs.u32(),
  fee_growth_inside_a: bcs.u128(),
  fee_growth_inside_b: bcs.u128(),
  fee_owned_a: bcs.u64(),
  fee_owned_b: bcs.u64(),
  points_owned: bcs.u128(),
  points_growth_inside: bcs.u128(),
  rewards: bcs.vector(PositionRewardRaw),
});

const ID = bcs.bytes(32);

export const NodeIDPositionInfo = bcs.struct('Node<ID, PositionInfo>', {
  prev: bcs.option(ID),
  next: bcs.option(ID),
  value: PositionInfoRaw,
});

export const FetchPositionsEventRaw = bcs.struct('FetchPositionsEvent', {
  positions: bcs.vector(PositionInfoRaw),
});


export const TickRaw = bcs.struct('Tick', {
  index: bcs.u32(),
  sqrt_price: bcs.u128(),
  liquidity_net: bcs.u128(),
  liquidity_gross: bcs.u128(),
  fee_growth_outside_a: bcs.u128(),
  fee_growth_outside_b: bcs.u128(),
  points_growth_outside: bcs.u128(),
  rewards_growth_outside: bcs.vector(bcs.u128()),
});


export const FetchTicksResultEventRaw = bcs.struct('FetchTicksResultEvent', {
  ticks: bcs.vector(TickRaw),
});

export const FetchPositionRewardsEventRaw = bcs.struct('FetchPositionRewardsEvent', {
  data: bcs.vector(bcs.u64()),
  position_id: bcs.Address,
});

export const FetchPositionFeesEventRaw = bcs.struct('FetchPositionFeesEvent', {
  position_id: bcs.Address,
  fee_owned_a: bcs.u64(),
  fee_owned_b: bcs.u64(),
});

export const PoolSimpleInfoRaw = bcs.struct('PoolSimpleInfo', {
  pool_id: bcs.Address,
  pool_key: bcs.Address,
  coin_type_a: TypeNameRaw,
  coin_type_b: TypeNameRaw,
  tick_spacing: bcs.u32(),
});

export const NodeIDPoolSimpleInfo = bcs.struct('Node<ID, PoolSimpleInfo>', {
  prev: bcs.option(ID),
  next: bcs.option(ID),
  value: PoolSimpleInfoRaw,
});

export const CalculatedSwapResultEventRaw = bcs.struct('CalculatedSwapResultEventData', {
  data: bcs.struct('FetchPositionFeesEvent', {
    amount_in: bcs.u64(),
    amount_out: bcs.u64(),
    fee_amount: bcs.u64(),
    fee_rate: bcs.u64(),
    after_sqrt_price: bcs.u128(),
    is_exceed: bcs.bool(),
  })
});




export const GetPositionsVestingEventRaw = bcs.struct('GetPositionsVestingEventData', {
  data: bcs.vector(bcs.struct('PositionVesting', {
    position_id: bcs.Address,
    cetus_amount: bcs.u64(),
    redeemed_amount: bcs.u64(),
    coin_a: TypeNameRaw,
    coin_b: TypeNameRaw,
    impaired_a: bcs.u64(),
    impaired_b: bcs.u64(),
    period_details: bcs.vector(bcs.struct('PeriodDetail', {
      period: bcs.u64(),
      cetus_amount: bcs.u64(),
      is_redeemed: bcs.bool(),
    })),
    is_paused: bcs.bool(),
  }))
});

