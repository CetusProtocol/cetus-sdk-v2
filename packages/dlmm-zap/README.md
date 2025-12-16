# @cetusprotocol/zap-sdk

The SDK provides a Zap module for specialized liquidity operations with different modes to suit various trading strategies. This module enables users to perform complex liquidity operations with flexibility in how they want to manage their positions in DLMM (Dynamic Liquidity Market Maker) pools.

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
import { CetusDlmmZapSDK } from '@cetusprotocol/zap-sdk'
```

### Initializing the SDK

Initialize the SDK with the required configuration parameters. This typically includes setting up the network and API keys, if needed.

If you would like to use the mainnet network and the official Sui rpc url, you can do so as follows:

```typescript
const sdk = CetusDlmmZapSDK.createSDK({ env: 'mainnet' })
```

If you wish to set your own full node URL or network (You have the option to select either 'mainnet' or 'testnet' for the network), you can do so as follows:

```typescript
const env = 'mainnet'
const full_rpc_url = 'YOUR_FULL_NODE_URL'

const sdk = CetusDlmmZapSDK.createSDK({ env, full_rpc_url })
```

If you wish to set your own SuiClient, you can do so as follows:

```typescript
const sdk = CetusDlmmZapSDK.createSDK({ env, sui_client })
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
- `lower_bin_id` & `upper_bin_id`: Bin ID range boundaries for the position
- `active_id`: Current active bin ID of the pool
- `bin_step`: The bin step size of the pool
- `strategy_type`: Strategy type for the position (e.g., `StrategyType.Spot`)
- `slippage`: Maximum acceptable price slippage (e.g., 0.01 for 1%)
- `coin_type_a` & `coin_type_b`: Coin type identifiers for the trading pair
- `active_bin_of_pool`: Information about the active bin if it's within the position range

### 1. Deposit Operations

#### Deposit Mode-Specific Parameters

**OnlyCoinA/OnlyCoinB Mode**

- `fix_amount_a`: Boolean indicating whether to fix coin A (true) or coin B (false)
- `coin_amount`: Amount of single coin to deposit

#### Deposit Usage Example

**Create New Position**

```typescript
import { CetusDlmmZapSDK } from '@cetusprotocol/zap-sdk'
import { StrategyType, toDecimalsAmount } from '@cetusprotocol/common-sdk'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'

// Initialize SDK and get pool information
const sdk = CetusDlmmZapSDK.createSDK({ env: 'mainnet' })
const wallet = 'YOUR_WALLET_ADDRESS'
sdk.setSenderAddress(wallet)

const pool_id = 'YOUR_POOL_ID'
const pool = await sdk.DlmmSDK.Pool.getPool(pool_id)

if (!pool) {
  throw new Error('Pool not found')
}

const { active_id, bin_step, bin_manager } = pool

// Define your position range
const lower_bin_id = active_id
const upper_bin_id = active_id + 2

// Get active bin information if it's within range
const amounts_in_active_bin = await sdk.DlmmSDK.Position.getActiveBinIfInRange(
  bin_manager.bin_manager_handle,
  lower_bin_id,
  upper_bin_id,
  active_id,
  bin_step
)

// Pre-calculate deposit amounts (OnlyCoinB mode)
const result = await sdk.Zap.preCalculateDepositAmount(
  {
    pool_id,
    strategy_type: StrategyType.Spot,
    active_bin_of_pool: amounts_in_active_bin,
    lower_bin_id,
    upper_bin_id,
    active_id: pool.active_id,
    bin_step: pool.bin_step,
  },
  {
    fix_amount_a: false, // false means fix coin B
    coin_amount: toDecimalsAmount(0.1, 9).toString(), // Amount of coin B
  }
)

// Build transaction
const tx = await sdk.Zap.buildDepositPayload({
  deposit_obj: result,
  pool_id,
  strategy_type: StrategyType.Spot,
  lower_bin_id,
  upper_bin_id,
  active_id: pool.active_id,
  bin_step: pool.bin_step,
  slippage: 0.01,
})

// Execute the transaction
// Note: send_key_pair should be your wallet's keypair or signer
// For example: const send_key_pair = new Ed25519Keypair(...)
const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
```

**Add Liquidity to Existing Position**

```typescript
const pos_id = 'YOUR_POSITION_ID'
const position = await sdk.DlmmSDK.Position.getPosition(pos_id)
const { lower_bin_id, upper_bin_id } = position

// Get active bin information if it's within range
const amounts_in_active_bin = await sdk.DlmmSDK.Position.getActiveBinIfInRange(
  bin_manager.bin_manager_handle,
  lower_bin_id,
  upper_bin_id,
  active_id,
  bin_step
)

const result = await sdk.Zap.preCalculateDepositAmount(
  {
    pool_id,
    strategy_type: StrategyType.Spot,
    active_bin_of_pool: amounts_in_active_bin,
    lower_bin_id,
    upper_bin_id,
    active_id: pool.active_id,
    bin_step: pool.bin_step,
  },
  {
    fix_amount_a: true, // true means fix coin A
    coin_amount: toDecimalsAmount(0.5, 6).toString(), // Amount of coin A
  }
)

// Build transaction with position object
const tx = await sdk.Zap.buildDepositPayload({
  deposit_obj: result,
  pool_id,
  strategy_type: StrategyType.Spot,
  lower_bin_id,
  upper_bin_id,
  active_id: pool.active_id,
  bin_step: pool.bin_step,
  slippage: 0.01,
  pos_obj: {
    pos_id,
    collect_fee: false,
    collect_rewarder_types: [],
  },
})

// Execute the transaction
// Note: send_key_pair should be your wallet's keypair or signer
const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
```

### 2. Withdraw Operations

Withdrawals require an existing position in the pool.

#### Withdraw Mode-Specific Parameters

1. **OnlyCoinA/OnlyCoinB**

   - `expected_receive_amount`: Expected amount to receive
   - `is_receive_coin_a`: Boolean indicating whether to receive coin A (true) or coin B (false)
   - `mode`: Withdrawal mode - `'OnlyCoinA'`, `'OnlyCoinB'`, or `'Both'`

2. **Both**
   - `expected_receive_amount`: Expected amount to receive (will be split between both coins)
   - `is_receive_coin_a`: Boolean indicating which coin the expected amount refers to
   - `mode`: Set to `'Both'`

#### Withdraw Usage Example

**Calculate Available Withdraw Amount**

```typescript
import { parseLiquidityShares } from '@cetusprotocol/dlmm-sdk'

const pool_id = 'YOUR_POOL_ID'
const pos_id = 'YOUR_POSITION_ID'

// Get pool and position information
const pool = await sdk.DlmmSDK.Pool.getPool(pool_id)
const position = await sdk.DlmmSDK.Position.getPosition(pos_id)

if (!pool || !position) {
  throw new Error('Pool or Position not found')
}

const { bin_step, bin_manager, active_id } = pool
const { lower_bin_id, liquidity_shares } = position

// Get active bin information
const active_bin = await sdk.DlmmSDK.Pool.getBinInfo(
  bin_manager.bin_manager_handle,
  active_id,
  bin_step
)

// Parse liquidity shares to get bin range
const liquidity_shares_data = parseLiquidityShares(
  liquidity_shares,
  bin_step,
  lower_bin_id,
  active_bin
)

// Calculate available withdraw amount
const available_obj = sdk.Zap.calculateZapOutAvailableAmount({
  remove_bin_range: liquidity_shares_data.bins,
  active_id,
  bin_step,
  is_receive_coin_a: false, // Receive coin B
  mode: 'OnlyCoinB',
})

console.log('Available withdraw amount:', available_obj)
```

**Withdraw in OnlyCoinB Mode**

```typescript
import { toDecimalsAmount } from '@cetusprotocol/common-sdk'

const { coin_type_a, coin_type_b, bin_step, bin_manager, active_id, reward_manager } = pool
const slippage = 0.01
const is_receive_coin_a = false
const expected_receive_amount = toDecimalsAmount(0.05, 9).toString() // Amount of coin B
const mode = 'OnlyCoinB'

// Get active bin and parse liquidity shares
const active_bin = await sdk.DlmmSDK.Pool.getBinInfo(
  bin_manager.bin_manager_handle,
  active_id,
  bin_step
)
const liquidity_shares_data = parseLiquidityShares(
  liquidity_shares,
  bin_step,
  lower_bin_id,
  active_bin
)

// Pre-calculate withdrawal
const result = await sdk.Zap.preCalculateWithdrawAmount({
  remove_bin_range: liquidity_shares_data.bins,
  active_id,
  bin_step,
  expected_receive_amount,
  is_receive_coin_a,
  mode,
  coin_type_a,
  coin_type_b,
})

// Build transaction
const tx = await sdk.Zap.buildWithdrawPayload({
  withdraw_obj: result,
  swap_slippage: 0.01,
  pool_id,
  position_id: pos_id,
  active_id,
  bin_step,
  slippage,
  reward_coins: reward_manager.rewards.map((reward) => reward.reward_coin),
  collect_fee: true,
  remove_percent: Number(result.remove_percent),
  coin_type_a,
  coin_type_b,
  is_close_position: false, // Set to true to close the position
})

// Execute the transaction
// Note: send_key_pair should be your wallet's keypair or signer
const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
```

**Withdraw in Both Mode**

```typescript
const mode = 'Both'
const expected_receive_amount = toDecimalsAmount(0.05, 9).toString()
const is_receive_coin_a = false

const result = await sdk.Zap.preCalculateWithdrawAmount({
  remove_bin_range: liquidity_shares_data.bins,
  active_id,
  bin_step,
  expected_receive_amount,
  is_receive_coin_a,
  mode,
  coin_type_a,
  coin_type_b,
})

const tx = await sdk.Zap.buildWithdrawPayload({
  withdraw_obj: result,
  swap_slippage: 0.01,
  pool_id,
  position_id: pos_id,
  active_id,
  bin_step,
  slippage,
  reward_coins: reward_manager.rewards.map((reward) => reward.reward_coin),
  collect_fee: true,
  remove_percent: Number(result.remove_percent),
  coin_type_a,
  coin_type_b,
  is_close_position: true, // Close the position
})

// Execute the transaction
// Note: send_key_pair should be your wallet's keypair or signer
const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
```

## More About Cetus

Use the following links to learn more about Cetus:

Learn more about working with Cetus in the [Cetus Documentation](https://cetus-1.gitbook.io/cetus-docs).

Join the Cetus community on [Cetus Discord](https://discord.com/channels/1009749448022315008/1009751382783447072).

## License

MIT
