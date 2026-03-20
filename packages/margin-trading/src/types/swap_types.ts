import { Transaction, TransactionResult } from "@mysten/sui/transactions"

export type CalculateFlashLoanParams = {
  is_long: boolean
  leverage: number
  base_token: string
  quote_token: string
  deposit_amount: string
  reserve: any[]
  base_token_decimal: number
  quote_token_decimal: number
}

export interface FlashLoanParams {
  amount: string
  amount_u64?: TransactionResult
  clmm_pool: string
  clmm_pool_coin_type_a: string
  clmm_pool_coin_type_b: string
  flash_loan_coin: string
  tx: Transaction
}

export interface RepayFlashSwapParams {
  clmm_pool: string
  tx: Transaction
  repay_base: any
  repay_quote: any
  clmm_pool_coin_type_a: string
  clmm_pool_coin_type_b: string
  receipt: any
}

export type RouterSwapParams = {
  slippage: number
  input_coin: any
  router: any
  txb?: Transaction
}