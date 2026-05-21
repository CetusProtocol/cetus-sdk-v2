# Add liquidity

Once you have set a suitable tick range, you can proceed to add liquidity to this position. The quantity composition of tokens you need to add is affected by the current price of the pool and the tick interval you have chosen.

There are two situations:

1. add liquidity with a specified liquidity
2. add liquidity with fixed coin amount.

## 1. add liquidity with a specified liquidity

Use `sdk.Position.createAddLiquidityPayload()` method.

### Function Parameters

- `pool_id`: The object id about which pool you want to operation
- `pos_id`: The object id about position.
- `max_amount_a`: The max limit about used coin a amount.
- `max_amount_b`: The max limit about used coin b amount.
- `delta_liquidity`: The actual change in liquidity that has been added.
- `tick_lower`: Represents the index of the lower tick boundary
- `tick_upper`: Represents the index of the upper tick boundary
- `collect_fee`: If you already has one position, you can select collect fees while adding liquidity.
- `rewarder_coin_types`: If these not empty, it will collect rewarder in this position, if you already open the position.

### Important Notes

### How to Calculate `delta_liquidity`, `max_amount_a`, and `max_amount_b`

1. you can set fixed two coin amount you want to use.
2. use ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts() to calculated the delta_liquidity.
3. Apply price slippage adjustment to the two coin amounts(max_amount_a and max_amount_b) calculated above by method adjustForCoinSlippage

### Example

```typescript
const pool = await sdk.Pool.getPool(pool_id)
const position = await sdk.Position.getPositionById(pos_id)
const cur_sqrt_price = new BN(pool.current_sqrt_price)
const lower_tick = Number(position.tick_lower_index)
const upper_tick = Number(position.tick_upper_index)

const lower_sqrt_price = TickMath.tickIndexToSqrtPriceX64(lower_tick)
const upper_sqrt_price = TickMath.tickIndexToSqrtPriceX64(upper_tick)

const slippage_tolerance = new Percentage(new BN(5), new BN(100))
const liquidity = 10000

const coin_amounts = ClmmPoolUtil.getCoinAmountFromLiquidity(new BN(liquidity), cur_sqrt_price, lower_sqrt_price, upper_sqrt_price, false)

const { coin_amount_limit_a, coin_amount_limit_b } = adjustForCoinSlippage(coin_amounts, slippage_tolerance, true)

const add_liquidity_payload_params: AddLiquidityParams = {
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
  pool_id: pool.id,
  tick_lower: lower_tick.toString(),
  tick_upper: upper_tick.toString(),
  delta_liquidity: liquidity.toString(),
  max_amount_a: coin_amount_limit_a.toString(),
  max_amount_b: coin_amount_limit_b.toString(),
  pos_id: position.pos_object_id,
  rewarder_coin_types: [],
  collect_fee: false,
}

const payload = await sdk.Position.createAddLiquidityPayload(add_liquidity_payload_params)

printTransaction(payload)
const send_key_pair = 'THE_KEY_PAIR_GENERATED_BY_YOUR_PRIVATE_KEY'
const transfer_txn = await sdk.FullClient.executeTx(send_key_pair, payload, true)
```

### 2. Add liquidity with a fixed coin amount

Use `sdk.Position.createAddLiquidityFixTokenPayload()` method.

### Function Parameters

- `pool_id`: The object id about which pool you want to operation
- `coin_type_a`: The coin type address about coinA
- `coin_type_b`: The coin type address about coinB
- `tick_lower`: Represents the index of the lower tick boundary
- `tick_upper`: Represents the index of the upper tick boundary
- `is_open`: true means if first add liquidity, so needs open one position
- `pos_id`: The object id about position
- `fix_amount_a`: true means fixed coinA amount, false means fixed coinB amount
- `slippage`: Price slippage point.
- `amount_a`: If fixed amount A, you must set amount_a, amount_b will be auto calculated by `ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts()`
- `amount_b`: If fixed amount B, you must set amount_b, amount_a will be auto calculated by `ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts()`
- `collect_fee`: If you already has one position, you can select collect fees while adding liquidity
- `rewarder_coin_types`: If these not empty, it will collect rewarder in this position, if you already open the position

### Important Notes

- The tick index must be an integer multiple of tickSpacing. If the provided parameter is not a multiple of tickSpacing, the contract will throw an error.
- `-443636 < tick_lower_index < tick_upper_index < 443636`, 443636 is a constant, derived from the maximum range representable by the Q32.62 fixed-point number format.
- If you know price range, you can use `TickMath.priceToTickIndex()` to transform real price to tick index.
- You can just open one position near the current price of the pool, use `TickMath.getPrevInitializeTickIndex()` and `TickMath.getNextInitializeTickIndex()` to find the next initialized tick.
- If you want to add global liquidity, you can set:
  - `tick_lower_index = -443636 + (443636 % tick_spacing)`
  - `tick_upper_index = 443636 - (443636 % tick_spacing)`

```typescript
const pool = await sdk.Pool.getPool(pool_id)
const position = await sdk.Position.getPositionById(pos_id)
const tick_lower_index = position.tick_lower_index
const tick_upper_index = position.tick_upper_index
const coin_amount = new BN(500)
const fix_amount_a = true
const slippage = 0.1
const cur_sqrt_price = new BN(pool.current_sqrt_price)

const liquidity_input = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
  tick_lower_index,
  tick_upper_index,
  coin_amount,
  fix_amount_a,
  true,
  slippage,
  cur_sqrt_price
)

const amount_a = fix_amount_a ? coin_amount.toNumber() : Number(liquidity_input.coin_amount_limit_a)
const amount_b = fix_amount_a ? Number(liquidity_input.coin_amount_limit_b) : coin_amount.toNumber()

const add_liquidity_payload_params: AddLiquidityFixTokenParams = {
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
  pool_id: pool.id,
  tick_lower: tick_lower_index.toString(),
  tick_upper: tick_upper_index.toString(),
  fix_amount_a,
  amount_a,
  amount_b,
  slippage,
  is_open: false,
  pos_id: position.pos_object_id,
  rewarder_coin_types: [],
  collect_fee: true,
}
const add_liquidity_payload = await sdk.Position.createAddLiquidityFixTokenPayload(add_liquidity_payload_params)

const transfer_txn = await sdk.FullClient.executeTx(send_key_pair, add_liquidity_payload, true)
```
