export type IlmInputOptions = {
  curvature: number
  initial_price: number
  max_price: number
  bin_step: number
  total_supply: number
  pool_share_percentage: number
  config: {
    price_curve_points_num: number
    liquidity_distribution_num: number
    tokens_table_num: number
    price_table_num: number
  }
}

export type Axis = {
  x: number
  y: number
}

export type TokenTable = {
  withdrawn: number
  price: number
  usdc_in_pool: number
}

export type IlmInputResult = {
  price_curve: {
    data: Axis[]
    min_y: number
    max_y: number
  }
  liquidity_curve: {
    data: Axis[]
    min_y: number
    max_y: number
  }
  dlmm_bins: {
    data: Axis[]
    min_y: number
    max_y: number
  }
  tokens_table: TokenTable[]
  price_table: TokenTable[]
  initial_fdv: number
  final_fdv: number
  usdc_in_pool: number
}
