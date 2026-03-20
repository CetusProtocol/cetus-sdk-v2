import { Transaction, TransactionObjectArgument, TransactionResult } from '@mysten/sui/transactions'
import { ParsedObligation } from '@suilend/sdk'
import { Obligation } from '@suilend/sdk/_generated/suilend/obligation/structs'

export type Position = {
  position_id: string
  position_cap_id: string
  created_at: string
  init_deposit_amount: string
  is_long: boolean
  lending_market_id: string
  obligation_owner_cap: string
  market_id: string
  deposits: any[]
  borrows: any[]
  original: ParsedObligation
  origin_obligation: Obligation<string>
  claimable_rewards: any[]
}

export interface OpenPositionParams {
  market_id: string
  is_long: boolean
  is_quote: boolean
  amount: string
  leverage: number
  slippage: number
  swap_clmm_pool?: string
}

export interface BorrowSuiParams {
  tx: Transaction
  lending_market_id: string
  position?: any
  position_id?: string
  reserve_array_index: string
  borrow_amount: string
}

export interface BorrowNotSuiParams {
  tx: Transaction
  lending_market_id: string
  position?: any
  position_id?: string
  reserve_array_index: string
  borrow_amount: string
  base_token: string
  quote_token: string
  is_long: boolean
}

export type PositionDepositParams = {
  market_id: string
  is_long: boolean
  position_cap_id?: string
  position_cap?: any
  deposit_reserve_array_index: string
  input_coin: any
  txb?: Transaction
  base_token: string
  quote_token: string
}

export type PositionManageSizeDepositParams = {
  position_id: string
  is_quote: boolean
  amount: string
  slippage: number
  swap_clmm_pool?: string
  leverage: number
  txb?: Transaction
}

export type PositionManageSizeWithdrawParams = {
  position_id: string
  amount: string
  is_quote: boolean
  swap_clmm_pool?: string
  slippage: number
  leverage: number
  txb?: Transaction
  withdraw_max?: boolean
}

export type WithdrawParams = {
  market_id: string
  position_id: string
  withdraw_amount: string
  withdraw_reserve_array_index: string
  withdraw_coin_type: string
  base_token: string
  quote_token: string
  price_object_id: string
  txb?: Transaction
}

export type RepayParams = {
  txb?: Transaction
  position_cap_id: string
  repay_amount: string
  repay_coin_type: string
  repay_coin?: any
  repay_reserve_array_index: string
  market_id: string
}

export type CreateLeveragePositionParams = {
  leverage: number
  market_id: string
  base_token: string
  quote_token: string
  is_long: boolean
  init_deposit_amount: string
  init_coin_type: string
  tx: Transaction
}

export type BorrowAssetParams = {
  position_cap_id?: string
  position_cap?: any
  reserve_array_index: string
  borrow_amount: string
  base_token: string
  quote_token: string
  is_long: boolean
  lending_market_id: string
  market_id: string
}

export type WithdrawAssetParams = {
  market_id: string
  position_cap_id: string
  withdraw_amount: string
  withdraw_reserve_array_index: string
  withdraw_coin_type: string
}

export type PositionCloseParams = {
  market_id: string
  position_cap_id: string
}

export type CalculatePositionDepositParams = {
  market_id: string
  is_long: boolean
  is_quote: boolean
  amount: string
  leverage: number
  swap_clmm_pool?: string
  slippage: number
  by_amount_in?: boolean
  base_token: string
  quote_token: string
  is_submit?: boolean
  is_open?: boolean
  position_id?: string
}

export type CalculatePositionWithdrawParams = {
  position_id: string
  is_quote: boolean
  swap_clmm_pool?: string
  leverage: number
  amount: string
  slippage: number
  withdraw_max?: boolean
  tx?: Transaction
}

export type CalculateCompoundDebtParams = {
  market_id: string
  position_cap_id: string
  borrow_reserve_array_index: string
  borrow_index: string
}

export type PositionManageLeverageParams = {
  position_id: string
  swap_clmm_pool?: string
  current_leverage: number
  target_leverage: number
  slippage: number
}

export type PositionRepayParams = {
  position_id: string
  amount: string
  is_quote: boolean
  slippage: number
}

export type positionTopUpCTokenParams = {
  position_id: string
  amount: string
  is_quote: boolean
  swap_clmm_pool?: string
  slippage: number
}

export type positionWithdrawCTokenParams = {
  position_id: string
  amount: string
  is_quote: boolean
  swap_clmm_pool?: string
  slippage: number
}

export type CalculatePositionLeverageParams = {
  position_id: string
  current_leverage: number
  target_leverage: number
  swap_clmm_pool?: string
  slippage: number
}

export type PositionCloseWithCoinParams = {
  position_id: string
  is_quote: boolean
  leverage: number
  slippage: number
  swap_clmm_pool?: string
}

export type CreateMarginTradingContextParams = {
  market_id: string
  position_cap_id: string
  action: string
  coin_type: string
  amount: string
}

export type CalculatePositionRepayParams = {
  position_id: string
  amount: string
  is_quote: boolean
}
