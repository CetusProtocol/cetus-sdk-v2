# 📦 Migrate to SDK Version 6.0

> In the refactored version of the SDK, we've made significant upgrades and refactoring across the entire SDK. Function names, parameter styles, and return value field formats have been unified. Deprecated APIs have been removed. **It is strongly recommended to migrate as soon as possible.**

> The following are the main migration highlights. Please refer to the TypeScript types for specific details.

---

## 🚨 Important Notice

> All method parameters and response fields now use **snake_case naming convention**.  
> Example: `tickSpacing` → `tick_spacing`

> ⚠️ This migration guide focuses only on major structural changes.Minor field name updates and signature adjustments are not exhaustively listed here.Please rely on TypeScript type hints and editor autocomplete to complete the migration accurately

---

## 1. helpers

🔄 Method Migration
Several commonly used utility methods have been moved from @cetusprotocol/sui-clmm-sdk to @cetusprotocol/common-sdk.
Below are some typical import and usage changes:

> 🚫 `TransactionUtil` is deprecated and replaced CoinAssist

```diff
- import type { CoinAssist, ClmmPoolUtil, TickMath，TickUtil  } from '@cetusprotocol/sui-clmm-sdk'
+ import type { CoinAssist, ClmmPoolUtil, TickMath，TickUtil  } from '@cetusprotocol/common-sdk'

- TransactionUtil.buildCoinForAmount()
+ CoinAssist.buildCoinForAmount()

- TransactionUtil.buildCoinWithBalance()
+ CoinAssist.buildCoinWithBalance()
```

## 2. CetusClmmSDK

🛠 SDK Initialization Updated

```diff
- const cetusClmmSDK = initCetusSDK({network: 'mainnet'})
+ const sdk = CetusClmmSDK.createSDK({ env: 'mainnet' })

// Setting `senderAddress` has changed
- sdk.senderAddress = "0x..."
+ sdk.setSenderAddress("0x...")
```

🔄 Method Migration

```diff
// Get wallet balance
- sdk.getOwnerCoinAssets()
+ sdk.FullClient.getOwnerCoinAssets()
- sdk.getOwnerCoinBalances()
+ sdk.FullClient.getOwnerCoinAssets()

export type CoinAsset = {
- coinAddress: string
+ coin_type: string
}
```

❌ Removed Modules
The Router and RouterV2 modules have been removed for better maintenance.
Use the recommended [Cetus Aggregator SDK](https://cetus-1.gitbook.io/cetus-developer-docs/developer/cetus-aggregator) instead.

| Deprecated Modules | Replacement    |
| ------------------ | -------------- |
| Router             | Aggregator SDK |
| RouterV2           | Aggregator SDK |

## 3. Pool Module

🔄 Method Migration

```diff
- sdk.Pool.getSuiTransactionResponse(previousTx)
+ sdk.FullClient.getSuiTransactionResponse(previousTx)

- sdk.Pool.getPoolsWithPage([], 'all', true)
+ sdk.Pool.getPoolsWithPage('all', true)
+ sdk.Pool.getAssignPools([])

export type Pool = {
- poolAddress: string
+ id: string
- coinTypeA: string
+ coin_type_a: string
- coinTypeB: string
+ coin_type_b: string
...
}
```

❌ Removed Methods
| Removed                            | Replacement               |
| ---------------------------------- | ------------------------- |
| ~~`getPoolImmutables`~~            | getPoolImmutablesWithPage |
| ~~`getPools`~~                     | getPoolsWithPage          |
| ~~`creatPoolsTransactionPayload`~~ | createPoolPayload         |
| ~~`creatPoolTransactionPayload`~~  | createPoolPayload         |

✏️ Renamed Methods  
| Old Method                      | New Method           |
| ------------------------------- | -------------------- |
| createPoolTransactionPayload    | createPoolPayload    |
| createPoolTransactionRowPayload | createPoolRowPayload |

## 4. Position Module

❌ Removed Methods
| Removed Method     | Replacement       |
| ------------------ | ----------------- |
| ~~`calculateFee`~~ | fetchPosFeeAmount |

✏️ Renamed Methods  
| Old Method                        | New Method                    |
| --------------------------------- | ----------------------------- |
| getSipmlePositionList             | getSimplePositionList         |
| removeLiquidityTransactionPayload | removeLiquidityPayload        |
| closePositionTransactionPayload   | closePositionPayload          |
| openPositionTransactionPayload    | openPositionPayload           |
| collectFeeTransactionPayload      | collectFeePayload             |
| createCollectFeePaylod            | createCollectFeePayload       |
| createCollectFeeNoSendPaylod      | createCollectFeeNoSendPayload |

## 5. Rewarder Module

❌ Removed Methods
| Removed Method            | Replacement              |
| ------------------------- | ------------------------ |
| ~~`posRewardersAmount`~~  | fetchPosRewardersAmount  |
| ~~`poolRewardersAmount`~~ | fetchPoolRewardersAmount |

✏️ Renamed Methods  
| Old Method                        | New Method                         |
| --------------------------------- | ---------------------------------- |
| collectRewarderTransactionPayload | collectRewarderPayload             |
| batchCollectRewardePayload        | batchCollectRewardsPayload         |
| createCollectRewarderPaylod       | createCollectRewarderPayload       |
| createCollectRewarderNoSendPaylod | createCollectRewarderNoSendPayload |


