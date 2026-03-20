export type MarginTradingConfig = {
  package_id: string
  published_at: string
  version: number
  config: MarginTradingConfigs
}
export type MarginTradingConfigs = {
  versioned_id: string
  admin_cap_id: string
  global_config_id: string
  markets: string
  markets_table_id: string
}

export type SuiLendConfigs = {
  lending_market: LendingMarket[]
  lending_market_id: string
  lending_market_type: string
  api_url: string
}

export type LendingMarket = {
  name: string
  slug: string
  id: string
  type: string
  owner_cap_id: string
  is_hidden?: boolean
}

export type LeverageThresholdConfig = {
  long_threshold: number
  short_threshold: number
}

export type MarketLeverageThresholds = {
  [market_id: string]: LeverageThresholdConfig
}


