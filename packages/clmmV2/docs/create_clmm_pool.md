# Create CLMM Pool

Everyone can create Cetus CLMM pools directly.

## 1. Create a CLMM Pool with Initial Liquidity

Use `sdk.Pool.createPoolTransactionPayload()` to create a pool.

### Function Parameters

#### Required Parameters

- `tick_spacing`: Affects price precision. Different tick spacing values correspond to different fee rates:

  | Tick Spacing | Fee Rate |
  | ------------ | -------- |
  | 2            | 0.0001   |
  | 10           | 0.0005   |
  | 20           | 0.001    |
  | 60           | 0.0025   |
  | 200          | 0.01     |
  | 220          | 0.02     |

- `initialize_sqrt_price`: For computational convenience, we use fixed-point numbers to represent square root prices. Use `TickMath.priceToSqrtPriceX64()` to transform price to sqrtPrice.
- `coin_type_a`: The coin type address for coin A.
- `coin_type_b`: The coin type address for coin B.
- `amount_a`: The amount of coin A to add as liquidity.
- `amount_b`: The amount of coin B to add as liquidity.
- `fix_amount_a`: Boolean value - true means fixed coin A amount, false means fixed coin B amount.
- `tick_lower`: The index of the lower tick boundary.
- `tick_upper`: The index of the upper tick boundary.

#### Optional Parameters

- `uri`: The icon of the pool (can be null).

### Determining Coin Type A and B

1. Complete the Coin Type: Ensure the coin type is complete before comparing.
2. Character-by-Character Comparison: Compare the characters of both coin type addresses.
3. ASCII Value Comparison: When encountering differing characters, compare their ASCII values. The coin with the larger ASCII value becomes "coin A".

#### Examples:

1. Example 1:

   - coin_type_a: `0x6864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS`
   - coin_type_b: `0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI`

2. Example 2:
   - coin_type_a: `0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC`
   - coin_type_b: `0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN`

### Important Notes

- The tick index must be an integer multiple of tickSpacing.
- Range: `-443636 < tick_lower_index < current_tick_index < tick_upper_index < 443636`
- Currently, creating a pool requires adding bidirectional liquidity.

## Example Code

```typescript
const sdk = CetusClmmSDK.createSDK({ env: 'mainnet' })
const signer = ... // set keypair
sdk.senderAddress = signer.getPublicKey().toSuiAddress() // set sdk.senderAddress

// Initialize sqrt_price
const initialize_sqrt_price = TickMath.priceToSqrtPriceX64(d(1.2),6,6).toString()
const tick_spacing = 2
const current_tick_index = TickMath.sqrtPriceX64ToTickIndex(new BN(initialize_sqrt_price))

// Build tick range
const tick_lower = TickMath.getPrevInitializeTickIndex(
    new BN(current_tick_index).toNumber(),
    new BN(tick_spacing).toNumber()
)
const tick_upper = TickMath.getNextInitializeTickIndex(
    new BN(current_tick_index).toNumber(),
    new BN(tick_spacing).toNumber()
)

// Input token amount
const fix_coin_amount = new BN(200)
const fix_amount_a = true // input token amount is token a
const slippage = 0.05 // 5% slippage
const cur_sqrt_price = new BN(initialize_sqrt_price)

// Estimate liquidity and token amount from one amounts
const res = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
    lower_tick,
    upper_tick,
    fix_coin_amount,
    fix_amount_a,
    true,
    slippage,
    cur_sqrt_price
)

// Estimate token a and token b amount
const amount_a = fix_amount_a ? fix_coin_amount.toNumber() : res.coin_amount_limit_a.toNumber()
const amount_b = fix_amount_a ? res.coin_amount_b.toNumber() : fix_coin_amount.toNumber()


// Build createPoolPayload
const create_pool_payload = sdk.Pool.createPoolPayload({
    coin_type_a,
    coin_type_b,
    tick_spacing: tick_spacing,
    initialize_sqrt_price: initialize_sqrt_price,
    uri: '',
    amount_a,
    amount_b,
    fix_amount_a,
    tick_lower,
    tick_upper,
})
const send_key_pair = 'THE_KEY_PAIR_GENERATED_BY_YOUR_PRIVATE_KEY'
const transfer_txn = await sdk.FullClient.executeTx(send_key_pair, tx, true)
```

## 2. Create a CLMM Pool with Initial Liquidity by directly inputting the price range

Use `sdk.Pool.createPoolWithPricePayload()` to create a pool.

### Function Parameters

#### Required Parameters

- `tick_spacing`: Affects price precision and fee rate (see table above)
- `current_price`: The initial price of the pool
- `coin_amount`: The amount of coins to add as liquidity
- `fix_amount_a`: Boolean value - true means fixed coin A amount, false means fixed coin B amount
- `add_mode_params`: Configuration for price range:
  - For custom range: `{ is_full_range: false, min_price: string, max_price: string }`
  - For full range: `{ is_full_range: true }`
- `coin_decimals_a`: Number of decimal places for coin A
- `coin_decimals_b`: Number of decimal places for coin B
- `price_base_coin`: Base coin for price calculation ('coin_a' or 'coin_b')
- `slippage`: Maximum acceptable slippage (e.g., 0.05 for 5%)

### Two Ways to Create Pool

1. **Create Pool with Position Return**
   Use `sdk.Pool.createPoolWithPriceReturnPositionPayload()` to create a pool and get the position ID and remaining coins.

```typescript
// Custom price range example
const tick_spacing = 220

const mode_params: CreatePoolCustomRangeParams = {
  is_full_range: false,
  min_price: '0.2',
  max_price: '0.7',
}

const result = await sdk.Pool.calculateCreatePoolWithPrice({
  tick_spacing,
  current_price: '0.5',
  coin_amount: '1000000',
  fix_amount_a: true,
  add_mode_params: mode_params,
  coin_decimals_a: 6,
  coin_decimals_b: 9,
  price_base_coin: 'coin_a',
  slippage: 0.05,
})

const { tx, pos_id, remain_coin_a, remain_coin_b, remain_coin_type_a, remain_coin_type_b } =
  await sdk.Pool.createPoolWithPriceReturnPositionPayload({
    tick_spacing,
    calculate_result: result,
    add_mode_params: mode_params,
    coin_type_a,
    coin_type_b,
  })

// Handle remaining coins
buildTransferCoin(sdk, tx, remain_coin_a, remain_coin_type_a)
buildTransferCoin(sdk, tx, remain_coin_b, remain_coin_type_b)
tx.transferObjects([pos_id], sdk.getSenderAddress())
```

2. **Create Pool Directly**
   Use `sdk.Pool.createPoolWithPricePayload()` for a simpler pool creation without position management.

```typescript
// Full range example
const full_range_params: FullRangeParams = {
  is_full_range: true,
}

const full_range_result = await sdk.Pool.calculateCreatePoolWithPrice({
  tick_spacing,
  current_price: '0.5',
  coin_amount: '1000000',
  fix_amount_a: true,
  add_mode_params: full_range_params,
  coin_decimals_a: 6,
  coin_decimals_b: 9,
  price_base_coin: 'coin_a',
  slippage: 0.05,
})

const tx = await sdk.Pool.createPoolWithPricePayload({
  tick_spacing,
  calculate_result: full_range_result,
  add_mode_params: full_range_params,
  coin_type_a,
  coin_type_b,
})
```

### Important Notes

- The price range must be valid and within acceptable bounds
- For custom ranges, ensure min_price < current_price < max_price
- The tick spacing determines the fee rate and price precision
- Slippage protection is important to prevent significant price impact
- Consider the decimal places of both coins when calculating amounts
