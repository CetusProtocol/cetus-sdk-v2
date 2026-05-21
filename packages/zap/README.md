# @cetusprotocol/zap-sdk

The SDK provides a Zap module for specialized liquidity operations with different modes to suit various trading strategies. This module enables users to perform complex liquidity operations with flexibility in how they want to manage their positions.

## Getting Started

## How to Use the Zap SDK ?

### Installation

To start using the `Zap SDK`, you first need to install it in your TypeScript project:

npm link: <https://www.npmjs.com/package/@cetusprotocol/zap-sdk>

```bash
npm install @cetusprotocol/zap-sdk
```

### Setup

Import the SDK into the TypeScript file where you intend to use it:

```typescript
import { CetusZapSDK } from '@cetusprotocol/zap-sdk'
```

### Initializing the SDK

Initialize the SDK with the required configuration parameters. This typically includes setting up the network and API keys, if needed.

If you would like to use the mainnet network and the official Sui rpc url, you can do so as follows:

```typescript
const sdk = CetusZapSDK.createSDK()
```

If you wish to set your own full node URL or network (You have the option to select either 'mainnet' or 'testnet' for the network), you can do so as follows:

```typescript
const env = 'mainnet'
const full_rpc_url = 'YOUR_FULL_NODE_URL'
const wallet = 'YOUR_WALLET_ADDRESS'

const sdk = CetusZapSDK.createSDK({ env })
```

If you wish to set your own full node URL or SuiGrpcClient, you can do so as follows:

```typescript
const sdk = CetusZapSDK.createSDK({ env, sui_client })
// or
const sdk = CetusZapSDK.createSDK({ env, full_rpc_url })
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

- `pool_id`: The ID of the liquidity pool
- `tick_lower` & `tick_upper`: Price range boundaries for the position
- `current_sqrt_price`: Current square root price of the pool
- `slippage`: Maximum acceptable price slippage (e.g., 0.01 for 1%)
- `coin_type_a` & `coin_type_b`: Coin type identifiers for the trading pair
- `coin_decimal_a` & `coin_decimal_b`: Decimal places for each coin type

### 1. Deposit Operations

#### Deposit Mode-Specific Parameters

1. **FixedOneSide**

   - `fixed_amount`: Fixed amount to deposit
   - `fixed_coin_a`: Boolean indicating whether to fix coin A (true) or coin B (false)

2. **FlexibleBoth** (This feature will be supported in a future release, currently a placeholder)

   - `coin_amount_a`: Amount of coin A to deposit
   - `coin_amount_b`: Amount of coin B to deposit

3. **OnlyCoinA/OnlyCoinB**
   - `coin_amount`: Amount of single coin to deposit

#### Deposit Usage Example

```typescript
// Initialize SDK and get pool information
const sdk = CetusZapSDK.createSDK({ env: 'mainnet' })

const pool_id = 'YOUR_POOL_ID'
const pool = await sdk.CetusClmmSDK.Pool.getPool(pool_id)

// Pre-calculate deposit amounts (example: FixedOneSide mode)
const result = await sdk.Zap.preCalculateDepositAmount(
  {
    pool_id,
    tick_lower,
    tick_upper,
    current_sqrt_price: pool.current_sqrt_price.toString(),
    slippage: 0.01,
  },
  {
    mode: 'FixedOneSide',
    fixed_amount: toDecimalsAmount(1, 6).toString(),
    fixed_coin_a: false,
  }
)

const pos_id = 'YOUR_POSITION_ID'
// Build and send transaction
const tx = await sdk.Zap.buildDepositPayload({
  deposit_obj: result,
  pool_id,
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
  tick_lower,
  tick_upper,
  slippage: 0.01,
  pos_obj: {
    // Optional: Add to existing position
    pos_id,
    collect_fee: false,
    collect_rewarder_types: [],
  },
})

// Simulate or send the transaction
const sim_result = await sdk.FullClient.sendSimulationTransaction(tx, wallet)
```

### 2. Withdraw Operations

Withdrawals require an existing position in the pool.

#### Withdraw Mode-Specific Parameters

1. **FixedOneSide**

   - `fixed_amount`: Fixed amount to withdraw
   - `fixed_coin_a`: Boolean indicating whether to withdraw coin A (true) or coin B (false)

2. **OnlyCoinA/OnlyCoinB**
   - `burn_liquidity`: Amount of liquidity to burn
   - `available_liquidity`: Total available liquidity in the position

#### Withdraw Usage Example

```typescript
// Get pool and position information
const pool = await sdk.CetusClmmSDK.Pool.getPool(pool_id)
const position = await sdk.CetusClmmSDK.Position.getPositionById(pos_id)

if (!pool || !position) {
  throw new Error('Pool or Position not found')
}

// Pre-calculate withdrawal (example: OnlyCoinA mode)
const result = await sdk.Zap.preCalculateWithdrawAmount({
  mode: 'OnlyCoinA',
  pool_id,
  tick_lower: position.tick_lower_index,
  tick_upper: position.tick_upper_index,
  current_sqrt_price: pool.current_sqrt_price.toString(),
  burn_liquidity: '200000',
  available_liquidity: position.liquidity.toString(),
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
  coin_decimal_a: 6,
  coin_decimal_b: 9,
})

// Build and send transaction
const tx = await sdk.Zap.buildWithdrawPayload({
  withdraw_obj: result,
  pool_id,
  pos_id,
  close_pos: false, // Whether to close the position
  collect_fee: true, // Whether to collect accumulated fees
  collect_rewarder_types: [], // Types of rewards to collect
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
  tick_lower: position.tick_lower_index,
  tick_upper: position.tick_upper_index,
  slippage: 0.01,
})

// Simulate or send the transaction
const simulate_result = await sdk.FullClient.sendSimulationTransaction(tx, wallet)
```

## More About Cetus

Use the following links to learn more about Cetus:

Learn more about working with Cetus in the [Cetus Documentation](https://cetus-1.gitbook.io/cetus-docs).

Join the Cetus community on [Cetus Discord](https://discord.com/channels/1009749448022315008/1009751382783447072).

## License

MIT
