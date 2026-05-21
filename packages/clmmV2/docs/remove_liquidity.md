# Remove liquidity

When you want to adjust the liquidity of your position or withdraw liquidity from the position, you can use the following method.

When you withdraw liquidity, you also have the option to collect fees or rewards at the same time. Please refer to the parameter description below for more details.

There are two situations:

1. remove liquidity with a specified liquidity
2. remove liquidity with fixed coin amount.

## 1. Remove liquidity by inputting liquidity value

Use `sdk.Position.removeLiquidityPayload()` method.

### Function Parameters

- `pool_id`: The object id about which pool you want to operation
- `pos_id`: The object id about position.
- `coin_type_a`: The coin type address about coinA
- `coin_type_b`: The coin type address about coinB
- `min_amount_a`: The minimum amount of coin A that a user can acquire.
- `min_amount_b`: The minimum amount of coin B that a user can acquire.
- `delta_liquidity`: The quantity of liquidity.
- `collect_fee`: If you already has one position, you can select collect fees while adding liquidity.
- `rewarder_coin_types`: If these not empty, it will collect rewarder in this position, if you already open the position.

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

const remove_liquidity_params: RemoveLiquidityParams = {
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
  delta_liquidity: liquidity.toString(),
  min_amount_a: coin_amount_limit_a.toString(),
  min_amount_b: coin_amount_limit_b.toString(),
  pool_id: pool.id,
  pos_id: position.pos_object_id,
  rewarder_coin_types: reward_coin_types,
  collect_fee: true,
}

const remove_liquidity_payload = await sdk.Position.removeLiquidityPayload(remove_liquidity_params)
const send_key_pair = 'THE_KEY_PAIR_GENERATED_BY_YOUR_PRIVATE_KEY'
const transfer_txn = await sdk.FullClient.executeTx(send_key_pair, remove_liquidity_payload, true)
```

### 2. Remove liquidity with a fixed coin amount

Use `sdk.Position.removeLiquidityPayload()` method.

### Function Parameters

- `pool_id`: The object id about which pool you want to operation
- `pos_id`: The object id about position.
- `coin_type_a`: The coin type address about coinA
- `coin_type_b`: The coin type address about coinB
- `min_amount_a`: The minimum amount of coin A that a user can acquire.
- `min_amount_b`: The minimum amount of coin B that a user can acquire.
- `delta_liquidity`: The quantity of liquidity.
- `collect_fee`: If you already has one position, you can select collect fees while adding liquidity.
- `rewarder_coin_types`: If these not empty, it will collect rewarder in this position, if you already open the position.

```typescript
const pool = await sdk.Pool.getPool(pool_id)
const position = await sdk.Position.getPositionById(pos_id)
const lower_tick = position.tick_lower_index
const upper_tick = position.tick_upper_index
const coin_amount = new BN(592)
const fix_amount_a = true
const slippage = 0.05
const cur_sqrt_price = new BN(pool.current_sqrt_price)

const liquidity_input = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
  lower_tick,
  upper_tick,
  coin_amount,
  fix_amount_a,
  false,
  slippage,
  cur_sqrt_price
)

const liquidity = liquidity_input.liquidity_amount.toString()

const remove_liquidity_params: RemoveLiquidityParams = {
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
  delta_liquidity: liquidity,
  min_amount_a: liquidity_input.coin_amount_limit_a,
  min_amount_b: liquidity_input.coin_amount_limit_b,
  pool_id: pool.id,
  pos_id: position.pos_object_id,
  rewarder_coin_types: [],
  collect_fee: true,
}

const payload = await sdk.Position.removeLiquidityPayload(remove_liquidity_params)

const transfer_txn = await sdk.FullClient.executeTx(send_key_pair, payload, true)
```
