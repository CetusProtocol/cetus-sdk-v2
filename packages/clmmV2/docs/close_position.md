# Close Position

When you withdraw all the liquidity from your position, you can decide whether to close the position. Please note that when closing the position, you must also withdraw all the current position's liquidity, fees, and rewards.

## 1. Close Position

Use `sdk.Position.closePositionPayload()` method.

### Function Parameters

- `pool_id`: The object id about which pool you want to operation
- `pos_id`: The object id about which position you want to operation
- `coin_type_a`: The coin type address about coinA
- `coin_type_b`: The coin type address about coinB
- `min_amount_a`: The minimum amount of coin A that a user can acquire.
- `min_amount_b`: The minimum amount of coin B that a user can acquire.
- `rewarder_coin_types`: When closing the position, all pending rewards must be collected

### Important Notes

- Because of pool price will change, the amount of coin A and coin B will change. So the min_amount_a and min_amount_a means no matter how the price moves, the amount quantity that I need to receive at least is typically obtained
  by adding the amount potentially acquired through calculations to the slippage adjustment.

### Example

```typescript
const pool = await sdk.Pool.getPool(pool_id)
const position = await sdk.Position.getPositionById(pos_id)

const lower_tick = Number(position.tick_lower_index)
const upper_tick = Number(position.tick_upper_index)

const lower_sqrt_price = TickMath.tickIndexToSqrtPriceX64(lower_tick)
const upper_sqrt_price = TickMath.tickIndexToSqrtPriceX64(upper_tick)

const liquidity = new BN(position.liquidity)
const slippage_tolerance = new Percentage(new BN(5), new BN(100))
const cur_sqrt_price = new BN(pool.current_sqrt_price)

const coin_amounts = ClmmPoolUtil.getCoinAmountFromLiquidity(liquidity, cur_sqrt_price, lower_sqrt_price, upper_sqrt_price, false)
const { coin_amount_limit_a, coin_amount_limit_b } = adjustForCoinSlippage(coin_amounts, slippage_tolerance, false)

const reward_coin_types = pool.rewarder_infos.map((rewarder) => rewarder.coin_type)

const close_position_payload = await sdk.Position.closePositionPayload({
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
  min_amount_a: coin_amount_limit_a.toString(),
  min_amount_b: coin_amount_limit_b.toString(),
  rewarder_coin_types: reward_coin_types,
  pool_id: pool.id,
  pos_id: position_nft_id,
  collect_fee: true,
})
const send_key_pair = 'THE_KEY_PAIR_GENERATED_BY_YOUR_PRIVATE_KEY'
const transfer_txn = await sdk.FullClient.executeTx(send_key_pair, close_position_payload, true)
```
