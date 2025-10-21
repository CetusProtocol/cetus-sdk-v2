import type { CoinPairType, TableHandle } from '@cetusprotocol/common-sdk'
import { TransactionObjectArgument } from '@mysten/sui/transactions'
import Decimal from 'decimal.js'
export type DlmmConfigs = {
  registry_id: string
  pools_id: string
  partners_id: string
  global_config_id: string
  versioned_id: string
  admin_cap_id: string
}

export type BinStepConfig = {
  bin_step: number
  base_factor: number
  filter_period: number
  decay_period: number
  reduction_factor: number
  variable_fee_control: string
  max_volatility_accumulator: string
  protocol_fee_rate: string
}

export type BinManager = {
  bin_step: number
  bin_manager_handle: string
  size: string
}

export type VariableParameters = {
  volatility_accumulator: string
  volatility_reference: string
  index_reference: number
  last_update_timestamp: string
  bin_step_config: BinStepConfig
}

export type Reward = {
  reward_coin: string
  emissions_per_second: string
  emissions_per_day: string
  period_emission_rates: TableHandle
}
export type RewardManager = {
  is_public: boolean
  vault: TableHandle
  rewards: Reward[]
  emergency_reward_pause: boolean
  last_updated_time: string
}

export type PositionManager = {
  bin_step: number
  position_index: number
  position_handle: string
  size: number
}

export type DlmmBasePool = {
  id: string
  bin_step: number
} & CoinPairType

export type PoolPermissions = {
  disable_add: boolean
  disable_remove: boolean
  disable_swap: boolean
  disable_collect_fee: boolean
  disable_collect_reward: boolean
  disable_add_reward: boolean
}

export type DlmmPool = {
  pool_type: string
  index: number
  bin_manager: BinManager
  variable_parameters: VariableParameters
  active_id: number
  permissions: PoolPermissions
  balance_a: string
  balance_b: string
  base_fee_rate: string
  protocol_fee_a: string
  protocol_fee_b: string
  url: string
  reward_manager: RewardManager
  position_manager: PositionManager
} & DlmmBasePool

export type DlmmPosition = {
  id: string
  pool_id: string
  index: number
  description: string
  uri: string
  liquidity_shares: string[]
  lower_bin_id: number
  upper_bin_id: number
  name: string
} & CoinPairType

export type BinWeight = {
  bin_id: number
  weight: number
}

export type BinAmount = {
  bin_id: number
  amount_a: string
  amount_b: string
  liquidity?: string
  price_per_lamport: string
}

export type BinLiquidityInfo = {
  bins: BinAmount[]
  amount_a: string
  amount_b: string
}

export enum StrategyType {
  Spot,
  Curve,
  BidAsk,
}

export type ClosePositionOption = {
  pool_id: string
  position_id: string
  reward_coins: string[]
} & CoinPairType

export type BaseCreatePoolOption = {
  bin_step: number
  base_factor: number
  url?: string
} & CoinPairType

export type BaseCreatePoolAndAddOption = {
  bin_infos: BinLiquidityInfo
  strategy_type: StrategyType
  use_bin_infos?: boolean
} & BaseCreatePoolOption

export type CreatePoolAndAddOption = {
  active_id: number
  lower_bin_id: number
  upper_bin_id: number
} & BaseCreatePoolAndAddOption

export type CreatePoolOption = {
  active_id: number
} & BaseCreatePoolOption

export type CreatePoolAndAddWithPriceOption = {
  pool_id: string
  price_base_coin: 'coin_a' | 'coin_b'
  price: string
  lower_price: string
  upper_price: string
  strategy_type: StrategyType
  decimals_a: number
  decimals_b: number
} & BaseCreatePoolAndAddOption

export type BaseAddLiquidityOption = {
  pool_id: string | TransactionObjectArgument
  bin_infos: BinLiquidityInfo
  strategy_type: StrategyType
  max_price_slippage: number
  active_id: number
  bin_step: number
  /**
   * Controls whether to use pre-calculated bin_infos or let the contract calculate based on strategy_type.
   * - true: Use bin_infos to add liquidity to each bin
   * - false: Pass strategy_type to contract for automatic liquidity distribution calculation
   */
  use_bin_infos?: boolean
} & CoinPairType

export type BaseCalculateAddLiquidityOption = {
  pool_id?: string
  active_id: number
  bin_step: number
  lower_bin_id: number
  upper_bin_id: number
  active_bin_of_pool?: BinAmount
  strategy_type: StrategyType
}

export type CalculateAddLiquidityOption = {
  amount_a: string
  amount_b: string
} & BaseCalculateAddLiquidityOption

export type CalculateAddLiquidityAutoFillOption = {
  coin_amount: string
  fix_amount_a: boolean
} & BaseCalculateAddLiquidityOption

export type AddLiquidityOption = BaseAddLiquidityOption & {
  position_id: string
  collect_fee: boolean
  reward_coins: string[]
}

export type OpenAndAddLiquidityOption = BaseAddLiquidityOption & {
  lower_bin_id: number
  upper_bin_id: number
}

export type OpenAndAddLiquidityWithPriceOption = BaseAddLiquidityOption & {
  price_base_coin: 'coin_a' | 'coin_b'
  price: string
  lower_price: string
  upper_price: string
  active_bin_of_pool?: BinAmount
  strategy_type: StrategyType
  decimals_a: number
  decimals_b: number
  max_price_slippage: number
}

export type OpenPositionOption = {
  pool_id: string
  lower_bin_id: number
  upper_bin_id: number
} & CoinPairType

export type CalculateRemoveLiquidityBothOption = {
  bins: BinAmount[]
  active_id: number
  fix_amount_a: boolean
  coin_amount: string
}

export type CalculateRemoveLiquidityOnlyOption = {
  bins: BinAmount[]
  active_id: number
  is_only_a: boolean
  coin_amount: string
}

export type RemoveLiquidityOption = {
  pool_id: string
  position_id: string
  active_id: number
  bin_step: number
  bin_infos: BinLiquidityInfo
  slippage: number
  reward_coins: string[]
  collect_fee: boolean
  remove_percent?: number
} & CoinPairType

export type CollectRewardOption = {
  pool_id: string
  position_id: string
  reward_coins: string[]
} & CoinPairType

export type CollectFeeOption = {
  pool_id: string
  position_id: string
} & CoinPairType

export type CollectRewardAndFeeOption = {
  pool_id: string
  position_id: string
  reward_coins: string[]
} & CoinPairType

export type BinSwap = {
  bin_id: number
  in_amount: string
  out_amount: string
  fee: string
  var_fee_rate: string
}

export type PreSwapQuote = {
  pool_id: string
  a2b: boolean
  in_amount: string
  out_amount: string
  ref_fee_amount: string
  fee_amount: string
  partner: string
  from_coin_type: string
  to_coin_type: string
  bin_swaps: BinSwap[]
}

export type PreSwapOption = {
  pool_id: string
  a2b: boolean
  by_amount_in: boolean
  in_amount: string
} & CoinPairType

export type SwapOption = {
  quote_obj: PreSwapQuote
  by_amount_in: boolean
  partner?: string
  slippage: number
} & CoinPairType

export type PositionFee = {
  position_id: string
  fee_owned_a: string
  fee_owned_b: string
}

export type RewardInfo = {
  coin_type: string
  reward_owned: string
}

export type PositionReward = {
  position_id: string
  rewards: RewardInfo[]
}

export type CreatePartnerOption = {
  name: string
  ref_fee_rate: number
  start_time: number
  end_time: number
  recipient: string
}

export type UpdateRefFeeRateOption = {
  partner_id: string
  ref_fee_rate: number
}

export type UpdateTimeRangeOption = {
  partner_id: string
  start_time: number
  end_time: number
}

export type ClaimRefFeeOption = {
  partner_id: string
  partner_cap_id?: string
  fee_coin_types: string[]
}

export type Partner = {
  id: string
  name: string
  ref_fee_rate: number
  start_time: number
  end_time: number
  balances: TableHandle
  type: string
}

export type PoolTransactionInfo = {
  index: string
  tx: string
  sender: string
  type: string
  block_time: string
  parsed_json: any
}

export type AddRewardOption = {
  pool_id: string
  reward_coin_type: string
  reward_amount: string
  // Optional start time in seconds for the reward
  start_time_seconds?: number
  // Mandatory end time in seconds for the reward
  end_time_seconds: number
} & CoinPairType

export type InitRewardOption = {
  pool_id: string
  reward_coin_types: string[]
} & CoinPairType

export type RewardWhiteListOption = {
  reward_coin_types: string[]
  type: 'add' | 'remove'
}

export type RewardAccessOption = {
  pool_id: string
  type: 'to_public' | 'to_private'
} & CoinPairType

export type ValidateActiveIdSlippageOption = {
  pool_id: string | TransactionObjectArgument
  active_id: number
  bin_step: number
  max_price_slippage: number
} & CoinPairType

export type DlmmGlobalConfig = {
  id: string
  acl: TableHandle
  allowed_list: TableHandle
  denied_list: TableHandle
  bin_steps: TableHandle
  reward_white_list: string[]
  blocked_position: TableHandle
  blocked_user: TableHandle
  min_reward_duration: number
  non_manager_initialize_reward_cap: number
  reward_public: boolean
}

export type UpdatePositionFeeAndRewardsOption = {
  pool_id: string
  position_id: string
} & CoinPairType

export type RewardPeriodEmission = {
  emissions_per_second: string
  emissions_per_day: string
  emissions_per: string
  time: string
  visualized_time: string
}

export type RewardPeriodEmissionFormat = {
  emissions_per_second: string
  emissions_per_day: string
  time: string
  visualized_time: string
}

export type GetPoolBinInfoOption = {
  pool_id: string
} & CoinPairType

export type GetTotalFeeRateOption = {
  pool_id: string
} & CoinPairType

export type FeeRate = {
  base_fee_rate: string
  var_fee_rate: string
  total_fee_rate: string
}

export type WeightsOptions = {
  strategy_type: StrategyType
  active_id: number
  bin_step: number
  lower_bin_id: number
  upper_bin_id: number
  total_amount_a: string
  total_amount_b: string
  active_bin_of_pool?: BinAmount
}

export type WeightsInfo = {
  total_weight_a: Decimal
  total_weight_b: Decimal
  weights: Decimal[]
  weight_per_prices: Decimal[]
  active_weight_a: Decimal
  active_weight_b: Decimal
} & WeightsOptions

export type GetBinInfoOption = {
  bin_manager_handle: string
  bin_id: number
  bin_step: number
}

export type GetBinInfoResult = {
  bin_manager_handle: string
  bin_id: number
  bin_step: number
} & BinAmount
