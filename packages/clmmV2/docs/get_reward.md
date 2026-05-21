# Get Pool Position Rewards

## 1. Get Pool Position Reward List of One Pool

Use `SDK.Pool.fetchPoolPositionInfoList()` method.

### Parameters

- `pool_id`: The pool object ID
- `coin_type_a`: Coin A type
- `coin_type_b`: Coin B type

### Example

```typescript
const pool_id = '0x83c101a55563b037f4cd25e5b326b26ae6537dc8048004c1408079f7578dd160'
const pool = await sdk.Pool.getPool(pool_id)
const res = await sdk.Pool.fetchPoolPositionInfoList({
  pool_id: pool.id,
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
})
```

## 2. Get Daily Reward Emission Info for One Pool

Use `sdk.Rewarder.emissionsEveryDay()` method.

### Parameters

- `pool_id`: The pool object ID

### Example

```typescript
const pool_id = '0x83c101a55563b037f4cd25e5b326b26ae6537dc8048004c1408079f7578dd160'
const emissions_everyday = await sdk.Rewarder.emissionsEveryDay(pool_id)
```

## 3. Get Rewards of Position

Use `sdk.Rewarder.batchFetchPositionRewarders()` method.

### Parameters

- `position_ids`: Array of position object ID

### Example

```typescript
const position_ids = ['0xf10d37cc00bcd60f85cef3fe473ea979e3f7f3631d522618e80c876b349e56bc']
const pos_rewarders_amount = await sdk.Rewarder.batchFetchPositionRewarders(position_ids)
```
