import {RemoveLiquidityParams} from '@cetusprotocol/sui-clmm-sdk'
import {CoinPairType, SuiObjectIdType, SuiAddressType} from '@cetusprotocol/common-sdk'
import {Transaction } from '@mysten/sui/transactions'

/**
 * Common parameters shared across multiple compound operations
 */
type CommonParams = {
  /**
   * The object id about which pool you want to operation.
   */
  pool_id: SuiObjectIdType
  /**
   * The object id about position.
   */
  pos_id: SuiObjectIdType
}

/**
 * Parameters for closing position and returning amount coins with merge swap functionality
 */
export type ClosePosReturnAmountCoinAParams = CommonParams & CoinPairType & {
  /**
     * The change in liquidity amount to be removed.
     */
  delta_liquidity: string;
  /**
   * The minimum amount of the first coin to be received.
   */
  min_amount_a: string;
  /**
   * The minimum amount of the second coin to be received.
   */
  min_amount_b: string;
  /**
    * Coin types associated with rewarder contracts.
    */
  rewarder_coin_types: SuiAddressType[]
  /**
   * Optional farms pool ID
   */
  farms_pool_id?: string

  /**
   * Damaged positions cannot be closed.
   */
  not_close?: boolean
}

/**
 * Parameters for closing position and returning only amount coins without merge swap
 */
export type ClosePosOnlyReturnAmountCoinsParams = CommonParams & CoinPairType  & {
  /**
     * The minimum amount of the first coin to be received.
     */
  min_amount_a: string;
  /**
   * The minimum amount of the second coin to be received.
   */
  min_amount_b: string;
  rewarder_coin_types: string[]
  delta_liquidity: string
  /**
     * Optional farms pool ID
     */
  farms_pool_id?: string
  /**
   * Damaged positions cannot be closed.
   */
  not_close?: boolean
}

/**
 * Parameters for collecting fees and rewards and returning coins
 */
export type CollectFeeAndRewardsAndReturnCoinsParams = CommonParams & CoinPairType  & {
  /**
   * Coin types associated with rewarder contracts
   */
  rewarder_coin_types: SuiAddressType[]
}

/**
 * Parameters for calculating claim merge swap routes
 */
export type CalculateClaimMergeParams = CoinPairType & {
  /**
   * The object id about which pool you want to operation
   */
  pool_id: string
  /**
   * The object id about position
   */
  position_id: string
  /**
   * Array of rewarder coin types
   */
  rewarder_types: string[]
  /**
   * Target coin type for merge swap
   */
  target_coin_type: string
  not_merge_coins: string[]
  farms_pool_id?: string
}

/**
 * Parameters for creating claim merge swap payload
 */
export type CreateClaimMergePayloadParams = CoinPairType & {
  /**
   * The object id about which pool you want to operation
   */
  pool_id: string
  /**
   * The object id about position
   */
  pos_id: string
  /**
   * Array of rewarder coin types
   */
  rewarder_coin_types: string[]
  /**
   * Coins to exclude from merge swap
   */
  not_merge_coins: string[]
  /**
   * Router configuration for merge swap
   */
  merge_routers: any
  /**
   * Slippage tolerance for the swap
   */
  slippage: number
  /**
   * Target coin type for merge swap
   */
  target_coin_type: string
  farms_pool_id?: string
}

/**
 * Parameters for calculating optimal rebalancing
 */
export type CalculateRebalanceParams = {
  /**
   * The object id about which pool you want to operation
   */
  pool_id: string
  /**
   * Coin type for the first token in the pair
   */
  coin_type_a: string
  /**
   * Coin type for the second token in the pair
   */
  coin_type_b: string
  /**
   * Decimal precision for the first coin
   */
  coin_decimal_a: number
  /**
   * Decimal precision for the second coin
   */
  coin_decimal_b: number
  
  /**
   * Current amount of the first coin
   */
  amount_a: string
  /**
   * Current amount of the second coin
   */
  amount_b: string
  /**
   * Lower tick boundary for the price range
   */
  tick_lower: number
  /**
   * Upper tick boundary for the price range
   */
  tick_upper: number
  /**
   * Current square root price
   */
  current_sqrt_price: string
  /**
   * Slippage tolerance for swaps
   */
  slippage: number
  /**
   * Maximum remaining rate threshold (optional, default: 0.01)
   */
  max_remain_rate?: number
  /**
   * Mark price for calculation (optional)
   */
  mark_price?: string
  /**
   * Loop counter for price verification (optional, default: 0)
   */
  verify_price_loop?: number

  old_pos_origin_amount_a?: string
  old_pos_origin_amount_b?: string
}
    

/**
 * Result of rebalancing calculation with optimal allocation
 */
export type RebalanceResult = {
  /**
   * Calculated liquidity amount
   */
  liquidity: string
  /**
   * Lower tick boundary for the price range
   */
  tick_lower: number
  /**
   * Upper tick boundary for the price range
   */
  tick_upper: number
  /**
   * Amount of the first coin to use
   */
  use_amount_a: string
  /**
   * Amount of the second coin to use
   */
  use_amount_b: string
  /**
   * Whether the first coin amount is fixed
   */
  fix_amount_a: boolean
  /**
   * Remaining amount after optimal allocation
   */
  remain_amount: string
  /**
   * Swap result if rebalancing requires swapping (optional)
   */
  swap_result?: any
  /**
   * Error message if rebalancing fails (optional)
   */
  error?: string
  swap_amount_in?: string
  swap_in_coin_type?: string
}

/**
 * Parameters for creating move position payload to migrate from old range to new range
 */
export type CreateMovePositionPayloadParams = {
  /**
   * Old position details
   */
  oldPos: {
    /**
     * The object id about which pool you want to operation
     */
    pool_id: string
    /**
     * The object id about position
     */
    pos_id: string
    /**
     * Coin type for the first token in the pair
     */
    coin_type_a: SuiAddressType
    /**
     * Coin type for the second token in the pair
     */
    coin_type_b: SuiAddressType
    /**
     * Coin types associated with rewarder contracts
     */
    rewarder_coin_types: SuiAddressType[]
    /**
     * Optional farms pool ID
     */
    farms_pool_id?: string
    clmm_pos_id?: string
    /**
     * Current liquidity amount
     */
    liquidity: string
    /**
     * Minimum amount of the first coin to be received
     */
    min_amount_a: string
    /**
     * Minimum amount of the second coin to be received
     */
    min_amount_b: string
    /**
     * Damaged positions cannot be closed.
     */
    not_close?: boolean    
  },
  /**
   * New position details
   */
  newPos: {
    /**
     * Lower tick boundary for the new price range
     */
    tick_lower: number
    /**
     * Upper tick boundary for the new price range
     */
    tick_upper: number
    farms_pool_id?: string
  },
  /**
   * Pre-calculated rebalancing result
   */
  rebalancePre: RebalanceResult, 
  /**
   * Slippage tolerance for swaps
   */
  slippage: number,
  /**
   * Optional merge swap configuration
   */
  rewarderMergeOption?: {
    /**
     * Router configuration for merge swap
     */
    merge_routers: any
    /**
     * Slippage tolerance for merge swap
     */
    slippage: number
    /**
     * Coins to exclude from merge swap
     */
    not_merge_coins: string[]
  }, 
  /**
   * Whether fees and rewards have already been claimed (optional)
   */
  have_claim?: boolean
}

/**
 * Parameters for pre-calculating swap operations
 */
export type PreSwapParams = {
  /**
   * The object id about which pool you want to operation
   */
  pool_id: string
  /**
   * Current square root price
   */
  current_sqrt_price: string
  /**
   * Source coin type for the swap
   */
  from_coin_type: string
  /**
   * Target coin type for the swap
   */
  target_coin_type: string
  /**
   * Amount to swap
   */
  amount: string
  /**
   * Decimal precision for the source coin
   */
  from_coin_decimal: number
  /**
   * Decimal precision for the target coin
   */
  target_coin_decimal: number
  /**
   * Whether swapping from coin A to coin B
   */
  is_a2b: boolean
  /**
   * Slippage tolerance for the swap
   */
  slippage: number
}

/**
 * Parameters for creating compound rebalance add payload
 */
export type CreateCompoundRebalanceAddPayload = {
  /**
   * Base parameters for the compound operation
   */
  baseParams: {
    /**
     * The object id about which pool you want to operation
     */
    pool_id: string
    /**
     * The object id about position
     */
    pos_id: string
    /**
     * Coin type for the first token in the pair
     */
    coin_type_a: SuiAddressType
    /**
     * Coin type for the second token in the pair
     */
    coin_type_b: SuiAddressType
    /**
     * Coin types associated with rewarder contracts
     */
    rewarder_coin_types: SuiAddressType[]
    /**
     * Optional farms pool ID
     */
    farms_pool_id?: string
  }, 
  /**
   * Pre-calculated rebalancing result
   */
  rebalancePre: RebalanceResult, 
  /**
   * Merge swap configuration for rewarders
   */
  rewarderMergeOption: {
    /**
     * Router configuration for merge swap
     */
    merge_routers: any
    /**
     * Slippage tolerance for merge swap
     */
    slippage: number
    /**
     * Coins to exclude from merge swap
     */
    not_merge_coins: string[]
  }, 
  /**
   * Optional transaction object (creates new one if not provided)
   */
  tx?: Transaction
}
