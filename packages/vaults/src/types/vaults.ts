import { CoinPairType, Package, SuiAddressType } from '@cetusprotocol/common-sdk'
import { FarmsPositionNFT } from '@cetusprotocol/farms-sdk'
import { TransactionObjectArgument } from '@mysten/sui/transactions'

export const VaultsRouterModule = 'router'
export const VaultsVaultModule = 'vaults'
export const PROTOCOL_FEE_DENOMINATOR = 10000

export type VaultsConfigs = {
  admin_cap_id: string
  vaults_manager_id: string
  vaults_pool_handle: string
}

export enum VaultStatus {
  STATUS_RUNNING = 'STATUS_RUNNING',
  STATUS_REBALANCING = 'STATUS_REBALANCING',
}

export type Vault = {
  id: string
  pool_id: string
  lp_token_type: string
  liquidity: string
  protocol_fee_rate: string
  is_pause: boolean
  harvest_assets: {
    harvest_assets_handle: string
    size: number
  }
  total_supply: string
  position: FarmsPositionNFT
  max_quota: string
  quota_based_type: string
  status: VaultStatus
}

export type RemoveParams = {
  vault_id: string
  clmm_pool: string
  slippage: number
  lp_token_type: SuiAddressType
  farming_pool: string
  lp_token_amount: string
  min_amount_a: string
  min_amount_b: string
  swap_params?: {
    swap_amount: string
    a2b: boolean
    route_obj?: any
  }
} & CoinPairType

export type CalculateDepositOnlyParams = {
  lower_tick: number
  upper_tick: number
  cur_sqrt_price: string
  fix_amount_a: boolean
  input_amount: string
  price_split_point: number
  remain_rate?: number
  clmm_pool: string
  request_id?: string
  use_route: boolean
  should_request_stake: boolean
  pools: string[]
} & CoinPairType

export type CalculateDepositOnlyResult = {
  swap_in_amount: string
  swap_out_amount: string
  after_sqrt_price: string
  fix_amount_a: boolean
  is_exceed: boolean
  request_id?: string
  route_obj?: any
}

export type CalculateMaxAvailableParams = {
  lower_tick: number
  upper_tick: number
  cur_sqrt_price: string
  input_amount: string
  clmm_pool: string
} & CoinPairType

export type CalculateRemoveOnlyParams = {
  lower_tick: number
  upper_tick: number
  cur_sqrt_price: string
  fix_amount_a: boolean
  receive_amount: string
  use_route: boolean
  clmm_pool: string
  price_split_point: number
  remove_liquidity?: string
  max_liquidity: string
  request_id: string
  pools: string[]
} & CoinPairType

export type CalculateRemoveOnlyResult = {
  is_exceed: boolean
  swap_in_amount: string
  swap_out_amount: string
  liquidity: string
  request_id: string
  a2b: boolean
  by_amount_in: boolean
  route_Obj?: any
}

export enum InputType {
  Both = 'both',
  OneSide = 'oneSide',
}

export type CalculateAmountParams = {
  vault_id: string
  fix_amount_a: boolean
  input_amount: string
  slippage: number
  side: InputType
  request_id?: string
}

export type CalculateAmountResult = {
  request_id?: string
  side: InputType
  original_input_amount: string
  amount_a: string
  amount_b: string
  amount_limit_a: string
  amount_limit_b: string
  ft_amount: string
  fix_amount_a: boolean
  swap_result?: SwapAmountResult
  partner?: string
}

export type DepositCoinParams = {
  vault_id: string
  result: CalculateAmountResult
  coin_a_input: TransactionObjectArgument | undefined
  coin_b_input: TransactionObjectArgument | undefined
  return_lp_token?: boolean
}

export type SwapAmountResult = {
  swap_in_amount: string
  swap_out_amount: string
  a2b: boolean
  is_exceed: boolean
  after_sqrt_price?: string
  route_obj?: any
}

export type CalculateRemoveAmountParams = {
  vault_id: string
  fix_amount_a: boolean
  is_ft_input: boolean
  input_amount: string
  max_ft_amount: string
  slippage: number
  side: InputType
  request_id?: string
}

export type CalculateRemoveAmountResult = {
  request_id?: string
  side: InputType
  amount_a: string
  amount_b: string
  amount_limit_a: string
  amount_limit_b: string
  burn_ft_amount: string
  swap_result?: SwapAmountResult
}

export type DepositParams = {
  vault_id: string
  coin_object_a?: TransactionObjectArgument // If coin_object_a is provided, use coin_object_a. Please ensure coin_object is greater than or equal to amount_a
  coin_object_b?: TransactionObjectArgument // If coin_object_b is provided, use coin_object_b. Please ensure coin_object is greater than or equal to amount_b
  slippage: number
  deposit_result: CalculateAmountResult
  return_lp_token?: boolean
}

export type WithdrawBothParams = {
  vault_id: string
  ft_amount: string
  slippage: number
  return_coin?: boolean
}

export type WithdrawOneSideParams = {
  vault_id: string
  fix_amount_a: boolean
  is_ft_input: boolean
  input_amount: string
  max_ft_amount: string
  slippage: number
  partner?: string
  return_coin?: boolean
}
