# Getting CLMM Pools

## 1. Get All Pools

Use `sdk.Pool.getPoolsWithPage()` method to retrieve all pools.

### Parameters

- `pagination_args`: Default to get all pool lists, supports pagination

### Example

```typescript
async function getAllPools() {
  const pools = await sdk.Pool.getPoolsWithPage()
  console.log(`pool length: ${pools.length}`)
}
```

## 2. Batch Get assign Pools

Use `sdk.Pool.getAssignPools()` method to retrieve specific pools.

### Parameters

- `assign_pools`: An array of pool ID to get.

### Example

```typescript
const pools = await sdk.Pool.getAssignPools(assign_pools)
console.log(pools)
```

## 3. Get Single Pool

Use `sdk.Pool.getPool()` method to retrieve a specific pool.

### Parameters

- `pool_id`: Pool address
- `force_refresh`: Optional boolean to refresh cache

### Example

```typescript
const pool = await sdk.Pool.getPool(pool_id)
console.log({ pool })
```

## 4. Get Pool by Coin Types

Use `sdk.Pool.getPoolByCoins()` method to find pools by coin types.

### Parameters

- `coins`: Array of coin types
- `fee_rate`: Optional fee rate number

### Example

```typescript
const coin_type_a = '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN'
const coin_type_b = '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN'

const pools = await sdk.Pool.getPoolByCoins([coin_type_a, coin_type_b])
```

## 5. Notes

Some common methods for pool

### 1. Convert SqrtPrice to Price

Use `TickMath.sqrtPriceX64ToPrice()` method to convert a given sqrtPrice to a price.

### Parameters

- `sqrt_price_x64`: The sqrtPrice value to convert.
- `decimals_a`: The number of decimals for coin A.
- `decimals_b`: The number of decimals for coin B.

### Example

```typescript
const sqrt_price_x64 = '18446744073709551616'
const decimals_a = 6
const decimals_b = 9

const price = TickMath.sqrtPriceX64ToPrice(new BN(sqrt_price_x64), decimals_a, decimals_b)
console.log('Price:', price.toString())
```
