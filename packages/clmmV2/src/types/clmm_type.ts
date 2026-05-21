import BN from 'bn.js'
import { CoinPairType, NFT, Percentage, SuiAddressType, SuiObjectIdType, TableHandle, TickUtil } from '@cetusprotocol/common-sdk'
import { TransactionObjectArgument } from '@mysten/sui/transactions'

export const poolLiquiditySnapshotType = 'position_liquidity_snapshot'

/**
 * Enumerates the possible status values of a position within a liquidity mining module.
 */
export enum ClmmPositionStatus {
  /**
   * The position has been deleted or removed.
   */
  'Deleted' = 'Deleted',
  /**
   * The position exists and is active.
   */
  'Exists' = 'Exists',
  /**
   * The position does not exist or is not active.
   */
  'NotExists' = 'NotExists',
}

/**
 *  The Cetus clmmpool's position NFT.
 */
export type Position = {
  pos_object_id: SuiObjectIdType
  /**
   * The owner of the position.
   */
  owner: SuiObjectIdType
  /**
   * The liquidity pool associated with the position.
   */
  pool: SuiObjectIdType
  /**
   * The type of position represented by an address.
   */
  type: SuiAddressType
  /**
   * The index of the position.
   */
  index: number
  /**
   * The amount of liquidity held by the position.
   */
  liquidity: string
  /**
   * The lower tick index of the position range.
   */
  tick_lower_index: number
  /**
   * The upper tick index of the position range.
   */
  tick_upper_index: number
  /**
   * The status of the position within the liquidity mining module.
   */
  position_status: ClmmPositionStatus

  /**
   * The address type of the first coin in the position.
   */
  coin_type_a: SuiAddressType
  /**
   * The address type of the second coin in the position.
   */
  coin_type_b: SuiAddressType
} & NFT &
  PositionInfo

/**
 * Represents reward information associated with a liquidity mining position.
 */
export type PositionInfo = {
  /**
   * The unique identifier of the position object.
   */
  pos_object_id: SuiObjectIdType

  /**
   * The amount of liquidity held by the position.
   */
  liquidity: string

  /**
   * The lower tick index of the position range.
   */
  tick_lower_index: number

  /**
   * The upper tick index of the position range.
   */
  tick_upper_index: number

  /**
   * The accumulated fee growth inside the first coin of the position.
   */
  fee_growth_inside_a: string

  /**
   * The accumulated fee owned in the first coin of the position.
   */
  fee_owned_a: string

  /**
   * The accumulated fee growth inside the second coin of the position.
   */
  fee_growth_inside_b: string

  /**
   * The accumulated fee owned in the second coin of the position.
   */
  fee_owned_b: string

  /**
   * The amount of reward owned in the first reward category.
   */
  reward_amount_owned_0: string

  /**
   * The amount of reward owned in the second reward category.
   */
  reward_amount_owned_1: string

  /**
   * The amount of reward owned in the third reward category.
   */
  reward_amount_owned_2: string

  /**
   * The accumulated reward growth inside the first reward category.
   */
  reward_growth_inside_0: string

  /**
   * The accumulated reward growth inside the second reward category.
   */
  reward_growth_inside_1: string

  /**
   * The accumulated reward growth inside the third reward category.
   */
  reward_growth_inside_2: string
}

/**
 * Represents immutable properties of a liquidity pool.
 */
export type PoolImmutables = {
  id: string
  tick_spacing: string
} & CoinPairType

export type Reward = {
  reward_coin: string
  reward_harvested: string
  reward_refunded: string
  reward_released: string
  growth_global: string
  emissions_per_second: string
  emissions_per_day: string
  period_emission_rates: TableHandle
}
export type PoolRewardManager = {
  is_public: boolean
  vault: TableHandle
  rewards: Reward[]
  emergency_reward_pause: boolean
  last_updated_time: string
}

export type PoolPositionManager = {
  tick_spacing: string
  position_index: string
  min_tick_range: string
  position_handle: TableHandle
}


export enum FeeSchedulerMode {
  Linear = 0,
  Exponential = 1,
}


export type DynamicFeeConfig = {
  bin_step: string
  bin_step_u128: string
  filter_period: string
  decay_period: string
  reduction_factor: string
  variable_fee_control: string
  max_volatility_accumulator: string
}
export type DynamicFee = {
  volatility_accumulator: string
  volatility_reference: string
  sqrt_price_reference: string
  last_update_timestamp: string
  bin_step_config: DynamicFeeConfig
}

export type FeeScheduler = {
  cliff_fee_numerator: string,
  number_of_period: string,
  period_frequency: string,
  reduction_factor: string,
  fee_scheduler_mode: FeeSchedulerMode,
  base_fee: string,
}

export type PoolFeeManager = {
  fee_coin: FeeCoinType
  tick_spacing: string
  fee_scheduler?: FeeScheduler
  base_fee_rate: string
  protocol_fee_rate: string
  activation_time: string
  is_scheduler_over: boolean
  dynamic_fee?: DynamicFee
}

export type PoolPermission = {
  liquidity_open_time: string
  swap_open_time: string
  disable_add: boolean
  disable_remove: boolean
  disable_swap: boolean
  disable_flash_loan: boolean
  disable_collect_fee: boolean
  disable_add_reward: boolean
  disable_collect_reward: boolean
}

export type Pool = {
  pool_type: string
  coin_amount_a: number
  coin_amount_b: number
  current_sqrt_price: number
  current_tick_index: number
  fee_growth_global_b: number
  fee_growth_global_a: number
  fee_protocol_coin_a: number
  fee_protocol_coin_b: number
  liquidity: string
  ticks_handle: TableHandle
  reward_manager: PoolRewardManager
  position_manager: PoolPositionManager
  fee_manager: PoolFeeManager
  permissions: PoolPermission
  index: string
  url: string
  creator: string
} & PoolImmutables


export type ClmmV2Config = {
  global_config_id: string
  registry_id: string
  versioned_id: string
  admin_cap_id: string
  partners_id: string
}

export type FeeTier = {
  id: string
  tick_spacing: string
  fee_rate: string
  fee_tier: string
  allow_dynamic_fee: boolean
  protocol_fee_rate: string
}

export enum FeeCoinType {
  InputCoinType = 0, // Fees are charged in the input token type of the swap
  CoinTypeA = 1, // the coin type of the coin A
  CoinTypeB = 2, // the coin type of the coin B
}


export type CreatePoolOptions = {
  tick_spacing: number
  fee_rate: number
  has_dynamic_fee: boolean
  fee_coin_type: FeeCoinType
  min_tick_range: number
  initialize_price: string
  url: string
  swap_open_time?: string
  liquidity_open_time?: string
  fee_scheduler_mode?: FeeSchedulerMode
} & CoinPairType




export type DestroyCreatePoolReceiptOptions = {
  receipt: TransactionObjectArgument
  pool_id: TransactionObjectArgument
} & CoinPairType


export type FetchParams = {
  pool_id: SuiObjectIdType
} & CoinPairType


export type AddLiquidityFixCoinOptions = {
  amount_a: string
  amount_b: string
  fix_amount_a: boolean
  pool_id: TransactionObjectArgument | string
  position: {
    position_id: TransactionObjectArgument | string
    collect_fee: boolean
    rewarder_coin_types: string[]
  } | {
    tick_lower: string
    tick_upper: string
  }
} & CoinPairType




export type OpenPositionOptions = {
  tick_lower: string
  tick_upper: string
  pool_id: TransactionObjectArgument | string
} & CoinPairType


export type CalculateAddLiquidityResult = {
  coin_amount_a: string
  coin_amount_b: string
  coin_amount_limit_a: string
  coin_amount_limit_b: string
  liquidity: string
  tick_lower: number
  tick_upper: number
  fix_amount_a?: boolean
}


export type CalculateCreatePoolResult = {
  coin_amount_a: string
  coin_amount_b: string
  coin_amount_limit_a: string
  coin_amount_limit_b: string
  liquidity: string
  tick_lower: number
  tick_upper: number
  initialize_sqrt_price: string
  fix_amount_a: boolean
}


export type RemoveLiquidityOptions = {
  pool_id: string
  position_id: string
  /**
   * The change in liquidity amount to be removed.
   */
  delta_liquidity: string

  /**
   * The minimum amount of the first coin to be received.
   */
  min_amount_a: string

  /**
   * The minimum amount of the second coin to be received.
   */
  min_amount_b: string

  /**
   * Indicates whether to collect fees during the removal.
   */
  collect_fee: boolean

  /**
   * Coin types associated with rewarder contracts.
   */
  rewarder_coin_types: string[]

  /**
   * Indicates whether to return the coins.
   */
  is_return_coins?: boolean

  close_position?: boolean
} & CoinPairType


export type ClosePositionOptions = {
  pool_id: string
  position_id: string
} & CoinPairType
/**
 * Represents parameters for collecting fees.
 */
export type CollectFeeOptions = {
  pool_id: string
  position_id: string
  recalculate: boolean
} & CoinPairType




export type AddRewardOption = {
  pool_id: string
  reward_coin_type: string
  reward_amount: string
  // Optional start time in seconds for the reward
  start_time_seconds?: number
  // Mandatory end time in seconds for the reward
  end_time_seconds: number
} & CoinPairType

export type CollectRewarderOptions = {
  pool_id: string
  position_id: string
  recalculate: boolean
  rewarder_coin_types: string[]
} & CoinPairType


export type InitRewardOption = {
  pool_id: string
  reward_coin_types: string[]
} & CoinPairType

export type RewardAccessOption = {
  pool_id: string
  type: 'to_public' | 'to_private'
} & CoinPairType


/**
 * Represents the amount owned by a rewarder.
 */
export type RewarderAmountOwned = {
  amount_owned: string
  reward_type: string
}

export type PositionTransactionInfo = {
  index: string
  tx_digest: string
  package_id: string
  transaction_module: string
  sender: string
  type: string
  timestamp_ms: string
  parsed_json: any
}

export type PoolTransactionInfo = {
  index: string
  tx: string
  sender: string
  type: string
  block_time: string
  parsed_json: any
}

export const poolFilterEvenTypes = [
  'RemoveLiquidityEvent',
  'SwapEvent',
  'AddLiquidityEvent',
  'AddLiquidityV2Event',
  'RemoveLiquidityV2Event',
]

/**
 * @category CollectFeesQuote
 */
export type CollectFeesQuote = {
  pool_id: string
  position_id: string
  fee_owned_a: string
  fee_owned_b: string
}


export type PosRewarderResult = {
  pool_id: string
  position_id: string
  rewarder_amounts: RewarderAmountOwned[]
}


export type PreSwapQuoteOptions = {
  pool_id: string
  a2b: boolean
  by_amount_in: boolean
  amount: string
} & CoinPairType

export type SwapOption = {
  pool_id: string
  slippage: number
  amount_in: string
  amount_out: string
  by_amount_in: boolean
  a2b: boolean
  swap_partner?: string
} & CoinPairType

export type RewardWhiteListOption = {
  reward_coin_types: string[]
  type: 'add' | 'remove'
}


export type GlobalRewardConfig = {
  manager_reserved_reward_init_slots: string
  min_reward_duration: string
  reward_public: boolean
  reward_whitelist: string[]
}

export type ClmmGlobalConfig = {
  id: string
  fee_tiers_handle: TableHandle
  dynamic_fees_handle: TableHandle
  fee_schedulers: FeeScheduler[]
  acl_handle: TableHandle
  allowed_list_handle: TableHandle
  denied_list_handle: TableHandle
  before_version: string
  blocked_position_handle: TableHandle
  blocked_user_handle: TableHandle
  manager_reserved_reward_init_slots: string
  min_reward_duration: string
  reward_public: boolean
  reward_whitelist: string[]
}


export type StepResult = {
  current_sqrt_price: string
  target_sqrt_price: string
  current_liquidity: string
  amount_in: string
  amount_out: string
  fee_amount: string
  base_fee_rate: string
  var_fee_rate: string
}

export type PreSwapQuote = {
  from: string
  target: string
  pool_id: string
  partner: string
  amount_in: string
  amount_out: string
  ref_fee_amount: string
  protocol_fee_amount: string
  fee_amount: string
  vault_a_amount: string
  vault_b_amount: string
  before_sqrt_price: string
  after_sqrt_price: string
  fee_coin: string
  steps: StepResult[]
}

export type TickData = {
  /**
   * The object identifier of the tick data.
   */
  object_id: string

  /**
   * The index of the tick.
   */
  index: number

  /**
   * The square root price value for the tick.
   */
  sqrt_price: BN

  /**
   * The net liquidity value for the tick.
   */
  liquidity_net: BN

  /**
   * The gross liquidity value for the tick.
   */
  liquidity_gross: BN

  /**
   * The fee growth outside coin A for the tick.
   */
  fee_growth_outside_a: BN

  /**
   * The fee growth outside coin B for the tick.
   */
  fee_growth_outside_b: BN

  /**
   * An array of rewarders' growth outside values for the tick.
   */
  rewarders_growth_outside: BN[]
}


export type GetPositionInfoListParams = {
  position_handle: string
  position_ids: string[]
}

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

