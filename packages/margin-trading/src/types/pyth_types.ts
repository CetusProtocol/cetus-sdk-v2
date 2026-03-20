export type Price = {
  coin_type: string // Coin type (e.g., A or B)
  price: string // Current price of the coin
  oracle_price: bigint
  last_update_time: number
}


export type FeedInfo = {
  coin_type: string // Coin type for the price feed
  price_feed_id: string // ID of the price feed
  coin_decimals: number // Decimal precision of the coin in the price feed
}