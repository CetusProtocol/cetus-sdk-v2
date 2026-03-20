export type CalculateMigrateWithdrawOptions = {
  from_vault_id: string
  to_vault_id: string
  burn_ft_amount: string
  liquidity_slippage: number
}

export type CalculateMigrateWithdrawResult = {
  from_vault_id: string
  to_vault_id: string
  burn_ft_amount: string
  liquidity_slippage: number
  deposit_amount_a: string
  deposit_amount_b: string
  obtained_ft_amount: string
  fix_amount_a: boolean
  from_swap_result: SwapCoinResult
  rebalance_swap_result?: RebalanceSwapResult
}

export type MigrateWithdrawOptions = {
  withdraw_result: CalculateMigrateWithdrawResult
  return_ft_coin?: boolean
}

export type SwapCoinOptions = {
  from: {
    coin_type_a: string
    coin_amount_a: string
    coin_type_b: string
    coin_amount_b: string
  }
  to: {
    coin_type_a: string
    coin_type_b: string
  }
}

export type RebalanceSwapResult = {
  final_amount_a: string
  final_amount_b: string
  route_obj?: {
    swap_direction: 'A_TO_B' | 'B_TO_A'
  } & SwapResult
}

export type SwapResult = {
  swap_in_amount: string
  swap_out_amount: string
  route_obj: any
}

export type SwapCoinResult = {
  coin_output_a: {
    from_coin_type: string
    from_coin_amount: string
    to_coin_type: string
    to_coin_amount: string
    route_obj?: SwapResult
  }
  coin_output_b: {
    from_coin_type: string
    from_coin_amount: string
    to_coin_type: string
    to_coin_amount: string
    route_obj?: SwapResult
  }
}
