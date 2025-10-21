# @cetusprotocol/dlmm-sdk

The SDK provides a DLMM (Dynamic Liquidity Market Maker) module for specialized liquidity operations with different modes to suit various trading strategies. This module enables users to perform complex liquidity operations with flexibility in how they want to manage their positions.

## Features

- **Multiple Liquidity Strategies**: Spot, BidAsk, and Curve strategies for different trading approaches
- **Comprehensive Pool Management**: Create, query, and manage DLMM pools
- **Advanced Position Management**: Add/remove liquidity, collect fees and rewards
- **Flexible Swap Operations**: Support for both A-to-B and B-to-A swaps
- **Partner Integration**: Built-in partner and referral system
- **Rich Utility Functions**: Bin calculations, price conversions, and liquidity management tools
- **Multi-Network Support**: Works with both mainnet and testnet

## Getting Started

## How to Use the DLMM SDK?

### Installation

To start using the `DLMM SDK`, you first need to install it in your TypeScript project:

```bash
npm install @cetusprotocol/dlmm-sdk
```

### Setup

Import the SDK into the TypeScript file where you intend to use it:

```typescript
import { CetusDlmmSDK } from '@cetusprotocol/dlmm-sdk'
```

### Initializing the SDK

Initialize the SDK with the required configuration parameters. This typically includes setting up the network if needed.

**Option 1: Use default mainnet configuration**
```typescript
const sdk = CetusDlmmSDK.createSDK()
```

**Option 2: Specify network environment**
```typescript
// For mainnet
const sdk = CetusDlmmSDK.createSDK({ env: 'mainnet' })

// For testnet
const sdk = CetusDlmmSDK.createSDK({ env: 'testnet' })
```

**Option 3: Use custom RPC URL**
```typescript
const sdk = CetusDlmmSDK.createSDK({ 
  env: 'mainnet',
  full_rpc_url: 'YOUR_FULL_NODE_URL' 
})
```

**Option 4: Use custom SuiClient**
```typescript
import { SuiClient } from '@mysten/sui/client'

const suiClient = new SuiClient({ url: 'YOUR_RPC_URL' })
const sdk = CetusDlmmSDK.createSDK({ env: 'mainnet', sui_client: suiClient })
```

## Usage

After linking your wallet, if you need use your wallet address to do something, you should set it by `sdk.setSenderAddress`.

```typescript
const wallet = 'YOUR_WALLET_ADDRESS'
sdk.setSenderAddress(wallet)
```

If you need to change your RPC URL, you can do so as follows:

```typescript
const new_rpc_url = 'YOUR_NEW_FULL_NODE_URL'
sdk.updateFullRpcUrl(new_rpc_url)
```

### Common Parameters

- `pool_id`: The ID of the liquidity pool
- `bin_id`: The ID of the bin in the pool
- `bin_step`: The step size between bins
- `coin_type_a` & `coin_type_b`: Coin type identifiers for the trading pair
- `coin_decimal_a` & `coin_decimal_b`: Decimal places for each coin type

### Default Fee Options

The SDK provides predefined fee configurations for different types of trading pairs. These configurations are optimized based on asset volatility and market characteristics:

```typescript
const dlmmDefaultFeeOptions = [
  { binStep: 1, baseFactor: 10000, fee: '0.0001' },
  { binStep: 1, baseFactor: 20000, fee: '0.0002' },
  { binStep: 2, baseFactor: 15000, fee: '0.0003' },
  { binStep: 2, baseFactor: 20000, fee: '0.0004' },
  { binStep: 5, baseFactor: 10000, fee: '0.0005' },
  { binStep: 10, baseFactor: 10000, fee: '0.001' },
  { binStep: 15, baseFactor: 10000, fee: '0.0015' },
  { binStep: 20, baseFactor: 10000, fee: '0.002' },
  { binStep: 25, baseFactor: 10000, fee: '0.0025' },
  { binStep: 30, baseFactor: 10000, fee: '0.003' },
  { binStep: 50, baseFactor: 8000, fee: '0.004' },
  { binStep: 80, baseFactor: 7500, fee: '0.006' },
  { binStep: 100, baseFactor: 8000, fee: '0.008' },
  { binStep: 100, baseFactor: 10000, fee: '0.01' },
  { binStep: 200, baseFactor: 10000, fee: '0.02' },
  { binStep: 400, baseFactor: 10000, fee: '0.04' }
]
```

**Parameter Explanations:**

- **`binStep`**: The step size between bins, determining the price granularity of the pool. Smaller values provide finer price resolution but require more computational resources.
- **`baseFactor`**: A multiplier used in fee calculations, affecting the overall fee structure of the pool.
- **`fee`**: The trading fee rate as a decimal (e.g., '0.0001' = 0.01%). This is the fee charged for each swap transaction.

**Fee Tier Recommendations:**

- **Low fees (0.01% - 0.05%)**: Best for stable pairs or low-volatility mainstream assets
- **Medium fees (0.1% - 0.3%)**: Suitable for medium-volatility assets or mainstream trading pairs
- **High fees (0.4% - 4%)**: Recommended for high-volatility assets, altcoins, or small market cap pairs

When creating a new pool, choose the fee configuration that best matches your trading pair's characteristics:

```typescript
// Example: Create a pool for a stable pair (USDC/USDT)
const stablePairConfig = { binStep: 1, baseFactor: 10000, fee: '0.0001' }

// Example: Create a pool for a volatile altcoin pair
const altcoinConfig = { binStep: 100, baseFactor: 10000, fee: '0.01' }
```

### 1. Pool Operations

#### Get Pool Information

```typescript
// Get all pools
const pools = await sdk.Pool.getPools()

// Get specific pool
const pool = await sdk.Pool.getPool(pool_id)

// Get specific pools by their IDs
const assign_pools = await sdk.Pool.getAssignPoolList([
  '0x...',
  // Add more pool IDs as needed
])

// Get bin information
const bin_info = await sdk.Pool.getBinInfo(pool_id, bin_id, bin_step)

// Get pool bin information
const pool_bin_info = await sdk.Pool.getPoolBinInfo(pool_id)

// Get bin step configurations
const bin_step_configs = await sdk.Pool.getBinStepConfigs()

// Get pool transaction list
const pool_transactions = await sdk.Pool.getPoolTransactionList({
  pool_id: '0x...',
  pagination_args: { limit: 10 }
})
```

#### Create Pool

There are two ways to create a pool:

**Method 1: Create Pool Only**

```typescript
// Create a new pool without adding liquidity
const bin_step = 2
const base_factor = 10000
const price = '1.1'
const active_id = BinUtils.getBinIdFromPrice(price, bin_step, true, 6, 6)

const tx = new Transaction()
await sdk.Pool.createPoolPayload({
  active_id,
  bin_step,
  coin_type_a: '0x...::usdc::USDC',
  coin_type_b: '0x...::usdt::USDT',
  base_factor,
}, tx)
```

**Method 2: Create Pool and Add Liquidity in One Transaction**

```typescript
// Create pool and add liquidity in one transaction
const bin_step = 2
const base_factor = 10000
const price = '1.1'
const active_id = BinUtils.getBinIdFromPrice(price, bin_step, true, 6, 6)

// Calculate liquidity distribution
const bin_infos = sdk.Position.calculateAddLiquidityInfo({
  active_id,
  bin_step,
  lower_bin_id: active_id - 10,
  upper_bin_id: active_id + 10,
  amount_a_in_active_bin: '0',
  amount_b_in_active_bin: '0',
  strategy_type: StrategyType.Spot,
  coin_amount: '10000000',
  fix_amount_a: true,
})

const createAndAddTx = await sdk.Pool.createPoolAndAddLiquidityPayload({
  active_id,
  lower_bin_id: active_id - 10,
  upper_bin_id: active_id + 10,
  bin_step,
  bin_infos,
  coin_type_a: '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::usdc::USDC',
  coin_type_b: '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::eth::ETH',
  strategy_type: StrategyType.Spot,
  use_bin_infos: false,
  base_factor,
})
```

### 2. Position Operations

#### Get Position Information

```typescript
// Get owner's position list
const positions = await sdk.Position.getOwnerPositionList(wallet)

// Get specific position
const position = await sdk.Position.getPosition(position_id)
```

### 3. Fee Operations

#### Fee and Reward Calculation

To calculate fees and rewards for a position, you can use the `fetchPositionFeeAndReward` method. This method allows you to get both fee and reward data for one or multiple positions:

```typescript
// First get the pool information
const pool = await sdk.Pool.getPool(pool_id)
const { id, coin_type_a, coin_type_b, reward_manager } = pool

// Fetch fee and reward data
const { feeData, rewardData } = await sdk.Position.fetchPositionFeeAndReward([
  {
    pool_id: id,
    position_id: position_id,
    reward_coins: reward_manager.rewards.map((reward) => reward.reward_coin),
    coin_type_a,
    coin_type_b,
  },
])

```

#### Fee Rate Calculations

```typescript
// Get total fee rate for a pool
const totalFeeRate = await sdk.Pool.getTotalFeeRate({
  pool_id,
  coin_type_a,
  coin_type_b
})

// Get variable fee from pool parameters
const variableFee = FeeUtils.getVariableFee(pool.variable_parameters)
console.log('Variable fee:', variableFee)
console.log('Variable fee percentage:', d(variableFee).div(d(FEE_PRECISION)).toString())
```

**getTotalFeeRate Return Value**

The `getTotalFeeRate` method returns a `FeeRate` object containing the following fields:

```typescript
type FeeRate = {
  base_fee_rate: string    // Base fee rate
  var_fee_rate: string     // Variable fee rate
  total_fee_rate: string   // Total fee rate
}
```

**Field Descriptions:**

- **`base_fee_rate`**: Base fee rate, calculated from the pool's `bin_step` and `base_factor`, is a fixed value
- **`var_fee_rate`**: Variable fee rate, dynamically calculated based on the pool's volatility accumulator (`volatility_accumulator`), changes with market volatility
- **`total_fee_rate`**: Total fee rate, equals `base_fee_rate + var_fee_rate`, but will not exceed the maximum fee rate limit (`MAX_FEE_RATE = 100,000,000`)

**Fee Rate Precision:**
- All fee rate values use `FEE_PRECISION = 1,000,000,000` as the precision unit
- To get the actual percentage, divide the fee rate value by `FEE_PRECISION`
- Example: If `total_fee_rate` is `3000000`, the actual fee rate is `3000000 / 1000000000 = 0.003 = 0.3%`

**Usage Example:**
```typescript
const feeRate = await sdk.Pool.getTotalFeeRate({
  pool_id: "0x...",
  coin_type_a: "0x...",
  coin_type_b: "0x..."
})

// Calculate actual percentages
const baseFeePercentage = d(feeRate.base_fee_rate).div(d(FEE_PRECISION)).mul(100).toString()
const varFeePercentage = d(feeRate.var_fee_rate).div(d(FEE_PRECISION)).mul(100).toString()
const totalFeePercentage = d(feeRate.total_fee_rate).div(d(FEE_PRECISION)).mul(100).toString()

console.log(`Base fee rate: ${baseFeePercentage}%`)
console.log(`Variable fee rate: ${varFeePercentage}%`)
console.log(`Total fee rate: ${totalFeePercentage}%`)
```

#### FeeUtils Utility Methods

The `FeeUtils` class provides several utility methods for fee calculations:

**1. `getVariableFee(variableParameters: VariableParameters): string`**

Calculates the variable fee based on pool parameters and market volatility.

```typescript
import { FeeUtils } from '@cetusprotocol/dlmm-sdk'

const variableFee = FeeUtils.getVariableFee(pool.variable_parameters)
console.log('Variable fee:', variableFee)
console.log('Variable fee percentage:', d(variableFee).div(d(FEE_PRECISION)).toString())
```

**2. `calculateCompositionFee(amount: string, total_fee_rate: string): string`**

Calculates composition fees for liquidity operations.

```typescript
const compositionFee = FeeUtils.calculateCompositionFee(amount, total_fee_rate)
```

**3. `calculateProtocolFee(fee_amount: string, protocol_fee_rate: string): string`**

Calculates protocol fees based on fee amount and protocol fee rate.

```typescript
const protocolFee = FeeUtils.calculateProtocolFee(fee_amount, protocol_fee_rate)
```

**4. `getProtocolFees(fee_a: string, fee_b: string, protocol_fee_rate: string)`**

Calculates protocol fees for both tokens in a pair.

```typescript
const { protocol_fee_a, protocol_fee_b } = FeeUtils.getProtocolFees(fee_a, fee_b, protocol_fee_rate)
console.log('Protocol fee A:', protocol_fee_a)
console.log('Protocol fee B:', protocol_fee_b)
```

**5. `getCompositionFees(active_bin: BinAmount, used_bin: BinAmount, variableParameters: VariableParameters)`**

Calculates composition fees for active and used bins, considering variable parameters.

```typescript
const { fees_a, fees_b } = FeeUtils.getCompositionFees(active_bin, used_bin, variableParameters)
console.log('Composition fees A:', fees_a)
console.log('Composition fees B:', fees_b)
```

**FeeUtils Methods Summary:**

| Method                    | Description                                 | Parameters                                     | Returns                            |
| ------------------------- | ------------------------------------------- | ---------------------------------------------- | ---------------------------------- |
| `getVariableFee`          | Calculate variable fee from pool parameters | `variableParameters`                           | `string`                           |
| `calculateCompositionFee` | Calculate composition fee for an amount     | `amount`, `total_fee_rate`                     | `string`                           |
| `calculateProtocolFee`    | Calculate protocol fee                      | `fee_amount`, `protocol_fee_rate`              | `string`                           |
| `getProtocolFees`         | Calculate protocol fees for both tokens     | `fee_a`, `fee_b`, `protocol_fee_rate`          | `{protocol_fee_a, protocol_fee_b}` |
| `getCompositionFees`      | Calculate composition fees for bins         | `active_bin`, `used_bin`, `variableParameters` | `{fees_a, fees_b}`                 |

#### Fee and Reward Collection

You can collect fees from your positions in several ways:

1. **Collect Fees and Rewards Together**:
```typescript
// Build collect fee and reward transaction
const tx = await sdk.Position.collectRewardAndFeePayload([{
  pool_id,
  position_id,
  reward_coins: reward_manager.rewards.map((reward) => reward.reward_coin),
  coin_type_a,
  coin_type_b
}])

// Simulate or send the transaction
const sim_result = await sdk.FullClient.sendSimulationTransaction(tx, wallet)
```

### 4. Liquidity Operations

#### Add Liquidity

The DLMM SDK provides two main methods for adding liquidity:

1. **`calculateAddLiquidityInfo(option)`** - Calculates the liquidity distribution across bins
2. **`addLiquidityPayload(option, tx?)`** - Creates the transaction payload for adding liquidity

**Method 1: `calculateAddLiquidityInfo(option: CalculateAddLiquidityOption | CalculateAddLiquidityAutoFillOption)`**

This method calculates how liquidity should be distributed across different bins based on your strategy and parameters.

**Parameters for `CalculateAddLiquidityOption`:**
```typescript
interface CalculateAddLiquidityOption {
  pool_id: string                    // Pool ID
  amount_a: string                   // Amount of token A to add
  amount_b: string                   // Amount of token B to add
  active_id: number                  // Current active bin ID
  bin_step: number                   // Bin step size
  lower_bin_id: number               // Lower bound of bin range
  upper_bin_id: number               // Upper bound of bin range
  active_bin_of_pool?: {             // Active bin amounts (if active bin is in range)
    amount_a: string
    amount_b: string
  }
  strategy_type: StrategyType        // Liquidity strategy (Spot, BidAsk, Curve)
}
```

**Parameters for `CalculateAddLiquidityAutoFillOption`:**
```typescript
interface CalculateAddLiquidityAutoFillOption {
  pool_id: string                    // Pool ID
  coin_amount: string                // Fixed amount of one token
  fix_amount_a: boolean              // true for token A, false for token B
  active_id: number                  // Current active bin ID
  bin_step: number                   // Bin step size
  lower_bin_id: number               // Lower bound of bin range
  upper_bin_id: number               // Upper bound of bin range
  active_bin_of_pool?: {             // Active bin amounts (if active bin is in range)
    amount_a: string
    amount_b: string
  }
  strategy_type: StrategyType        // Liquidity strategy (Spot, BidAsk, Curve)
}
```

**Method 2: `addLiquidityPayload(option: AddLiquidityOption | OpenAndAddLiquidityOption, tx?: Transaction)`**

This method creates the transaction payload for adding liquidity to an existing position or opening a new position.

**Parameters for `AddLiquidityOption` (existing position):**
```typescript
interface AddLiquidityOption {
  pool_id: string                    // Pool ID
  bin_infos: BinLiquidityInfo        // Calculated bin distribution from calculateAddLiquidityInfo
  coin_type_a: string                // Token A coin type
  coin_type_b: string                // Token B coin type
  active_id: number                  // Current active bin ID
  position_id: string                // Existing position ID
  collect_fee: boolean               // Whether to collect fees
  reward_coins: string[]             // Reward coin types
  strategy_type: StrategyType        // Liquidity strategy
  use_bin_infos: boolean             // Whether to use calculated bin_infos
  max_price_slippage: number         // Maximum price slippage tolerance
  bin_step: number                   // Bin step size
}
```

**Parameters for `OpenAndAddLiquidityOption` (new position):**
```typescript
interface OpenAndAddLiquidityOption {
  pool_id: string                    // Pool ID
  bin_infos: BinLiquidityInfo        // Calculated bin distribution from calculateAddLiquidityInfo
  coin_type_a: string                // Token A coin type
  coin_type_b: string                // Token B coin type
  lower_bin_id: number               // Lower bound of bin range
  upper_bin_id: number               // Upper bound of bin range
  active_id: number                  // Current active bin ID
  strategy_type: StrategyType        // Liquidity strategy
  use_bin_infos: boolean             // Whether to use calculated bin_infos
  max_price_slippage: number         // Maximum price slippage tolerance
  bin_step: number                   // Bin step size
}
```

**Complete Example - Adding Liquidity to Existing Position:**

```typescript
// Step 1: Calculate liquidity distribution
const calculateOption: CalculateAddLiquidityOption = {
  pool_id: '0x...',
  amount_a: '1000000',
  amount_b: '1200000',
  active_id: 100,
  bin_step: 2,
  lower_bin_id: 90,
  upper_bin_id: 110,
  active_bin_of_pool: amounts_in_active_bin, // Optional: if active bin is in range
  strategy_type: StrategyType.Spot
}

const bin_infos = await sdk.Position.calculateAddLiquidityInfo(calculateOption)

// Step 2: Create transaction payload
const addLiquidityOption: AddLiquidityOption = {
  pool_id: '0x...',
  bin_infos: bin_infos,
  coin_type_a: '0x...::usdc::USDC',
  coin_type_b: '0x...::usdt::USDT',
  active_id: 100,
  position_id: '0x...',
  collect_fee: true,
  reward_coins: [],
  strategy_type: StrategyType.Spot,
  use_bin_infos: false,
  max_price_slippage: 0.01,
  bin_step: 2
}

const tx = sdk.Position.addLiquidityPayload(addLiquidityOption)
```

**Complete Example - Opening New Position:**

```typescript
// Step 1: Calculate liquidity distribution
const calculateOption: CalculateAddLiquidityOption = {
  pool_id: '0x...',
  amount_a: '1000000',
  amount_b: '1200000',
  active_id: 100,
  bin_step: 2,
  lower_bin_id: 90,
  upper_bin_id: 110,
  active_bin_of_pool: amounts_in_active_bin,
  strategy_type: StrategyType.Spot
}

const bin_infos = await sdk.Position.calculateAddLiquidityInfo(calculateOption)

// Step 2: Create transaction payload for new position
const openPositionOption: OpenAndAddLiquidityOption = {
  pool_id: '0x...',
  bin_infos: bin_infos,
  coin_type_a: '0x...::usdc::USDC',
  coin_type_b: '0x...::usdt::USDT',
  lower_bin_id: 90,
  upper_bin_id: 110,
  active_id: 100,
  strategy_type: StrategyType.Spot,
  use_bin_infos: false,
  max_price_slippage: 0.01,
  bin_step: 2
}

const tx = sdk.Position.addLiquidityPayload(openPositionOption)
```

**Important Parameter Notes:**

- **`active_bin_of_pool`**: This parameter is crucial when the active bin falls within your position's range. Use `getActiveBinIfInRange()` to get the correct values.
- **`use_bin_infos`**: When `false`, the contract calculates liquidity distribution internally; when `true`, it uses the provided `bin_infos`.
- **`max_price_slippage`**: Protects against price movements during transaction execution (e.g., 0.01 = 1% slippage tolerance).
- **`collect_fee`**: Only applicable for existing positions; determines whether to collect accumulated fees when adding liquidity.
- **`strategy_type`**: Affects how liquidity is distributed across bins:
  - `Spot`: Even distribution around current price
  - `BidAsk`: Concentrated at specific price levels
  - `Curve`: Smooth distribution following a curve

There are three strategies for adding liquidity: Spot, BidAsk, and Curve. Here's how to use each:

1. **Spot Strategy**:
```typescript
// Get pool information
const pool = await sdk.Pool.getPool(pool_id)
const { active_id, bin_step, bin_manager } = pool

// Get amounts in active bin if it's within the range
const amounts_in_active_bin = await sdk.Position.getActiveBinIfInRange(
  bin_manager.bin_manager_handle,
  lower_bin_id,
  upper_bin_id,
  active_id,
  bin_step
)

// Calculate liquidity distribution
const calculateOption = {
  pool_id,
  amount_a: '1000000',
  amount_b: '1200000',
  active_id,
  bin_step,
  lower_bin_id: -10,
  upper_bin_id: 10,
  amount_a_in_active_bin: amounts_in_active_bin?.amount_a || '0',
  amount_b_in_active_bin: amounts_in_active_bin?.amount_b || '0',
  strategy_type: StrategyType.Spot
}
const bin_infos = await sdk.Position.calculateAddLiquidityInfo(calculateOption)

// For new position
const addOption = {
  pool_id,
  amount_a,
  amount_b,
  active_id,
  bin_step,
  lower_bin_id,
  upper_bin_id,
  active_bin_of_pool: amounts_in_active_bin,
  strategy_type: StrategyType.Spot,
}
const tx = sdk.Position.addLiquidityPayload(addOption)

// For existing position
const addOption = {
  pool_id,
  bin_infos: bin_infos,
  coin_type_a,
  coin_type_b,
  active_id,
  position_id,
  collect_fee: true,
  reward_coins: [],
  strategy_type: StrategyType.Spot,
  use_bin_infos: false,
  max_price_slippage: 0.01,
  bin_step,
}
const tx = sdk.Position.addLiquidityPayload(addOption)
```

Note: The `amount_a_in_active_bin` and `amount_b_in_active_bin` parameters are used to calculate the correct liquidity distribution when the active bin is within your position's range. These values are obtained using the `getActiveBinIfInRange` method, which:
1. Checks if the active bin is within your specified range
2. Returns the amounts of both tokens in the active bin if it is within range
3. Returns undefined if the active bin is outside the range

---

2. **BidAsk Strategy**:
```typescript
// Similar to Spot strategy but with different strategy_type
const calculateOption = {
  amount_a: '1000000',
  amount_b: '1200000',
  active_id,
  bin_step,
  lower_bin_id: -10,
  upper_bin_id: 10,
  amount_a_in_active_bin: '0',
  amount_b_in_active_bin: '0',
  strategy_type: StrategyType.BidAsk
}
```

3. **Curve Strategy**:
```typescript
// Similar to Spot strategy but with different strategy_type
const calculateOption = {
  amount_a: '1000000',
  amount_b: '1200000',
  active_id,
  bin_step,
  lower_bin_id: -10,
  upper_bin_id: 10,
  amount_a_in_active_bin: '0',
  amount_b_in_active_bin: '0',
  strategy_type: StrategyType.Curve
}
```

4. **Fixed Amount Strategy**:
```typescript
// Calculate with fixed amount of one token
const calculateOption = {
  coin_amount: '1000000',
  fix_amount_a: true, // true for token A, false for token B
  active_id,
  bin_step,
  lower_bin_id: -10,
  upper_bin_id: 10,
  amount_a_in_active_bin: '0',
  amount_b_in_active_bin: '0',
  strategy_type: StrategyType.Spot // or BidAsk or Curve
}
```

5. **Add Liquidity with Price**:
```typescript
// Add liquidity with specific price range
const addOption = {
  pool_id,
  bin_infos,
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
  price_base_coin: 'coin_a',
  price: price.toString(),
  lower_price,
  upper_price,
  bin_step,
  amount_a_in_active_bin: amounts_in_active_bin?.amount_a || '0',
  amount_b_in_active_bin: amounts_in_active_bin?.amount_b || '0',
  strategy_type: StrategyType.Spot,
  decimals_a: 6,
  decimals_b: 6,
  max_bin_slippage: 0.01,
  active_id,
  // If use_bin_infos is true, liquidity is allocated according to bin_infos; otherwise, it is calculated internally by the contract
  use_bin_infos: false,
}
const tx = sdk.Position.addLiquidityWithPricePayload(addOption)
```

#### Remove Liquidity

There are two ways to remove liquidity:

1. **Remove with Both Amounts**:
```typescript
// Get position and pool information
const pool = await sdk.Pool.getPool(pool_id)
const position = await sdk.Position.getPosition(position_id)
const { active_id, bin_step, bin_manager } = pool

// Get active bin information
const active_bin = await sdk.Pool.getBinInfo(bin_manager.bin_manager_handle, active_id, bin_step)
const liquidity_shares_data = parseLiquidityShares(position.liquidity_shares, bin_step, position.lower_bin_id, active_bin)

// Calculate removal amounts
const calculateOption = {
  bins: liquidity_shares_data.bins,
  active_id,
  fix_amount_a: true,
  coin_amount: '100000'
}
const bin_infos = sdk.Position.calculateRemoveLiquidityInfo(calculateOption)

// Build and send transaction
const removeOption = {
  pool_id,
  bin_infos,
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
  position_id,
  active_id,
  slippage: 0.01,
  reward_coins: []，
  collect_fee: true,
  reward_coins: [],
  bin_step,
  remove_percent: 0.5, // If remove_percent is specified, bin_infos will not be effective
}
const tx = sdk.Position.removeLiquidityPayload(removeOption)
```

2. **Remove Only One Token**:
```typescript
const calculateOption = {
  bins: liquidity_shares_data.bins,
  active_id,
  is_only_a: true, // true for token A, false for token B
  coin_amount: '100000'
}
```

#### Close Position

```typescript
// Close position (This will collect all fees, rewards and remove all liquidity)
const tx = sdk.Position.closePositionPayload({
  pool_id,
  position_id,
  coin_type_a,
  coin_type_b,
  reward_coins: pool.reward_manager.rewards.map(reward => reward.reward_coin) // Required: Must include all reward coin types from the pool
})

// Simulate or send the transaction
const sim_result = await sdk.FullClient.sendSimulationTransaction(tx, wallet)
```

Note: Closing a position will:
1. Collect all accumulated fees
2. Collect all pending rewards (must include all reward coins from the pool)
3. Remove all liquidity from the position
4. Delete the position

### 5. Swap Operations

```typescript
// Get pool information
const pool = await sdk.Pool.getPool(pool_id)
const { coin_type_a, coin_type_b } = pool

// Get swap quote
const quote_obj = await sdk.Swap.preSwapQuote({
  pool_id,
  a2b: true, // true for A to B, false for B to A
  by_amount_in: true, // true for exact input, false for exact output
  in_amount: '2000000',
  coin_type_a,
  coin_type_b
})

// Build and send swap transaction
const tx = sdk.Swap.swapPayload({
  coin_type_a,
  coin_type_b,
  quote_obj,
  by_amount_in: true,
  slippage: 0.01
})
```

### 6. Partner Operations

#### Partner Management

```typescript
// Get partner list
const partnerList = await sdk.Partner.getPartnerList()

// Get specific partner
const partner = await sdk.Partner.getPartner(partner_id)

// Get partner capability ID
const partnerCapId = await sdk.Partner.getPartnerCapId(account, partner_id)

// Get partner balance
const partnerBalance = await sdk.Partner.getPartnerBalance(partner_id)

// Create partner
const start_time = Math.floor(Date.now() / 1000) + 5000
const tx = sdk.Partner.createPartnerPayload({
  name: 'test partner',
  ref_fee_rate: 0.01,
  start_time,
  end_time: start_time + 9 * 24 * 3600,
  recipient: account,
})

// Update referral fee rate
const updateFeeTx = await sdk.Partner.updateRefFeeRatePayload({
  partner_id: '0x..',
  ref_fee_rate: 0.02,
})

// Update time range
const start_time = Math.floor(Date.now() / 1000)
const updateTimeTx = await sdk.Partner.updateTimeRangePayload({
  partner_id: '0x..',
  start_time,
  end_time: start_time + 10 * 7 * 24 * 3600,
})

// claim ref fee
const tx = await sdk.Position.claimRefFeePayload({
  partner_id: "0x..",
  partner_cap_id: "0x..", // Optional parameter
  fee_coin_types: [coin_type]
})

// Simulate or send the transaction
const sim_result = await sdk.FullClient.sendSimulationTransaction(tx, wallet)

```

### 7. Reward Operations

#### Reward Management

```typescript
// Initialize rewards for a pool
const initTx = sdk.Reward.initRewardPayload({
  pool_id,
  reward_coin_types: ['0x2::sui::SUI', '0x5::usdc::USDC']
})

// Add reward to a pool
const addRewardTx = sdk.Reward.addRewardPayload({
  pool_id,
  reward_coin_type: '0x2::sui::SUI',
  reward_amount: '1000000',
  end_time_seconds: Math.floor(Date.now() / 1000) + 30 * 24 * 3600, // 30 days
  start_time_seconds: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
})

// Update reward access (public/private)
const accessTx = sdk.Reward.updateRewardAccessPayload({
  pool_id,
  type: 'to_public', // or 'to_private'
})

// Manage reward whitelist
const whitelistTx = sdk.Reward.updateRewardWhiteListPayload({
  reward_coin_types: ['0x2::sui::SUI'],
  type: 'add' // or 'remove'
})
```

### 8. Configuration Management

The SDK provides configuration management through the `Config` module:

```typescript
// Get global DLMM configuration
const globalConfig = await sdk.Config.getDlmmGlobalConfig()

// Get bin step configuration list
const binStepConfigs = await sdk.Config.getBinStepConfigList(pool_id)

// Fetch all SDK configurations
const sdkConfigs = await sdk.Config.fetchDlmmSdkConfigs()

// Get reward period emission data
const rewardEmission = await sdk.Reward.getRewardPeriodEmission(
  reward_manager_id,
  reward_period,
  current_time
)
```

### 9. Bin Operations

The SDK provides comprehensive utility functions for working with bins and prices through the `BinUtils` class:

```typescript
import { BinUtils } from '@cetusprotocol/dlmm-sdk'

// Convert price to bin ID
const binId = BinUtils.getBinIdFromPrice(
  '1040.07',  // price
  2,          // bin step
  true,       // is base coin A
  6,          // decimals for coin A
  9           // decimals for coin B
)

// Convert bin ID to price
const price = BinUtils.getPriceFromBinId(
  -4787,      // bin ID
  2,          // bin step
  6,          // decimals for coin A
  9           // decimals for coin B
)

// Get Q price from bin ID
const q_price = BinUtils.getQPriceFromId(
  -4400,      // bin ID
  100         // bin step
)

// Get price per lamport from Q price
const price_per_lamport = BinUtils.getPricePerLamportFromQPrice(q_price)

// Get liquidity from amounts
const liquidity = BinUtils.getLiquidity('0', '266666', '18431994054197767090')

// Get amount A from liquidity
const amountA = BinUtils.getAmountAFromLiquidity('4101094304427826916657468', '18461505896777422276')

// Get amount B from liquidity
const amountB = BinUtils.getAmountBFromLiquidity('4919119455159831291232256')


// Split bin liquidity info
const split_bin_infos = BinUtils.splitBinLiquidityInfo(bin_infos, 0, 70)

// Get position count between bin ranges
const positionCount = BinUtils.getPositionCount(-750, 845)

// Find min/max bin ID for a given bin step
const { minBinId, maxBinId } = BinUtils.findMinMaxBinId(10)
```

These utility functions are particularly useful when:
- Setting up price ranges for liquidity positions
- Calculating optimal bin ranges for trading strategies
- Converting between different price representations
- Managing liquidity distributions across bins
- Analyzing position density and distribution

### 9. Advanced Operations

#### Validate Active ID Slippage

```typescript
// Validate that the active ID hasn't moved too much
const isValid = await sdk.Position.validateActiveIdSlippage({
  pool_id,
  active_id,
  max_bin_slippage: 0.01
})
```

#### Update Position Fee and Rewards

```typescript
// Update position fee and reward information
await sdk.Position.updatePositionFeeAndRewards({
  pool_id,
  position_id,
  coin_type_a,
  coin_type_b
})
```

## Troubleshooting

### Common Issues

**1. Transaction Simulation Failures**
```typescript
// Always simulate transactions before sending
const simResult = await sdk.FullClient.sendSimulationTransaction(tx, wallet)
if (simResult.effects.status.status === 'failure') {
  console.error('Transaction simulation failed:', simResult.effects.status.error)
}
```

**2. Insufficient Gas Budget**
```typescript
// Set appropriate gas budget for complex operations
tx.setGasBudget(10000000000) // 10 SUI
```

**3. Active Bin Range Validation**
```typescript
// Always check if active bin is within your position range
const amounts_in_active_bin = await sdk.Position.getActiveBinIfInRange(
  pool.bin_manager.bin_manager_handle,
  lower_bin_id,
  upper_bin_id,
  active_id,
  bin_step
)
```

**4. Price Slippage Protection**
```typescript
// Use appropriate slippage protection
const isValid = await sdk.Position.validateActiveIdSlippage({
  pool_id,
  active_id,
  max_bin_slippage: 0.01 // 1% slippage tolerance
})
```

### Debugging Tips

**1. Print Transaction Details**
```typescript
import { printTransaction } from '@cetusprotocol/common-sdk'

// Print transaction for debugging
printTransaction(tx)
```

**2. Check Pool State**
```typescript
// Always verify pool state before operations
const pool = await sdk.Pool.getPool(pool_id)
console.log('Pool active_id:', pool.active_id)
console.log('Pool bin_step:', pool.bin_step)
```

**3. Validate Position Data**
```typescript
// Parse and validate position liquidity shares
const active_bin = await sdk.Pool.getBinInfo(pool.bin_manager.bin_manager_handle, pool.active_id, pool.bin_step)
const liquidity_shares_data = parseLiquidityShares(position.liquidity_shares, pool.bin_step, position.lower_bin_id, active_bin)
console.log('Liquidity shares data:', liquidity_shares_data)
```

## More About Cetus

Use the following links to learn more about Cetus:

Learn more about working with Cetus in the [Cetus Documentation](https://cetus-1.gitbook.io/cetus-docs).

Join the Cetus community on [Cetus Discord](https://discord.com/channels/1009749448022315008/1009751382783447072).

## License

MIT

