import { TableHandle } from '@cetusprotocol/common-sdk'
import type { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions'


export type TsplOrderCap = {
  id: string
  order_id: string
  position_id: string
}

export type TsplOrder = {
  created_ts: string
  entry_price: string
  id: string
  is_long: boolean
  market_id: string
  next_target_id: string
  order_book_id: string
  position_cap: string
  order_cap: string
  position_id: string
  settlements: TableHandle
  /**
   * /// Order status: normal state, can be triggered for execution.
const STATUS_ACTIVE: u8 = 0;
/// Order status: PositionCap is being used by a keeper PTB; concurrent execution blocked.
const STATUS_EXECUTING: u8 = 1;
/// Order status: full-close finalized, PositionCap consumed; only settlements remain.
const STATUS_COMPLETED: u8 = 2;
   */
  status: number
  updated_ts: string
  tp_targets: TsplTarget[]
  sl_targets: TsplTarget[]
}

export type TsplSettlementField = {
  name: any
  value: string
}



export type TsplTarget = {
  id?: string
  trigger_price: string
  /** Max acceptable slippage in basis points (u64), e.g. "50" = 50 bps */
  slippage_bps: string
  close_ratio_bps: string
  target_is_base: boolean
}



export type TsplAddTargetOptions = {
  order_book_id: string
  position_cap_id: string | TransactionObjectArgument
  tp_target?: TsplTarget
  sl_target?: TsplTarget
  base_coin_type: string
  quote_coin_type: string
  is_long: boolean
  entry_price: string
}

export type TsplUpdateTargetOptions = {
  order_id: string
  order_cap_id: string
  target: TsplTarget
  base_coin_type: string
  quote_coin_type: string
}

export type TsplRemoveTargetOptions = {
  order_id: string
  order_cap_id: string
  target_id: string
  base_coin_type: string
  quote_coin_type: string
}

export type TsplCancelOrderOptions = {
  order_id: string
  order_cap_id: string
  order_book_id: string
  base_coin_type: string
  quote_coin_type: string
}

export type TsplClaimSettlementOptions = {
  order_id: string
  order_cap_id: string
  order_book_id: string
  /** Incentive coin types emitted on close besides market base / quote (e.g. multiple reward coins). */
  reward_coin_types: string[]
  position_id: string
  is_long: boolean
  base_coin_type: string
  quote_coin_type: string
  /** When false, returns the settlement coin for further transaction composition instead of transferring it to the sender. Default true. */
  transfer_coin_to_sender?: boolean
}

export type TsplClaimSettlementResult =
  | Transaction
  | {
    tx: Transaction
    base_coin: TransactionObjectArgument
    quote_coin: TransactionObjectArgument
    /** Merged coins per incentive type(s) excluding amounts already folded into base/quote. */
    reward_coins: { coin: TransactionObjectArgument; coin_type: string }[]
  }

export type TsplReclaimCapFromCompletedOrderOptions = {
  order_id: string
  order_cap_id: string
  base_coin_type: string
  quote_coin_type: string
}

export type TsplPositionDepositOptions = {
  order_id: string
  order_cap_id: string
  market_id: string
  deposit_coin: TransactionObjectArgument
  deposit_coin_type: string
  deposit_reserve_array_index: string
}

export type TsplPositionBorrowOptions = {
  order_id: string
  order_cap_id: string
  market_id: string
  borrow_coin_type: string
  reserve_array_index: string
  amount: string
}

export type TsplPositionRepayOptions = {
  order_id: string
  order_cap_id: string
  market_id: string
  repay_coin: TransactionObjectArgument
  repay_coin_type: string
  repay_reserve_array_index: string
}

export type TsplPositionWithdrawOptions = {
  order_id: string
  order_cap_id: string
  market_id: string
  rate_limiter_exemption?: TransactionObjectArgument
  withdraw_coin_type: string
  withdraw_reserve_array_index: string
  amount: string
}

export type TsplPositionClaimRewardsOptions = {
  order_id: string
  order_cap_id: string
  market_id: string
  reward_coin_type: string
  reserve_id: string
  reward_index: string
  is_deposit_reward: boolean
}

export type TsplPositionCompoundDebtOptions = {
  order_id: string
  order_cap_id: string
  market_id: string
  borrow_reserve_array_index: string
  borrow_index: string
}
