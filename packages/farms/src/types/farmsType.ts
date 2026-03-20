import type { CoinPairType, SuiAddressType } from '@cetusprotocol/common-sdk'
import type { TransactionArgument, TransactionObjectArgument } from '@mysten/sui/transactions'

export type FarmsConfigs = {
  global_config_id: string
  rewarder_manager_id: string
  rewarder_manager_handle: string
  admin_cap_id?: string
}

/**
 * The farms position NFT.
 */
export type FarmsPositionNFT = {
  id: string
  pool_id: string
  url: string
  description: string
  name: string
  liquidity: string
  clmm_position_id: string
  clmm_pool_id: string
  tick_lower_index: number
  tick_upper_index: number
  index: number
  rewards: PositionRewardInfo[]
} & CoinPairType

/**
 * The staked CLMM position reward info.
 */
export type PositionRewardInfo = {
  rewarder_type: string
  rewarder_amount: string
}

/**
 *  The stable farming pool for stake CLMM position and get reward.
 */
export type FarmsPool = {
  id: string
  clmm_pool_id: string
  effective_tick_lower: number
  effective_tick_upper: number
  // The sqrt price(Q64X64) of CoinA
  sqrt_price: string
  total_share: string
  rewarders: RewarderConfig[]
  positions: {
    positions_handle: string
    size: number
  }
}

export type RewarderConfig = {
  reward_coin: string
  last_reward_time: string
  emission_per_second: string
  total_allocate_point: string
  allocate_point: string
}

export type HarvestParams = {
  pool_id: string
  position_nft_id: string
}

export type HarvestFeeAndClmmRewarderParams = {
  pool_id: string
  position_nft_id: string
  clmm_pool_id: string
  collect_fee: boolean
  collect_farms_rewarder: boolean
  clmm_rewarder_types: SuiAddressType[]
} & CoinPairType

export type ClaimFeeAndClmmRewardParams = {
  clmm_pool_id: string
  position_nft_id: string
  collect_fee: boolean
  clmm_rewarder_types: SuiAddressType[]
} & CoinPairType

export type FarmsDepositParams = {
  pool_id: string
  clmm_position_id: string | TransactionObjectArgument
  clmm_pool_id: string
} & CoinPairType

export type FarmsWithdrawParams = {
  pool_id: string
  position_nft_id: string
}

export type AddLiquidityParams = {
  pool_id: string
  clmm_pool_id: string
  position_nft_id: string
  amount_limit_a: string
  amount_limit_b: string
  delta_liquidity: string
  collect_fee: boolean
  collect_rewarder: boolean
  clmm_rewarder_types: string[]
} & CoinPairType

export type OpenPositionAddLiquidityStakeParams = {
  pool_id: string
  clmm_pool_id: string
  tick_lower: number
  tick_upper: number
  amount_a: string
  amount_b: string
  fix_amount_a: boolean
} & CoinPairType

export type AddLiquidityFixCoinParams = {
  pool_id: string
  clmm_pool_id: string
  position_nft_id: string
  amount_a: string | number
  amount_b: string | number
  collect_fee: boolean
  collect_rewarder: boolean
  fix_amount_a: boolean
  clmm_rewarder_types: string[]
} & CoinPairType

export type RemoveLiquidityParams = {
  pool_id: string
  clmm_pool_id: string
  position_nft_id: string
  min_amount_a: string
  min_amount_b: string
  delta_liquidity: string
  collect_rewarder: boolean
  // Unstaking can be done when removing all liquidity
  unstake: boolean
  // If the position is closed, unstaking will not take effect
  close_position: boolean
  // if close_position, clmm_position_id must be provided
  clmm_position_id?: string
  clmm_rewarder_types: string[]
} & CoinPairType

export type CollectFeeParams = {
  clmm_pool_id: string
  position_nft_id: string
  // coin_a?: TransactionArgument
  // coin_b?: TransactionArgument
} & CoinPairType

export type CollectClmmRewardParams = {
  clmm_pool_id: string
  position_nft_id: string
  reward_coins?: TransactionObjectArgument[]
  clmm_rewarder_types: SuiAddressType[]
} & CoinPairType
