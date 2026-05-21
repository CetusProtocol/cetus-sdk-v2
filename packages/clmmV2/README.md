<a name="readme-top"></a>

![NPM](https://img.shields.io/npm/l/%40cetusprotocol%2Fsui-clmmV2-sdk?registry_uri=https%3A%2F%2Fregistry.npmjs.com&style=flat&logo=npm&logoColor=blue&label=%40cetusprotocol&labelColor=rgb&color=fedcba&cacheSeconds=3600&link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2F%40cetusprotocol%2Fsui-clmmV2-sdk)
![npm](https://img.shields.io/npm/v/%40cetusprotocol%2Fsui-clmmV2-sdk?logo=npm&logoColor=rgb)
![GitHub Repo stars](https://img.shields.io/github/stars/CetusProtocol/cetus-sdk-v2?logo=github)

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a >
    <img src="https://archive.cetus.zone/assets/image/logo.png" alt="Logo" width="100" height="100">
  </a>

  <h3 align="center">Cetus-CLMM-SUI-SDK</h3>

  <p align="center">
    Integrating Cetus-CLMM-SUI-SDK: A Comprehensive Guide, Please see details in document.
    <br />
    <a href="https://cetus-1.gitbook.io/cetus-developer-docs/developer/dev-overview"><strong>Explore the document »</strong></a>
<br />
    <br />
  </p>
</div>

## Introduction

Cetus-CLMM-SUI-SDK is the official software development kit (SDK) specifically designed for seamless integration with Cetus-CLMM. It provides developers with the necessary tools and resources to easily connect and interact with Cetus-CLMM, enabling the development of robust and efficient applications.

## Getting Started

To integrate our SDK into your local project, please follow the example steps provided below.
Please see details in document.

### Prerequisites

```sh
npm i @cetusprotocol/sui-clmmV2-sdk
```

## SDK Initialization

The SDK provides a convenient initialization method `src/config/initCetusSDK` for quick setup and configuration of the Cetus SDK.

### Network Options

- `mainnet` (Production Network)
- `testnet` (Test Network)

### Important Note

Before performing swaps or other asset-related operations, ensure:

- A wallet is properly configured
- The wallet has sufficient token balance for the intended operation

```typescript
import { CetusClmmSDK } from '@cetusprotocol/sui-clmmV2-sdk'
```

If you would like to use the mainnet network and the official Sui rpc url, you can do so as follows:

```typescript
const sdk = CetusClmmSDK.createSDK()
```

If you wish to set your own full node URL or network (You have the option to select either 'mainnet' or 'testnet' for the network), you can do so as follows:

```typescript
const env = 'mainnet'
const full_rpc_url = 'YOUR_FULL_NODE_URL'
const wallet = 'YOUR_WALLET_ADDRESS'

const sdk = CetusClmmSDK.createSDK({ env })
```

If you wish to set your own full node URL or SuiClient, you can do so as follows:

```typescript
const sdk = CetusClmmSDK.createSDK({ env, sui_client })
//or
const sdk = CetusClmmSDK.createSDK({ env, full_rpc_url })
```

**After linking your wallet, if you need use your wallet address to do something, you should set it by `CetusClmmSDK.setSenderAddress("YOUR_SUI_ADDRESS_HERE")`**

```typescript
const wallet = 'YOUR_WALLET_ADDRESS'

sdk.setSenderAddress(wallet)
```

Now, you can start using Cetus SDK.

### Typescript Doc

You can view this typescript sdk in
<a href="https://cetus-1.gitbook.io/cetus-developer-docs/developer/dev-overview"><strong> Cetus Development Documents. </strong></a>
<br />

## Feature Overview

The SDK exposes the following capabilities by module, accessible via `sdk.Config`, `sdk.Pool`, `sdk.Swap`, `sdk.Position`, `sdk.Rewarder`, `sdk.Partner`, and `sdk.Zap`.

### Config

- Get DLMM global config (`getDlmmGlobalConfig`)
- Get fee tiers by pool config ID (`getFeeTiers`)
- Get CLMM config list (`getClmmConfigs`)
- Get reward period emission data with time-based parsing (`getRewardPeriodEmission`, `parseRewardPeriodEmission`, `parseCurrentRewardPeriodEmission`)
- Base fee under linear scheduler: max/min base fee, fee by period (`get_max_base_fee`, `get_min_base_fee`, `get_base_fee_by_period`)

**Code example:**

```typescript
import { CetusClmmV2SDK } from '@cetusprotocol/sui-clmmV2-sdk'
import { parseCurrentRewardPeriodEmission, parseRewardPeriodEmission } from '@cetusprotocol/sui-clmmV2-sdk'
import { get_max_base_fee, get_min_base_fee, get_base_fee_by_period } from '@cetusprotocol/sui-clmmV2-sdk'

const sdk = CetusClmmV2SDK.createSDK({ env: 'testnet' })
sdk.setSenderAddress('YOUR_WALLET_ADDRESS')

// Global config and fee tiers
const globalConfig = await sdk.Config.getDlmmGlobalConfig()
const feeTiers = await sdk.Config.getFeeTiers('POOL_CONFIG_OBJECT_ID')
const clmmConfigs = await sdk.Config.getClmmConfigs()

// Base fee (use base_fee_config from feeTiers)
const baseFeeConfig = feeTiers[0].base_fee_config
const maxFee = get_max_base_fee(baseFeeConfig)
const minFee = get_min_base_fee(baseFeeConfig)
const feeByPeriod = get_base_fee_by_period(baseFeeConfig, Number(baseFeeConfig.number_of_period))

// Reward period emission (via Rewarder module)
const emission = await sdk.Rewarder.getRewardPeriodEmission(rewarderId, liquidity, periodStartTime)
const currentEmission = parseCurrentRewardPeriodEmission(emission)
const parsed = parseRewardPeriodEmission(emission, startTime, endTime, intervalSeconds)
```

### Pool

- Query: pool immutables (`getPoolImmutables`), pool list (`getPools`), single pool (`getPool`), pools by ID list (`getAssignPools`)
- Fetch pool tick data (`fetchTicks`)
- Create pool (`createPool`): tick spacing, dynamic fee, fee coin type, price range, initial price, coin types
- Create pool with launch config: set swap open time and liquidity open time via `launch_configs` in `createPool`

**Code example:**

```typescript
import { CetusClmmV2SDK } from '@cetusprotocol/sui-clmmV2-sdk'
import { TickMath, d } from '@cetusprotocol/common-sdk'
import { FeeCoinType } from '@cetusprotocol/sui-clmmV2-sdk'

const sdk = CetusClmmV2SDK.createSDK({ env: 'testnet' })
sdk.setSenderAddress('YOUR_WALLET_ADDRESS')

// Query pools
const poolImmutables = await sdk.Pool.getPoolImmutables()
const pools = await sdk.Pool.getPools()
const pool = await sdk.Pool.getPool('POOL_ID')
const assignPools = await sdk.Pool.getAssignPools(['POOL_ID_1', 'POOL_ID_2'])
const ticks = await sdk.Pool.fetchTicks({
  pool_id: pool.id,
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
})

// Create pool
const createTx = sdk.Pool.createPool({
  tick_spacing: 10,
  has_dynamic_fee: true,
  fee_coin_type: FeeCoinType.CoinTypeA,
  min_tick_range: 10,
  initialize_price: TickMath.priceToSqrtPriceX64(d(1), 6, 6).toString(),
  url: '',
  coin_type_a: 'COIN_TYPE_A',
  coin_type_b: 'COIN_TYPE_B',
})
// Create pool with launch config: pass launch_configs to createPool
const currentTime = d(Date.now() / 1000).toFixed(0)
const launchTx = sdk.Pool.createPool({
  // ... same as above
  launch_configs: {
    swap_open_time: (Number(currentTime) + 60 * 60 * 24).toString(),
    liquidity_open_time: (Number(currentTime) + 60 * 60 * 24).toString(),
  },
})
```

### Swap

- Pre-swap quote (`preSwapQuote`): get expected output and quote by input amount and direction (A→B / B→A)
- Execute swap: A→B (`swap` a2b), B→A (`swap` b2a); supports building a transaction by input amount and slippage

**Code example:**

```typescript
import { CetusClmmV2SDK } from '@cetusprotocol/sui-clmmV2-sdk'
import { toDecimalsAmount } from '@cetusprotocol/common-sdk'

const sdk = CetusClmmV2SDK.createSDK({ env: 'testnet' })
sdk.setSenderAddress('YOUR_WALLET_ADDRESS')

const poolId = 'POOL_ID'
const pool = await sdk.Pool.getPool(poolId)
const { coin_type_a, coin_type_b } = pool

// Get quote (by input amount, A→B)
const quote = await sdk.Swap.preSwapQuote({
  pool_id: poolId,
  a2b: true,
  by_amount_in: true,
  amount: toDecimalsAmount(10, 9),
  coin_type_a,
  coin_type_b,
})

// Build and execute swap transaction
const tx = sdk.Swap.swap({
  coin_type_a,
  coin_type_b,
  by_amount_in: true,
  amount_in: quote.amount_in,
  amount_out: quote.amount_out,
  slippage: 0.01,
  pool_id: poolId,
  a2b: true,
})
// await sdk.FullClient.executeTx(keypair, tx, true)
```

### Position & Liquidity

**Query**

- Get position list by address (`getPositionList`)
- Get position by NFT ID (`getPositionById`)

**Add liquidity**

- Open position and add liquidity: fix amount of one side (A or B), specify tick range
- Add liquidity to existing position: pass `position_id`; optionally collect fees and pass rewarder coin types

**Remove liquidity**

- Partial remove: compute and remove liquidity by one-sided token amount; optionally collect fees
- **Close Position** — Removes all liquidity from the position and burns the position NFT. Set `delta_liquidity` to the position’s full liquidity and `close_position: true`. You may optionally collect accrued fees and rewards in the same call. Use `ClmmPoolUtil.getCoinAmountFromLiquidity` with the current price and slippage to compute `min_amount_a` and `min_amount_b`.

  **Remove liquidity / close position — parameter reference**

  | Parameter             | Description                                                                                                                                                                                                                                                                                                                      |
  | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `close_position`      | When `true`, the position is **closed** after this removal: all liquidity is withdrawn and the position NFT is burned. When `false`, only a partial amount is removed and the position remains. For closing, `delta_liquidity` must equal the position’s total liquidity.                                                        |
  | `rewarder_coin_types` | List of **reward coin types** to claim in this transaction (e.g. full type strings for SUI, USDC). Typically pass `pool.reward_manager.rewards.map(r => r.reward_coin)`. Use `[]` to skip claiming rewards. When closing a position, passing all pool reward types is recommended so no rewards are left on the closed position. |
  | `collect_fee`         | When `true`, **accrued trading fees** for this position are collected in the same transaction and sent to the wallet with the withdrawn tokens. When `false`, fees are not collected here and can be claimed later via `collectFee`.                                                                                             |

**Fees**

- Fetch uncollected fees for position(s) (`fetchPosFeeAmount`)
- Collect position fees (`collectFee`)

**Code example:**

```typescript
import { CetusClmmV2SDK, AddLiquidityFixCoinOptions, RemoveLiquidityOptions } from '@cetusprotocol/sui-clmmV2-sdk'
import { Transaction } from '@mysten/sui/transactions'
import BN from 'bn.js'
import { ClmmPoolUtil, TickMath, d } from '@cetusprotocol/common-sdk'

const sdk = CetusClmmV2SDK.createSDK({ env: 'testnet' })
sdk.setSenderAddress('YOUR_WALLET_ADDRESS')

// Query positions
const positionList = await sdk.Position.getPositionList(sdk.getSenderAddress(), [])
const position = await sdk.Position.getPositionById('POSITION_NFT_ID')

// Open position and add liquidity (fix one side; use ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts for amount_a/amount_b)
const pool = await sdk.Pool.getPool('POOL_ID')
const tickLower = pool.current_tick_index - 10
const tickUpper = pool.current_tick_index + 10
const addLiquidityTx = new Transaction()
sdk.Position.addLiquidityFixCoin({
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
  pool_id: pool.id,
  fix_amount_a: false,
  position: { tick_lower: String(tickLower), tick_upper: String(tickUpper) },
  amount_a: 'AMOUNT_A',
  amount_b: 'AMOUNT_B',
}, addLiquidityTx)

// Add liquidity to existing position (pass position_id and rewarder_coin_types)
sdk.Position.addLiquidityFixCoin({
  // ...
  position: {
    position_id: position.pos_object_id,
    collect_fee: true,
    rewarder_coin_types: pool.reward_manager.rewards.map(r => r.reward_coin),
  },
}, addLiquidityTx)

// Partial remove liquidity
const removeTx = new Transaction()
sdk.Position.removeLiquidity({
  pool_id: pool.id,
  position_id: 'POSITION_NFT_ID',
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
  delta_liquidity: 'LIQUIDITY_AMOUNT',
  min_amount_a: 'MIN_A',
  min_amount_b: 'MIN_B',
  rewarder_coin_types: [],
  collect_fee: true,
}, removeTx)

// Close position: remove all liquidity and burn position NFT
const positionToClose = await sdk.Position.getPositionById('POSITION_NFT_ID')
const curSqrtPrice = new BN(TickMath.tickIndexToSqrtPriceX64(Number(pool.current_tick_index)))
const coinAmounts = ClmmPoolUtil.getCoinAmountFromLiquidity(
  new BN(positionToClose.liquidity),
  curSqrtPrice,
  new BN(TickMath.tickIndexToSqrtPriceX64(positionToClose.tick_lower_index)),
  new BN(TickMath.tickIndexToSqrtPriceX64(positionToClose.tick_upper_index)),
  false
)
const slippage = 0.05
const minAmountA = d(coinAmounts.coin_amount_a).mul(1 - slippage).toFixed(0)
const minAmountB = d(coinAmounts.coin_amount_b).mul(1 - slippage).toFixed(0)
const closeTx = new Transaction()
sdk.Position.removeLiquidity({
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
  delta_liquidity: positionToClose.liquidity,
  min_amount_a: minAmountA,
  min_amount_b: minAmountB,
  pool_id: pool.id,
  rewarder_coin_types: pool.reward_manager.rewards.map((r) => r.reward_coin),
  collect_fee: true,
  position_id: 'POSITION_NFT_ID',
  close_position: true,
}, closeTx)

// Query and collect fees
const feeAmounts = await sdk.Position.fetchPosFeeAmount([{
  pool_id: pool.id,
  position_id: 'POSITION_NFT_ID',
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
  recalculate: true,
}])
const collectFeeTx = new Transaction()
sdk.Position.collectFee({
  pool_id: pool.id,
  position_id: 'POSITION_NFT_ID',
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
  recalculate: true,
}, collectFeeTx)
```

### Rewarder

- Get reward period emission and parsing (`getRewardPeriodEmission`, `parseRewardPeriodEmission`, `parseCurrentRewardPeriodEmission`)
- Fetch position reward amounts (`fetchPosRewardersAmount`), with optional recalculate
- Collect position rewards (`collectRewarder`)

**Code example:**

```typescript
import { CetusClmmV2SDK } from '@cetusprotocol/sui-clmmV2-sdk'
import { Transaction } from '@mysten/sui/transactions'

const sdk = CetusClmmV2SDK.createSDK({ env: 'testnet' })
sdk.setSenderAddress('YOUR_WALLET_ADDRESS')

const poolId = 'POOL_ID'
const positionId = 'POSITION_NFT_ID'
const pool = await sdk.Pool.getPool(poolId)
const rewarderCoinTypes = pool.reward_manager.rewards.map(r => r.reward_coin)

// Reward period emission
const emission = await sdk.Rewarder.getRewardPeriodEmission(rewarderId, liquidity, periodStartTime)

// Fetch position reward amounts
const amounts = await sdk.Rewarder.fetchPosRewardersAmount([{
  pool_id: poolId,
  position_id: positionId,
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
  recalculate: true,
  rewarder_coin_types: rewarderCoinTypes,
}])

// Collect rewards
const tx = new Transaction()
sdk.Rewarder.collectRewarder({
  pool_id: poolId,
  position_id: positionId,
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
  recalculate: true,
  rewarder_coin_types: rewarderCoinTypes,
}, tx)
```

### Partner

- Query: partner list (`getPartnerList`), get partner by ID (`getPartner`)
- Get partner cap ID by account and partner (`getPartnerCapId`)
- Get partner balance by cap (`getPartnerBalance`)
- Create partner (`createPartnerPayload`): name, ref fee rate, time range, recipient
- Update ref fee rate (`updateRefFeeRatePayload`)
- Update time range (`updateTimeRangePayload`)

**Code example:**

```typescript
import { CetusClmmV2SDK } from '@cetusprotocol/sui-clmmV2-sdk'
import { d } from '@cetusprotocol/common-sdk'

const sdk = CetusClmmV2SDK.createSDK({ env: 'testnet' })
const account = 'YOUR_WALLET_ADDRESS'
sdk.setSenderAddress(account)

// Query
const partnerList = await sdk.Partner.getPartnerList()
const partner = await sdk.Partner.getPartner('PARTNER_OBJECT_ID')
const capId = await sdk.Partner.getPartnerCapId(account, 'PARTNER_OBJECT_ID')
const balance = await sdk.Partner.getPartnerBalance('PARTNER_CAP_OBJECT_ID')

// Create partner
const startTime = Number(d(Date.now()).div(1000).add(60).toFixed(0))
const createTx = sdk.Partner.createPartnerPayload({
  name: 'My Partner',
  ref_fee_rate: 0.01,
  start_time: startTime,
  end_time: startTime + 9 * 24 * 3600,
  recipient: account,
})

// Update ref fee rate / time range
const updateFeeTx = await sdk.Partner.updateRefFeeRatePayload({
  partner_id: 'PARTNER_OBJECT_ID',
  ref_fee_rate: 0.02,
})
const updateTimeTx = await sdk.Partner.updateTimeRangePayload({
  partner_id: 'PARTNER_OBJECT_ID',
  start_time: startTime,
  end_time: startTime + 10 * 7 * 24 * 3600,
})
```

### Zap (One-Click Deposit & Withdraw)

**Deposit**

- **FixedOneSide** — Deposit with a fixed amount of one side; use `preCalculateDepositAmount` then `buildDepositPayload`
- **OnlyCoinA** — Deposit only coin A (swap to obtain B); supports swap slippage
- **OnlyCoinB** — Deposit only coin B

**Withdraw**

- **FixedOneSide** — Withdraw a fixed amount of one side
- **OnlyCoinA** — Withdraw by burning liquidity; receive mainly coin A
- **OnlyCoinB** — Withdraw by burning liquidity or close position (`close_pos`); optionally collect fees

**Code example:**

```typescript
import { CetusClmmV2SDK } from '@cetusprotocol/sui-clmmV2-sdk'
import { Transaction } from '@mysten/sui/transactions'
import { TickMath, toDecimalsAmount } from '@cetusprotocol/common-sdk'

const sdk = CetusClmmV2SDK.createSDK({ env: 'testnet' })
sdk.setSenderAddress('YOUR_WALLET_ADDRESS')

const poolId = 'POOL_ID'
const pool = await sdk.Pool.getPool(poolId)
const { current_sqrt_price, current_tick_index, tick_spacing, coin_type_a, coin_type_b } = pool

// --- Deposit: FixedOneSide (fixed amount of one side) ---
const tickLower = TickMath.getInitializeTickIndex(current_tick_index - 200, Number(tick_spacing))
const tickUpper = TickMath.getInitializeTickIndex(current_tick_index + 200, Number(tick_spacing))
const depositResult = await sdk.Zap.preCalculateDepositAmount(
  {
    pool_id: poolId,
    tick_lower: tickLower,
    tick_upper: tickUpper,
    current_sqrt_price: current_sqrt_price.toString(),
    slippage: 0.01,
  },
  {
    mode: 'FixedOneSide',
    fixed_amount: toDecimalsAmount(1, 6).toString(),
    fixed_coin_a: true,
  }
)
const depositTx = await sdk.Zap.buildDepositPayload({
  deposit_obj: depositResult,
  pool_id: poolId,
  coin_type_a,
  coin_type_b,
  tick_lower: tickLower,
  tick_upper: tickUpper,
  slippage: 0.01,
})

// --- Deposit: OnlyCoinA (only A; internal swap for B) ---
const onlyADeposit = await sdk.Zap.preCalculateDepositAmount(
  {
    pool_id: poolId,
    tick_lower: tickLower,
    tick_upper: tickUpper,
    current_sqrt_price: current_sqrt_price.toString(),
    slippage: 0.005,
    swap_slippage: 0.01,
  },
  { mode: 'OnlyCoinA', coin_amount: toDecimalsAmount(2, 6).toString(), coin_type_a, coin_type_b, coin_decimal_a: 6, coin_decimal_b: 6 }
)
const onlyADepositTx = await sdk.Zap.buildDepositPayload({
  deposit_obj: onlyADeposit,
  pool_id: poolId,
  coin_type_a,
  coin_type_b,
  tick_lower: tickLower,
  tick_upper: tickUpper,
  slippage: 0.005,
  swap_slippage: 0.01,
})

// --- Withdraw: preCalculateWithdrawAmount then buildWithdrawPayload ---
const position = await sdk.Position.getPositionById('POSITION_NFT_ID')
const withdrawResult = await sdk.Zap.preCalculateWithdrawAmount({
  mode: 'FixedOneSide',
  pool_id: poolId,
  tick_lower: position.tick_lower_index,
  tick_upper: position.tick_upper_index,
  current_sqrt_price: current_sqrt_price.toString(),
  fixed_amount: toDecimalsAmount(0.01, 6).toString(),
  fixed_coin_a: false,
  coin_type_a,
  coin_type_b,
  coin_decimal_a: 6,
  coin_decimal_b: 9,
})
const withdrawTx = new Transaction()
await sdk.Zap.buildWithdrawPayload({
  withdraw_obj: withdrawResult,
  pool_id: poolId,
  pos_id: 'POSITION_NFT_ID',
  close_pos: false,
  collect_fee: true,
  collect_rewarder_types: [],
  coin_type_a,
  coin_type_b,
  tick_lower: position.tick_lower_index,
  tick_upper: position.tick_upper_index,
  slippage: 0.01,
}, withdrawTx)
```

## LICENSE

CETUS-SUI-SDK released under the Apache license. See the [LICENSE](./LICENSE) file for details.

## More About Cetus

Use the following links to learn more about Cetus:
Learn more about working with Cetus in the [Cetus Documentation](https://cetus-1.gitbook.io/cetus-docs).

Join the Cetus community on [Cetus Discord](https://discord.com/channels/1009749448022315008/1009751382783447072).
