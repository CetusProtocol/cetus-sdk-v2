export type IlmInputOptions = {
  curvature: number
  initial_price: string
  max_price: string
  bin_step: number
  total_supply: string
  pool_share_percentage: number
  config: {
    price_curve_points_num: number
    liquidity_distribution_num: number
    tokens_table_num: number
    price_table_num: number
  }
}

export type Axis = {
  x: string
  y: string
}

export type TokenTable = {
  withdrawn: string
  price: string
  usdc_in_pool: string
}

export type IlmInputResult = {
  price_curve: {
    data: Axis[]
    min_y: string
    max_y: string
  }
  liquidity_curve: {
    data: Axis[]
    min_y: string
    max_y: string
  }
  dlmm_bins: {
    data: Axis[]
    min_y: string
    max_y: string
  }
  tokens_table: TokenTable[]
  price_table: TokenTable[]
  initial_fdv: string
  final_fdv: string
  usdc_in_pool: string
}
