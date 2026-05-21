# Open Position

Before you want to deposit liquidity, you need to choose an appropriate price range (corresponding to the tick range) to open a position.

There are two situations:

1. Open a position only
2. Open position and add liquidity (recommended)

In most cases, opening a position and adding liquidity are supposed to be done simultaneously.

## 1.1. Open a Position Only with tick range

Use `sdk.Position.openPositionPayload()` method.

### Function Parameters

- `pool_id`: The object id about which pool you want to operation
- `coin_type_a`: The coin type address about coinA
- `coin_type_b`: The coin type address about coinB
- `tick_lower`: Represents the index of the lower tick boundary
- `tick_upper`: Represents the index of the upper tick boundary

### Important Notes

- The tick index must be an integer multiple of tickSpacing. If the provided parameter is not a multiple of tickSpacing, the contract will throw an error.
- `-443636 < tick_lower_index < tick_upper_index < 443636`, 443636 is a constant, derived from the maximum range representable by the Q32.62 fixed-point number format.
- If you know price range, you can use `TickMath.priceToTickIndex()` to transform real price to tick index.
- You can just open one position near the current price of the pool, use `TickMath.getPrevInitializeTickIndex()` and `TickMath.getNextInitializeTickIndex()` to find the next initialized tick.
- If you want to add global liquidity, you can set:
  - `tick_lower_index = -443636 + (443636 % tick_spacing)`
  - `tick_upper_index = 443636 - (443636 % tick_spacing)`

### 1 Example

```typescript
const send_key_pair = 'THE_KEY_PAIR_GENERATED_BY_YOUR_PRIVATE_KEY'
// fetch pool data
const pool = await sdk.Pool.getPool(pool_id)
// build tick range
const lower_tick = TickMath.getPrevInitializeTickIndex(new BN(pool.current_tick_index).toNumber(), new BN(pool.tick_spacing).toNumber())
const upper_tick = TickMath.getNextInitializeTickIndex(new BN(pool.current_tick_index).toNumber(), new BN(pool.tick_spacing).toNumber())
// build open position payload
const open_position_payload = sdk.Position.openPositionPayload({
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
  tick_lower: lower_tick.toString(),
  tick_upper: upper_tick.toString(),
  pool_id: pool.id,
})
const transfer_txn = await sdk.FullClient.executeTx(send_key_pair, open_position_payload, true)
```

### 1.2 Open a Position Only with price range

Use `sdk.Position.openPositionWithPricePayload()` method.

#### Required Parameters

- `pool_id`: The object id about which pool you want to operation
- `add_mode_params`: Configuration for price range:
  - For custom range: `{ is_full_range: false, min_price: string, max_price: string , price_base_coin: string}`
  - For full range: `{ is_full_range: true }`
- `coin_decimals_a`: Number of decimal places for coin A
- `coin_decimals_b`: Number of decimal places for coin B
- `price_base_coin`: Base coin for price calculation ('coin_a' or 'coin_b')

```typescript
const pool_id = '0x0...'

// use full range price mode
const full_range_params: OpenPositionWithPriceParams = {
  pool_id,
  is_full_range: true,
}
const open_payload = await sdk.Position.openPositionWithPricePayload(full_range_params)

// or
// use custom price range
const custom_price_range_params: OpenPositionWithPriceParams = {
  pool_id,
  coin_decimals_a: 6,
  coin_decimals_b: 9,
  is_full_range: false,
  min_price: '0.2',
  max_price: '0.9',
  price_base_coin: 'coin_a',
}
const open_payload = await sdk.Position.openPositionWithPricePayload(custom_price_range_params)

const transfer_txn = await sdk.FullClient.executeTx(send_key_pair, open_payload, true)
```

## 2.1 Open Position with Add Liquidity by tick range

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

### Example

```typescript
const pool = await sdk.Pool.getPool(pool_id)
const coin_amount = new BN(500)
const fix_amount_a = true
const slippage = 0.1
const cur_sqrt_price = new BN(pool.current_sqrt_price)

const tick_lower_index = TickMath.getPrevInitializeTickIndex(
  new BN(pool.current_tick_index).toNumber(),
  new BN(pool.tick_spacing).toNumber()
)
const tick_upper_index = TickMath.getNextInitializeTickIndex(
  new BN(pool.current_tick_index).toNumber(),
  new BN(pool.tick_spacing).toNumber()
)

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
  is_open: true,
  pos_id: position.pos_object_id,
  rewarder_coin_types: [],
  collect_fee: false,
}
const add_liquidity_payload = await sdk.Position.createAddLiquidityFixTokenPayload(add_liquidity_payload_params)

const transfer_txn = await sdk.FullClient.executeTx(send_key_pair, add_liquidity_payload, true)
```

## 2.2 Open Position with Add Liquidity by price range

Use `sdk.Position.createAddLiquidityFixCoinWithPricePayload()` method.

### Function Parameters

- `pool_id`: The object id about which pool you want to operation
- `add_mode_params`: Configuration for price range:
  - For custom range: `{ is_full_range: false, min_price: string, max_price: string , price_base_coin: string, coin_decimals_a: number, coin_decimals_b: number}`
  - For full range: `{ is_full_range: true }`
- `coin_decimals_a`: Number of decimal places for coin A
- `coin_decimals_b`: Number of decimal places for coin B
- `price_base_coin`: Base coin for price calculation ('coin_a' or 'coin_b')

### Example

Use `sdk.Position.createAddLiquidityFixTokenPayload()` method.

```typescript
// custom price range
const params: CustomRangeParams = {
  s_full_range: false,
  min_price: '0.2',
  max_price: '0.7',
  coin_decimals_a: 6,
  coin_decimals_b: 9,
  price_base_coin: 'coin_a',
}

// or
//  full range price
const params: FullRangeParams = {
  is_full_range: true,
}

const result = await sdk.Position.calculateAddLiquidityResultWithPrice({
  add_mode_params: params,
  pool_id,
  slippage: 0.01,
  coin_amount: toDecimalsAmount(1, 6).toString(),
  fix_amount_a: true,
})

const payload = await sdk.Position.createAddLiquidityFixCoinWithPricePayload({
  pool_id,
  calculate_result: result,
  add_mode_params: params,
})

const transfer_txn = await sdk.FullClient.executeTx(send_key_pair, payload, true)
```
