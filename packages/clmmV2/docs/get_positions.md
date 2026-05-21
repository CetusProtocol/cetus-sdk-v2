# Get Positions

## 1. Get all positions of one pool by ownerAddress

Use `sdk.Position.getPositionList()` method.

### Function Parameters

- `account_address`: The user account address
- `assign_pool_ids`: An array of pool ID
- `show_display`: When some testnet rpc nodes can't return object's display data, you can set this option to false to avoid returning errors. Default is true.

### Example

```typescript
const account_address = '0xcd0247d0b67e53dde69b285e7a748e3dc390e8a5244eb9dd9c5c53d95e4cf0aa'
const assign_pool_ids = ['0x83c101a55563b037f4cd25e5b326b26ae6537dc8048004c1408079f7578dd160']
const res = await sdk.Position.getPositionList(account_address, assign_pool_ids, false)
```

## 2. Get all positions of one pool

Use `sdk.Pool.getPositionList()` method.

### Function Parameters

- `position_handle`: The position handle of pool

### Example

```typescript
const position_handle = '0x83c101a55563b037f4cd25e5b326b26ae6537dc8048004c1408079f7578dd160'
const pool = await sdk.Pool.getPool(position_handle)
const res = await sdk.Pool.getPositionList(pool.position_manager.positions_handle)
```

## 3. Get one position

Use `sdk.Position.getPositionById()` method.

### Function Parameters

- `position_id`: The position object ID
- `calculate_rewarder`: Whether to calculate the rewarder of the position
- `show_display`: When some testnet rpc nodes can't return object's display data, you can set this option to false to avoid returning errors. Default is true.

### Example

```typescript
const position_id = '0xfbf94213d59d285f66bacdb3d667a4db00b491af35887022e9197bb244705bde'
const res = await sdk.Position.getPositionById(position_id)
```


## 3. Get detailed position information

Use `sdk.Position.getPositionInfoList()` method.

This method retrieves the actual liquidity of impaired positions after trimming. For normal positions, the liquidity value obtained from `getPositionInfoList` is consistent with the liquidity value obtained from `getPositionList`.

### Function Parameters

- `position_info_list`: An array of objects containing `position_handle` and `position_ids`.

### Example

```typescript
const pos_id = '0x59c5d04778b40c333fd....'
const pos = await sdk.Position.getPositionById(pos_id, false)
const pool = await sdk.Pool.getPool(pos.pool)
const parentId = pool.position_manager.positions_handle
const res = await sdk.Position.getPositionInfoList([
  {
    position_handle: parentId,
    position_ids: [pos_id],
  },
])
```




## 4. Batch get position fees

Use `sdk.Position.batchFetchPositionFees()` method.

### Function Parameters

- `position_ids`: An array of position ID

### Example

```typescript
const position_ids = [
  '0xf10d37cc00bcd60f85cef3fe473ea979e3f7f3631d522618e80c876b349e56bc',
  '0xfbf94213d59d285f66bacdb3d667a4db00b491af35887022e9197bb244705bde',
]
const fees = await TestnetSDK.Position.batchFetchPositionFees(position_ids)
```
