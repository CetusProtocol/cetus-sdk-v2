import type { NFT, SuiAddressType, SuiObjectIdType } from '@cetusprotocol/common-sdk'

export const XcetusRouterModule = 'router'
export const DividendsRouterModule = 'router'

export const ONE_DAY_SECONDS = 24 * 3600
export const EXCHANGE_RATE_MULTIPLIER = 1000
export const REDEEM_NUM_MULTIPLIER = 100000000000

export type XcetusConfig = {
  xcetus_manager_id: SuiObjectIdType
  lock_manager_id: SuiObjectIdType
  lock_handle_id: SuiObjectIdType
}

export type DividendConfig = {
  dividend_admin_id?: SuiObjectIdType
  dividend_settle_id?: SuiObjectIdType
  dividend_manager_id: SuiObjectIdType
  venft_dividends_id: SuiAddressType
  venft_dividends_id_v2: SuiAddressType
}

export type LockUpConfig = {
  min_lock_day: number
  max_lock_day: number
  max_percent_numerator: number
  min_percent_numerator: number
}

export const defaultLockUpConfig: LockUpConfig = {
  min_lock_day: 15,
  max_lock_day: 180,
  max_percent_numerator: 1000,
  min_percent_numerator: 500,
}

export type LockUpManager = {
  id: string
  balance: string
  treasury_manager: string
  extra_treasury: string
  lock_infos: {
    lock_handle_id: string
    size: number
  }
  type_name: string
  min_lock_day: number
  max_lock_day: number

  package_version: number
  max_percent_numerator: number
  min_percent_numerator: number
}

export type VeNFT = {
  id: SuiObjectIdType
  type: string
  index: string
  xcetus_balance: string
} & NFT

export type LockCetus = {
  id: SuiObjectIdType
  type: SuiAddressType
  version: LockCetusVersion
  locked_start_time: number
  locked_until_time: number
  lock_day: number
  cetus_amount: string
  xcetus_amount: string
}

export type LockCetusVersion = 'v1' | 'v2'

export type ConvertParams = {
  amount: string
  venft_id?: SuiObjectIdType
}

export type RedeemLockParams = {
  amount: string
  venft_id: SuiObjectIdType
  lock_day: number
}

export type RedeemXcetusParams = {
  venft_id: SuiObjectIdType
  lock_id: SuiObjectIdType
}

export type CancelRedeemParams = {
  venft_id: SuiObjectIdType
  lock_id: SuiObjectIdType
}

export type XcetusManager = {
  id: SuiObjectIdType
  index: number
  has_venft: {
    handle: SuiObjectIdType
    size: number
  }
  nfts: {
    handle: SuiObjectIdType
    size: number
  }
  total_locked: string
  treasury: string
}

export type VeNFTDividendInfo = {
  id: SuiObjectIdType
  venft_id: SuiObjectIdType
  rewards: DividendReward[]
}

export type DividendReward = {
  period: number
  rewards: { coin_type: SuiAddressType; amount: string }[]
  version: string
}

export type PhaseDividendInfo = {
  id: string
  phase: string
  settled_num: string
  register_time: string
  redeemed_num: {
    name: string
    value: string
  }[]
  is_settled: boolean
  bonus_types: string[]
  bonus: {
    name: string
    value: string
  }[]
  phase_end_time: string
}

export type DividendManager = {
  id: SuiObjectIdType
  /// Dividend info of every phase.
  dividends: {
    id: SuiObjectIdType
    size: number
  }
  /// Dividend info of every venft.
  venft_dividends: {
    id: SuiObjectIdType
    size: number
  }
  /// Current bonus type supported.
  bonus_types: SuiAddressType[]
  /// init time
  start_time: number
  /// interval day between each settlement phase
  interval_day: number
  /// hold the bonus of different types.
  balances: {
    id: SuiObjectIdType
    size: number
  }
  /// status
  is_open: boolean
}

export type BonusTypesV2 = Record<SuiAddressType, number[]>
