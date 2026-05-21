# @cetusprotocol/farms-sdk

The SDK provides a Farms module for managing farming positions, liquidity, and rewards in the Cetus ecosystem. This module enables users to perform various farming operations with flexibility in how they want to manage their positions.

## Getting Started

## How to Use the Farms SDK?

### Installation

To start using the `Farms SDK`, you first need to install it in your TypeScript project:

npm link: <https://www.npmjs.com/package/@cetusprotocol/farms-sdk>

```bash
npm install @cetusprotocol/farms-sdk
```

### Setup

Import the SDK into the TypeScript file where you intend to use it:

```typescript
import { CetusFarmsSDK } from '@cetusprotocol/farms-sdk'
```

### Initializing the SDK

Initialize the SDK with the required configuration parameters. This typically includes setting up the network environment.

If you would like to use the mainnet network and the official Sui rpc url, you can do so as follows:

```typescript
const sdk = CetusFarmsSDK.createSDK()
```

If you wish to set your own full node URL or network (You have the option to select either 'mainnet' or 'testnet' for the network), you can do so as follows:

```typescript
const env = 'mainnet'
const full_rpc_url = 'YOUR_FULL_NODE_URL'
const wallet = 'YOUR_WALLET_ADDRESS'

const sdk = CetusFarmsSDK.createSDK({ env })
```

If you wish to set your own full node URL or SuiGrpcClient, you can do so as follows:

```typescript
const sdk = CetusFarmsSDK.createSDK({ env, sui_client })
// or
const sdk = CetusFarmsSDK.createSDK({ env, full_rpc_url })
```

## Usage

After linking your wallet, if you need use your wallet address to do something, you should set it by `sdk.setSenderAddress`.

```typescript
const wallet = 'YOUR_WALLET_ADDRESS'

sdk.setSenderAddress(wallet)
```

if you need to change your rpc url, you can do so as follows:

```typescript
const new_rpc_url = 'YOUR_NEW_FULL_NODE_URL'

sdk.updateFullRpcUrl(new_rpc_url)
```

### Common Parameters

- `pool_id`: The ID of the farms pool
- `position_nft_id`: The ID of the position NFT
- `clmm_position_id`: The ID of the CLMM position
- `coin_type_a` & `coin_type_b`: Coin type identifiers for the trading pair
- `amount_a` & `amount_b`: Amounts of coins to deposit/withdraw

### 1. Farms Pool Operations

#### Get Farms Pool List

```typescript
const pool_data = await sdk.Farms.getFarmsPoolList()
```

#### Get Specific Farms Pool

```typescript
const pool_id = 'YOUR_POOL_ID'

const pool_data = await sdk.Farms.getFarmsPool(pool_id)
```

#### Get Owned Position NFTs

```typescript
const nft_list = await sdk.Farms.getOwnedFarmsPositionNFTList(wallet)
```

#### Get Position NFT Details

```typescript
const position_nft_id = 'YOUR_POSITION_NFT_ID'

const nft_data = await sdk.Farms.getFarmsPositionNFT(position_nft_id)
```

### 2. Farming Operations

#### Deposit (Stake) Position

```typescript
const clmm_position_id = 'YOUR_CLMM_POSITION_ID'

const payload = sdk.Farms.depositPayload({
  pool_id,
  clmm_position_id,
})
```

#### Withdraw (Unstake) Position

```typescript
const payload = await sdk.Farms.withdrawPayload({
  pool_id,
  position_nft_id,
})
```

#### Harvest Rewards

```typescript
const payload = await sdk.Farms.harvestPayload({
  pool_id,
  position_nft_id,
})
```

#### Batch Harvest and Collect CLMM Fees

```typescript
const clmm_pool_id = 'YOUR_CLMM_POOL_ID'
const coin_type_a = '0xac2afb455cbcdc2ff1a2e9bbb8aa4ccb4506a544b08c740886892a5cdf92f472::hasui::HASUI'
const coin_type_b = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI'
const farms_list = [
  {
    pool_id,
    position_nft_id,
    clmm_pool_id,
    collect_fee: true,
    collect_farms_rewarder: false,
    clmm_rewarder_types: ['CLMM_REWARDER_TYPE_1'],
    coin_type_a,
    coin_type_b,
  },
]
const clmm_list = [
  {
    pool_id,
    pos_id: position_nft_id,
    collect_fee: true,
    rewarder_coin_types: ['CLMM_REWARDER_TYPE_1'],
    coin_type_a,
    coin_type_b,
  },
]
const payload = await sdk.Farms.batchHarvestAndClmmFeePayload(farms_list, clmm_list)
```

### 3. Liquidity Operations

#### Add Liquidity to Position

```typescript
const amount_a = 'AMOUNT_A'
const amount_b = 'AMOUNT_B'

const payload = await sdk.Farms.addLiquidityFixCoinPayload({
  pool_id,
  coin_type_a,
  coin_type_b,
  position_nft_id,
  clmm_pool_id,
  amount_a,
  amount_b,
  fix_amount_a: true,
  collect_fee: true,
  collect_rewarder: true,
  clmm_rewarder_types: ['CLMM_REWARDER_TYPE_1'],
})
```

#### Remove Liquidity

```typescript
const min_amount_a = 'MIN_AMOUNT_A'
const min_amount_b = 'MIN_AMOUNT_B'
const liquidity = 'LIQUIDITY'

const payload = await sdk.Farms.removeLiquidityPayload({
  pool_id,
  coin_type_a,
  coin_type_b,
  position_nft_id,
  clmm_pool_id,
  min_amount_a,
  min_amount_b,
  collect_rewarder: true,
  clmm_rewarder_types: [],
  delta_liquidity: liquidity,
  unstake: true,
  close_position: false,
})
```

### 4. Reward Operations

#### Claim Fees and CLMM Rewards

```typescript
const payload = await sdk.Farms.claimFeeAndClmmReward({
  pool_id,
  position_nft_id,
})
```

### 5. Contract Error Codes

the Cetus smart contract may return the following error codes:

| Module               | Error Code | Description                | Contract Methods                                                                     |
| -------------------- | ---------- | -------------------------- | ------------------------------------------------------------------------------------ |
| stable_farming::pool | 1          | Invalid CLMM Pool ID       | collect_clmm_reward, collect_fee                                                     |
| stable_farming::pool | 2          | Pool Position Not Match    | remove_liquidity, deposit，withdraw，harvest ，add_liquidity，add_liquidity_fix_coin |
| stable_farming::pool | 3          | Pool CLMM Pool Not Match   | remove_liquidity, add_liquidity ，add_liquidity_fix_coin                             |
| stable_farming::pool | 4          | Rewarder Not Harvested     | withdraw，                                                                           |
| stable_farming::pool | 5          | Effective Range Error      | check_effective_range                                                                |
| stable_farming::pool | 6          | Rewarder Not Exists        | harvest                                                                              |
| stable_farming::pool | 7          | Rewarder Already Exists    | add_rewarder                                                                         |
| stable_farming::pool | 8          | Pool Has No Rewarder       | deposit                                                                              |
| stable_farming::pool | 9          | Start Error                | update_effective_tick_range                                                          |
| stable_farming::pool | 10         | Invalid Tick Range         | calculate_position_share                                                             |
| stable_farming::pool | 11         | Invalid Sqrt Price         | calculate_position_share                                                             |
| stable_farming::pool | 12         | Amount In Above Max Limit  | add_liquidity_fix_coin_to_clmm，add_liquidity_to_clmm                                |
| stable_farming::pool | 15         | Amount Out Below Min Limit | remove_liquidity_from_clmm                                                           |

## More About Cetus

Use the following links to learn more about Cetus:

Learn more about working with Cetus in the [Cetus Documentation](https://cetus-1.gitbook.io/cetus-docs).

Join the Cetus community on [Cetus Discord](https://discord.com/channels/1009749448022315008/1009751382783447072).

## License

MIT
