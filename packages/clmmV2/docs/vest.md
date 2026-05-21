# Vest Module Documentation

This document provides an overview of the Vest module functionality in the Cetus SDK, which handles vesting-related operations for CLMM (Concentrated Liquidity Market Maker) positions.

## Core Concepts

### Vesting Information
The vesting system allows users to lock their liquidity positions for a specified period, earning rewards in return. The module provides various methods to interact with and manage these vesting positions.

## API Methods

### 1. Get CLMM Vest Info List
Retrieves a list of all vesting information for CLMM positions.

```typescript
import { CetusClmmSDK } from '@cetusprotocol/clmm-sdk'

const sdk = CetusClmmSDK.createSDK({ env: 'mainnet' })
const vestInfoList = await sdk.Vest.getClmmVestInfoList()
```

### 2. Get CLMM Vest Info
Retrieves specific vesting information for a CLMM position.

```typescript
const vestInfo = await sdk.Vest.getClmmVestInfo()
```

### 3. Get Pool Liquidity Snapshot
Retrieves liquidity snapshot information for a specific pool and its positions.

```typescript
const poolSnapshot = await sdk.Pool.getPoolLiquiditySnapshot(pool_id)
const { remove_percent, snapshots } = poolSnapshot

// Get position snapshot
const posSnap = await sdk.Pool.getPositionSnapshot(snapshots.id, position_ids)
```

### 4. Get Position Vesting
Retrieves vesting information for specific positions in a pool.

```typescript
const vestingList = await sdk.Vest.getPositionVesting([
  {
    clmm_position_ids: ['position_id_1', 'position_id_2'],
    clmm_pool_id: 'pool_id',
    coin_type_a: 'coin_type_a',
    coin_type_b: 'coin_type_b'
  }
])
```

### 5. Redeem Vesting Position
Redeems a vested position to claim rewards.

```typescript
const tx = sdk.Vest.buildRedeemPayload([
  {
    clmm_pool_id: pool.id,
    clmm_position_id: position_id,
    period: 0,
    coin_type_a: pool.coin_type_a,
    coin_type_b: pool.coin_type_b
  }
])

// Execute the transaction
const transferTxn = await sdk.FullClient.executeTx(keyPair, tx, false)
```

## Parameters

### Vesting Position Parameters
- `clmm_pool_id`: The ID of the CLMM pool
- `clmm_position_ids`: Array of position IDs to check vesting status
- `coin_type_a`: Type of the first token in the pool
- `coin_type_b`: Type of the second token in the pool
- `period`: The vesting period (0 for immediate redemption)

### Snapshot Parameters
- `pool_id`: The ID of the pool to get snapshot for
- `position_ids`: Array of position IDs to get snapshot for
- `remove_percent`: Percentage of liquidity removed
- `snapshots`: Snapshot information containing position details

## Notes

1. **Vesting Period**
   - Positions can be vested for different periods
   - Rewards are typically proportional to the vesting period

2. **Redemption**
   - Positions can be redeemed after the vesting period
   - Rewards are distributed upon redemption

3. **Pool Snapshots**
   - Snapshots track liquidity changes in pools
   - Used to calculate rewards and vesting status

4. **Position Management**
   - Multiple positions can be managed simultaneously
   - Each position can have different vesting parameters
