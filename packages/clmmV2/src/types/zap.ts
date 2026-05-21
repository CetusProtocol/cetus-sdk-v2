import { TransactionObjectArgument } from '@mysten/sui/transactions'

export const defaultSwapSlippage = 0.005

/**
 * Result of a swap operation containing amounts and price information
 */
export type SwapResult = {
  swap_in_amount: string // Amount of tokens being swapped in
  swap_out_amount: string // Amount of tokens being swapped out
  route_obj?: any // Optional routing information for the swap
  after_sqrt_price: string // Square root price after the swap
  swap_price: string // Price at which the swap occurred
}

/**
 * Different modes for depositing liquidity into a pool
 */
export type DepositMode =
  | 'FixedOneSide' // Mode 1: Fix one side, calculate the other side
  | 'OnlyCoinA' // Mode 3: Only input Coin A for deposit
  | 'OnlyCoinB' // Mode 4: Only input Coin B for deposit

/**
 * Options for depositing with a fixed amount on one side
 */
export type FixedOneSideOptions = {
  mode: 'FixedOneSide'
  fixed_amount: string // Amount to deposit on the fixed side
  fixed_coin_a: boolean // Whether Coin A is the fixed side
}

/**
 * Options for depositing with flexible amounts on both sides
 */
export type FlexibleBothOptions = {
  mode: 'FlexibleBoth'
  coin_amount_a: string // Amount of Coin A to deposit
  coin_amount_b: string // Amount of Coin B to deposit
  coin_type_a: string // Type of Coin A
  coin_type_b: string // Type of Coin B
  coin_decimal_a: number // Decimal places for Coin A
  coin_decimal_b: number // Decimal places for Coin B
  max_remain_rate?: number // Maximum remaining rate after deposit
}

/**
 * Options for depositing only Coin A
 */
export type OnlyCoinAOptions = {
  mode: 'OnlyCoinA'
  coin_amount: string // Amount of Coin A to deposit
  coin_type_a: string // Type of Coin A
  coin_type_b: string // Type of Coin B
  coin_decimal_a: number // Decimal places for Coin A
  coin_decimal_b: number // Decimal places for Coin B
  max_remain_rate?: number // Maximum remaining rate after deposit
}

/**
 * Options for depositing only Coin B
 */
export type OnlyCoinBOptions = {
  mode: 'OnlyCoinB'
  coin_amount: string // Amount of Coin B to deposit
  coin_type_a: string // Type of Coin A
  coin_type_b: string // Type of Coin B
  coin_decimal_a: number // Decimal places for Coin A
  coin_decimal_b: number // Decimal places for Coin B
  max_remain_rate?: number // Maximum remaining rate after deposit
}

/**
 * Base options required for any deposit calculation
 */
export type BaseDepositOptions = {
  pool_id: string // Pool ID for the deposit calculation
  tick_lower: number // Lower tick index for the deposit
  tick_upper: number // Upper tick index for the deposit
  current_sqrt_price: string // Current sqrt price of the pool
  mark_price?: string // Mark price of the pool
  slippage: number // Slippage for the deposit
  swap_slippage?: number
}

/**
 * Result of a deposit calculation
 */
export type CalculationDepositResult = {
  liquidity: string // Amount of liquidity received
  amount_a: string // Amount of Coin A to deposit
  amount_b: string // Amount of Coin B to deposit
  amount_limit_a: string // Amount of Coin A to deposit with slippage
  amount_limit_b: string // Amount of Coin B to deposit with slippage
  original_input_amount_a: string // Original amount of Coin A to deposit
  original_input_amount_b: string // Original amount of Coin B to deposit
  mode: DepositMode // Deposit mode used for the calculation
  fixed_liquidity_coin_a: boolean // 添加流动性的固定方向
  swap_result?: SwapResult
  sub_deposit_result?: CalculationDepositResult
}

/**
 * Complete options for executing a deposit
 */
export type DepositOptions = {
  deposit_obj: CalculationDepositResult
  pool_id: string
  coin_type_a: string
  coin_type_b: string
  tick_lower: number
  tick_upper: number
  slippage: number
  swap_slippage?: number
  pos_obj?: {
    pos_id: string | TransactionObjectArgument
    collect_fee: boolean
    collect_rewarder_types: string[]
  }
}

/**
 * Options for calculating withdrawal amounts
 */
export type WithdrawCalculationOptions = {
  pool_id: string
  tick_lower: number
  tick_upper: number
  coin_decimal_a: number
  coin_decimal_b: number
  current_sqrt_price: string
  mode: DepositMode
  coin_type_a: string
  coin_type_b: string
  burn_liquidity?: string
} & (
    | { mode: 'FixedOneSide'; fixed_amount?: string; fixed_coin_a?: boolean }
    | { mode: 'FlexibleBoth'; receive_amount_a: string; receive_amount_b: string; available_liquidity: string; max_remain_rate?: number }
    | { mode: 'OnlyCoinA'; receive_amount_a?: string; available_liquidity: string; max_remain_rate?: number }
    | { mode: 'OnlyCoinB'; receive_amount_b?: string; available_liquidity: string; max_remain_rate?: number }
  )

/**
 * Result of a withdrawal calculation
 */
export type CalculationWithdrawResult = {
  burn_liquidity: string
  amount_a: string
  amount_b: string
  total_receive_amount?: string
  mode: DepositMode
  swap_result?: SwapResult
}

/**
 * Complete options for executing a withdrawal
 */
export type WithdrawOptions = {
  withdraw_obj: CalculationWithdrawResult
  pool_id: string
  pos_id: string
  close_pos: boolean
  collect_fee: boolean
  collect_rewarder_types: string[]
  coin_type_a: string
  coin_type_b: string
  tick_lower: number
  tick_upper: number
  slippage: number
  swap_slippage?: number
}
