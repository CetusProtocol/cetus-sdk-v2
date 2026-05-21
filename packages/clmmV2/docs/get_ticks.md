# Get ticks

## 1. Batch get ticks by pool ID

Use `SDK.Pool.fetchTicks()` method.

### Parameters

- `pool_id`: The pool object ID
- `coin_type_a`: Coin A type
- `coin_type_b`: Coin B type

### Example

```typescript
const pool_id = '0xbed3136f15b0ea649fb94bcdf9d3728fb82ba1c3e189bf6062d78ff547850054'
const coin_type_a = '0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::usdt::USDT'
const coin_type_b = '0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::cetus::CETUS'
const tick_data = await sdk.Pool.fetchTicks({
  pool_id,
  coin_type_a,
  coin_type_b,
})
```

## 2.Batch get ticks by tickHandle

Use `sdk.Pool.fetchTicksByRpc()` method.

### Parameters

- `tick_handle`: The tick handle of pool.

### Example

```typescript
const pool = await sdk.Pool.getPool('0x6fd4915e6d8d3e2ba6d81787046eb948ae36fdfc75dad2e24f0d4aaa2417a416')
const tick_data = await sdk.Pool.fetchTicksByRpc(pool.ticks_handle)
```
