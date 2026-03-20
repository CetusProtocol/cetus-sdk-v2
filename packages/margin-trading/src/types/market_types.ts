import { RewardSummary } from '@suilend/sdk'

export type Market = {
  market_id: string
  base_token: string
  quote_token: string
  max_long_leverage: string
  max_short_leverage: string
  open_fee_rate: string
  close_fee_rate: string
  open_permissions_pause: boolean
  close_permissions_pause: boolean
  deposit_permissions_pause: boolean
  withdraw_permissions_pause: boolean
  borrow_permissions_pause: boolean
  repay_permissions_pause: boolean
}

export type MarketSuilendInfo = {
  long_liquidity: string
  short_liquidity: string
  base_total_deposit_apr_percent: string
  base_total_borrow_apr_percent: string
  quote_total_deposit_apr_percent: string
  quote_total_borrow_apr_percent: string
  base_token_available_deposit_amount: string
  base_token_available_borrow_amount: string
  quote_token_available_deposit_amount: string
  quote_token_available_borrow_amount: string
  base_deposit_rewards: RewardSummary[]
  quote_deposit_rewards: RewardSummary[]
  base_borrow_rewards: RewardSummary[]
  quote_borrow_rewards: RewardSummary[]
  base_deposit_apr_percent: string
  base_borrow_apr_percent: string
  quote_deposit_apr_percent: string
  quote_borrow_apr_percent: string
} & Record<string, any>

export type CreateMarketParams = {
  base_token: string
  quote_token: string
  open_fee_rate: string
  close_fee_rate: string
}

export type UpdateMarketMaxLeverageParams = {
  market_id: string
  max_long_leverage: string
  max_short_leverage: string
}

export type UpdateMarketFeeRateParams = {
  market_id: string
  open_fee_rate: string
  close_fee_rate: string
}

export type ClaimMarketFeeParams = {
  market_id: string
}
