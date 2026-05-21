# Pre Swap

Before performing an actual swap, you can do a pre-swap to get the swap result. Then you can set amount limit by swap result and slippage.

This text describes two primary methods for performing a swap function, each with distinct steps and calculation methods:

1. The first method involves initially obtaining tick data, followed by performing calculations locally
2. The second method involves conducting a simulated swap and then obtaining the resultant data through an event on Sui

There are three pre-calculation strategies for executing a swap:

1. Local Calculate
2. Simulate swap then get result
   - Single pool swap result: use `sdk.Swap.preSwap()`
   - Multi pool calculation: use `sdk.Swap.preSwapWithMultiPool()`

## Local Calculate Swap Result

This method requires getting ticks data and pool object first using `sdk.Swap.calculateRates` method.

### Function Parameters

- `params`: CalculateRatesParams object
- `decimals_a`: the decimal of coinA
- `decimals_b`: the decimal of coinB
- `a2b`: swap direction, true means swap from coinA to coinB, false means swap from coinB to CoinA
- `by_amount_in`: true means fixed the amount of input, false means fixed the amount of output
- `amount`: the amount of input (by_amount_in = true) or output (by_amount_in = false)
- `swap_ticks`: the array of TickData, get them by `sdk.Pool.fetchTicks()`
- `current_pool`: the pool object, get it by `sdk.Pool.getPool()`

### Example

```typescript
const a2b = false
const pool = await sdk.Pool.getPool('0xc8d7a1503dc2f9f5b05449a87d8733593e2f0f3e7bffd90541252782e4d2ca20')
const by_amount_in = false
const amount = '80000000000000'

const swap_ticks = await sdk.Pool.fetchTicks({
  pool_id: pool.id,
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
})
// or
// const swapTicks =  await  sdk.Pool.fetchTicksByRpc(pool.ticks_handle)

const res = sdk.Swap.calculateRates({
  decimals_a: 6,
  decimals_b: 6,
  a2b,
  by_amount_in,
  amount: new BN(amount),
  swap_ticks,
  current_pool: pool,
})
```

## PreSwap by Simulation Transaction

### preSwap

Use `sdk.Swap.preSwap` method.

#### Function Parameters

- `pool`: pool object, you can get it by `sdk.Pool.getPool()` method
- `current_sqrt_price`: pool's current_sqrt_price
- `coin_type_a`: the coin type address about coinA
- `coin_type_b`: the coin type address about coinB
- `decimals_a`: the decimal of coinA
- `decimals_b`: the decimal of coinB
- `a2b`: swap direction, true means swap from coinA to coinB, false means swap from coinB to CoinA
- `by_amount_in`: true means fixed the amount of input, false means fixed the amount of output
- `amount`: the amount of input (by_amount_in = true) or output (by_amount_in = false)

#### Example

```typescript
const a2b = true
const by_amount_in = true
const amount = '10000000'
const slippage = Percentage.fromDecimal(d(0.1))

const pool = await sdk.Pool.getPool('0x6fd4915e6d8d3e2ba6d81787046eb948ae36fdfc75dad2e24f0d4aaa2417a416')

const res = await sdk.Swap.preSwap({
  pool,
  current_sqrt_price: : pool.current_sqrt_price,
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
  decimals_a: 6,
  decimals_b: 6,
  a2b,
  by_amount_in,
  amount,
})
```

### preSwapWithMultiPool

Use `sdk.Swap.preSwapWithMultiPool()` method.

#### Function Parameters

- `pool_ids`: An array of pool objects ID. All pools must have the same type
- `coin_type_a`: the coin type address about coinA
- `coin_type_b`: the coin type address about coinB
- `a2b`: swap direction, true means swap from coinA to coinB, false means swap from coinB to CoinA
- `by_amount_in`: true means fixed the amount of input, false means fixed the amount of output
- `amount`: the amount of input (by_amount_in = true) or output (by_amount_in = false)

#### Example

```typescript
const a2b = true
const pool_ids = [
  '0x53d70570db4f4d8ebc20aa1b67dc6f5d061d318d371e5de50ff64525d7dd5bca',
  '0x4038aea2341070550e9c1f723315624c539788d0ca9212dca7eb4b36147c0fcb',
  '0x6fd4915e6d8d3e2ba6d81787046eb948ae36fdfc75dad2e24f0d4aaa2417a416',
]
const pool0 = await sdk.Pool.getPool(pool_ids[0])
const pool1 = await sdk.Pool.getPool(pool_ids[1])
const pool2 = await sdk.Pool.getPool(pool_ids[2])
const by_amount_in = true
const amount = '10000000'

const res_with_multi_pool = await sdk.Swap.preSwapWithMultiPool({
  pool_ids: pool_ids,
  coin_type_a: pool0.coin_type_a,
  coin_type_b: pool0.coin_type_b,
  a2b,
  by_amount_in,
  amount,
})
```
