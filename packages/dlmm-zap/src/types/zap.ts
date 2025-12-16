import { TransactionObjectArgument } from '@mysten/sui/transactions'
import { BinAmount, BinLiquidityInfo, StrategyType } from '@cetusprotocol/dlmm-sdk'
import { CoinPairType } from 'packages/common/dist'

export const defaultSwapSlippage = 0.005

/**
 * Result of a swap operation containing amounts and price information
 */
export type SwapResult = {
  swap_in_amount: string // Amount of tokens being swapped in
  swap_out_amount: string // Amount of tokens being swapped out
  route_obj?: any // Optional routing information for the swap
}

export type BaseDepositOptions = {
  pool_id: string
  strategy_type: StrategyType
  active_bin_of_pool?: BinAmount
  lower_bin_id: number
  upper_bin_id: number
  active_id: number
  bin_step: number
}

export type OnlyCoinDepositOptions = {
  fix_amount_a: boolean
  coin_amount: string
}

/**
 * Result of a deposit calculation
 */
export type CalculationDepositResult = {
  bin_infos: BinLiquidityInfo
  swap_result?: SwapResult
  fix_amount_a: boolean
  coin_amount: string
}

/**
 * Complete options for executing a deposit
 */
export type DepositOptions = {
  deposit_obj: CalculationDepositResult
  slippage: number
  pool_id: string
  strategy_type: StrategyType
  lower_bin_id: number
  upper_bin_id: number
  active_id: number
  bin_step: number
  swap_slippage?: number
  pos_obj?: {
    pos_id: string | TransactionObjectArgument
    collect_fee: boolean
    collect_rewarder_types: string[]
  }
}

export type WithdrawMode = 'OnlyCoinA' | 'OnlyCoinB' | 'Both'
export type CalculationWithdrawOptions = {
  remove_bin_range: BinAmount[]
  active_id: number
  bin_step: number
  expected_receive_amount: string
  is_receive_coin_a: boolean
  mode: WithdrawMode
  coin_decimal_a: number
  coin_decimal_b: number
  prices?: {
    coin_a_price: string
    coin_b_price: string
  }
} & CoinPairType

export type CalculationWithdrawAvailableAmountOptions = {
  remove_bin_range: BinAmount[]
  active_id: number
  bin_step: number
  is_receive_coin_a: boolean
  mode: WithdrawMode
  coin_decimal_a: number
  coin_decimal_b: number
  prices?: {
    coin_a_price: string
    coin_b_price: string
  }
}

/**
 * Result of a withdrawal calculation
 */
export type CalculationWithdrawResult = {
  remove_liquidity_info: BinLiquidityInfo
  mode: WithdrawMode
  is_receive_coin_a?: boolean
  swap_result?: SwapResult
  expected_receive_amount: string
  remove_percent: string
}

/**
 * Complete options for executing a withdrawal
 */
export type WithdrawOptions = {
  withdraw_obj: CalculationWithdrawResult
  swap_slippage?: number
  pool_id: string
  position_id: string
  active_id: number
  bin_step: number
  slippage: number
  reward_coins: string[]
  collect_fee: boolean
  remove_percent?: number
  is_close_position: boolean
} & CoinPairType
