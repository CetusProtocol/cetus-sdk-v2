# Margin Trading 事件解析与 Action 区分规则

## 背景

合约中移除 `MarginTradingContext` 后，原有记录在 context 中的数据（action, amount, cointype）需要通过事件组合来推断。

---

# Part 1: 三字段提取规则（快速参考）

## 返回字段

```typescript
interface ActionResult {
  action: string    // 操作类型
  amount: string    // 数量
  coinType: string  // 币种
}
```

## 快速参考表

| Action | Amount 来源 | CoinType 来源 | 符号 |
|--------|------------|---------------|:----:|
| `open_position` | `DepositEvent.deposit_amount` | `DepositEvent.coin_type` | + |
| `close_position` | `WithdrawEvent.withdraw_amount` | `WithdrawEvent.coin_type` | - |
| `increase_size` | `DepositEvent.deposit_amount` | `DepositEvent.coin_type` | + |
| `decrease_size` | `WithdrawEvent.withdraw_amount` | `WithdrawEvent.coin_type` | - |
| `top_up_collateral` | `DepositEvent.deposit_amount` | `DepositEvent.coin_type` | + |
| `withdraw_collateral` | `WithdrawEvent.withdraw_amount` | `WithdrawEvent.coin_type` | - |
| `liquidation` | `LiquidateEvent.withdraw_amount` | `LiquidateEvent.withdraw_type` | - |
| `claim_reward` | `ClaimRewardEvent.reward_amount` | `ClaimRewardEvent.reward_coin_type` | + |

## Action 判断条件

| Action | 判断条件 |
|--------|---------|
| `open_position` | 存在 `OpenPositionEvent` |
| `close_position` | 存在 `ClosePositionEvent` |
| `liquidation` | 存在 `LiquidateEvent` |
| `claim_reward` | 仅有 `ClaimRewardEvent` |
| `increase_size` | `DepositEvent` + `BorrowEvent` |
| `top_up_collateral` | `DepositEvent` only (无 `BorrowEvent`) |
| `decrease_size` | `WithdrawEvent` + `RepayEvent` |
| `withdraw_collateral` | `WithdrawEvent` only (无 `RepayEvent`) |

## 完整提取逻辑

```typescript
function getActionType(events): string {
  // 第一优先级：唯一标识事件
  if (events.openPositionEvent)   return 'open_position'
  if (events.closePositionEvent)  return 'close_position'
  if (events.liquidateEvent)      return 'liquidation'
  if (events.claimRewardEvent && !hasOtherEvents)  return 'claim_reward'

  // 第二优先级：事件组合判断
  const hasDeposit  = events.depositEvents.length > 0
  const hasWithdraw = events.withdrawEvents.length > 0
  const hasBorrow   = events.borrowEvents.length > 0
  const hasRepay    = events.repayEvents.length > 0

  if (hasDeposit && hasBorrow)    return 'increase_size'
  if (hasDeposit && !hasBorrow)   return 'top_up_collateral'
  if (hasWithdraw && hasRepay)    return 'decrease_size'
  if (hasWithdraw && !hasRepay)   return 'withdraw_collateral'

  return 'unknown'
}

function extractActionResult(events, position): ActionResult {
  const action = getActionType(events)
  const { is_long, base_token, quote_token } = position

  // 根据仓位方向确定抵押资产类型
  const collateralCoinType = is_long ? base_token : quote_token

  switch (action) {
    case 'open_position':
    case 'increase_size':
    case 'top_up_collateral': {
      // 筛选抵押资产的 DepositEvent
      const depositEvent = events.depositEvents.find(e => e.coin_type === collateralCoinType)
      return {
        action,
        amount: depositEvent.deposit_amount,
        coinType: depositEvent.coin_type
      }
    }

    case 'close_position':
    case 'decrease_size':
    case 'withdraw_collateral': {
      // 筛选抵押资产的 WithdrawEvent（不依赖事件顺序）
      const withdrawEvent = events.withdrawEvents.find(e => e.coin_type === collateralCoinType)
      return {
        action,
        amount: withdrawEvent.withdraw_amount,
        coinType: withdrawEvent.coin_type
      }
    }

    case 'liquidation':
      return {
        action,
        amount: events.liquidateEvent.withdraw_amount,
        coinType: events.liquidateEvent.withdraw_type
      }

    case 'claim_reward':
      return {
        action,
        amount: events.claimRewardEvent.reward_amount,
        coinType: events.claimRewardEvent.reward_coin_type
      }

    default:
      return { action: 'unknown', amount: '0', coinType: '' }
  }
}
```

## 说明

- **CoinType 无需额外筛选**：事件中的 `coin_type` 已是正确的质押资产类型
  - Long 仓位 → `coin_type` = base_token
  - Short 仓位 → `coin_type` = quote_token
- **Amount 直接读取**：从对应事件字段直接获取，无需计算
- **仅关注 SuiLend 层**：忽略 Swap 层的资产转换，只展示实际的质押资产变化

---

# Part 2: 详细分析

## 1. 合约事件清单

### 1.1 Position 事件 (position.move:35-93)

| 事件 | 字段 | 发射位置 |
|------|------|----------|
| `OpenPositionEvent` | position_id, market_id, obligation_id, leverage, is_long, collateral_coin_type, loan_coin_type, owner, timestamp | router.move:71-77 |
| `ClosePositionEvent` | position_id, market_id, owner, timestamp | router.move:107 |
| `DepositEvent` | position_id, owner, coin_type, deposit_amount, timestamp | router.move:366 |
| `WithdrawEvent` | position_id, owner, coin_type, withdraw_amount, timestamp | router.move:314 |
| `BorrowEvent` | position_id, owner, coin_type, borrow_amount, timestamp | router.move:188 |
| `RepayEvent` | position_id, owner, repay_coin_type, repay_amount, timestamp | router.move:222 |
| `ClaimRewardEvent` | position_id, owner, reward_coin_type, reward_amount, timestamp | router.move:396 |

### 1.2 外部 Swap 事件

```
Package: 0x33ec64e9bb369bf045ddc198c81adbf2acab424da37465d95296ee02045d2b17
Module: router
Event: ConfirmSwapEvent

字段:
- amount_in: string
- amount_out: string
- from: { name: string }      // 输入币种
- target: { name: string }    // 输出币种
```

---

## 2. Action 列表（共 10 种）

```move
action_bytes == b"open_position" ||
action_bytes == b"close_position" ||
action_bytes == b"increase_size" ||
action_bytes == b"decrease_size" ||
action_bytes == b"increase_leverage" ||
action_bytes == b"decrease_leverage" ||
action_bytes == b"top_up_collateral" ||
action_bytes == b"withdraw_collateral" ||
action_bytes == b"repay_debt" ||
action_bytes == b"claim_reward"
```

---

## 3. 事件特征矩阵

| Action | Open | Close | Deposit | Withdraw | Borrow | Repay | Claim | Liquidate | Swap |
|--------|:----:|:-----:|:-------:|:--------:|:------:|:-----:|:-----:|:---------:|:----:|
| open_position | **必须** | - | **必须** | - | **必须** | - | - | - | 可选 |
| close_position | - | **必须** | - | **必须**(1+) | - | **必须** | - | - | 可选 |
| increase_size | - | - | **必须** | - | **必须** | - | - | - | 可选 |
| decrease_size | - | - | - | **必须**(1+) | - | **必须** | - | - | 可选 |
| increase_leverage | - | - | **必须** | - | **必须** | - | - | - | **必须** |
| decrease_leverage | - | - | - | **必须** | - | **必须** | - | - | **必须** |
| top_up_collateral | - | - | **必须** | - | - | - | - | - | 可选 |
| withdraw_collateral | - | - | - | **必须** | - | - | - | - | - |
| repay_debt | - | - | - | - | - | **必须** | - | - | 可选 |
| claim_reward | - | - | - | - | - | - | **必须** | - | - |
| liquidation | - | - | - | - | - | - | - | **必须** | - |

> **注意**: "(1+)" 表示可能有多个该事件

---

## 4. 难点场景分析

### 4.1 increase_size vs increase_leverage

**事件组合相同**: `DepositEvent + BorrowEvent + ConfirmSwapEvent`

**区分方法**:
```
user_input = DepositEvent.deposit_amount - ConfirmSwapEvent.amount_out

IF user_input > 0:
    → increase_size (用户投入了本金)
ELSE:
    → increase_leverage (用户没有投入本金，deposit = swap_out)
```

### 4.2 decrease_size vs decrease_leverage

**事件组合**: `WithdrawEvent + RepayEvent`

#### 4.2.1 两种操作的 SDK 流程对比

| 步骤 | decrease_size | decrease_leverage |
|------|---------------|-------------------|
| 1 | Flash loan 借**债务资产** | Flash loan 借**抵押资产** X |
| 2 | Repay 还债 | Swap X → 债务资产 |
| 3 | Withdraw 抵押资产 Y | Repay 还债 |
| 4 | Swap 部分 Y → 债务资产 (还 flash loan) | Withdraw X (还 flash loan) |
| 5 | 剩余 Y 返还用户 | - |

#### 4.2.2 关键特征

| 特征 | decrease_size | decrease_leverage |
|------|---------------|-------------------|
| ConfirmSwapEvent | **可选** | **必须存在** |
| Swap 方向 | collateral → debt | collateral → debt |
| swap_in vs withdraw | swap_in **<<** withdraw | swap_in **≈** withdraw |
| Flash Loan 借入币种 | 债务资产 | 抵押资产 |

**重要**: 两者的 Swap 方向**都是** collateral → debt，**不能**通过 swap.from 币种来区分！

#### 4.2.3 精确区分方法

```typescript
function distinguishDecreaseAction(
  events: TransactionEvents,
  position: { is_long: boolean, base_token: string, quote_token: string }
): { action: string, amount: string, coinType: string } {

  const { is_long, base_token, quote_token } = position
  const collateralCoinType = is_long ? base_token : quote_token

  // 根据 coin_type 筛选抵押资产的 WithdrawEvent
  const withdrawEvent = events.withdrawEvents.find(e => e.coin_type === collateralCoinType)
  const hasSwap = events.confirmSwapEvents.length > 0

  // ========== 步骤 1: 检查是否有 Swap 事件 ==========
  if (!hasSwap) {
    // 无 swap 事件 → decrease_size
    // 原因: decrease_leverage 必须有 swap (将抵押资产换成债务资产还债)
    return {
      action: 'decrease_size',
      amount: withdrawEvent.withdraw_amount,
      coinType: withdrawEvent.coin_type  // 抵押资产
    }
  }

  // ========== 步骤 2: 有 Swap，通过比例判断 ==========
  const swapEvent = events.confirmSwapEvents[0]
  const swapIn = BigInt(swapEvent.amount_in)
  const withdrawAmount = BigInt(withdrawEvent.withdraw_amount)

  // 计算 swap_in / withdraw_amount 比例
  const ratio = Number(swapIn * 100n / withdrawAmount) / 100

  if (ratio >= 0.95 && ratio <= 1.05) {
    // swap_in ≈ withdraw (95%-105%)
    // → decrease_leverage
    // 原因: flash loan 借抵押资产 X，全部 X 用于 swap，withdraw X 用于还 flash loan
    return {
      action: 'decrease_leverage',
      amount: '0',  // 固定值
      coinType: withdrawEvent.coin_type  // 抵押资产
    }
  }

  // swap_in << withdraw (比例 < 95%)
  // → decrease_size
  // 原因: 只有部分 withdraw 被 swap 用于还 flash loan，大部分返还用户
  return {
    action: 'decrease_size',
    amount: withdrawEvent.withdraw_amount,
    coinType: withdrawEvent.coin_type  // 抵押资产
  }
}
```

#### 4.2.4 判断逻辑总结

```
IF 无 ConfirmSwapEvent:
    → decrease_size
    → amount = withdraw_amount
    → coinType = withdraw.coin_type

ELSE IF swap_in / withdraw_amount ∈ [0.95, 1.05]:
    → decrease_leverage
    → amount = '0' (固定值)
    → coinType = withdraw.coin_type

ELSE (swap_in / withdraw_amount < 0.95):
    → decrease_size
    → amount = withdraw_amount
    → coinType = withdraw.coin_type
```

#### 4.2.5 为什么比例判断有效？

**decrease_leverage 的数量关系**:
```
flash_loan_amount = X (抵押资产)
swap_in = X (全部 flash loan 用于 swap)
withdraw_amount = X (用于还 flash loan)

→ swap_in ≈ withdraw_amount ≈ X
→ 比例 ≈ 1.0
```

**decrease_size 的数量关系**:
```
flash_loan_amount = F (债务资产)
withdraw_amount = Y (抵押资产，返还用户 + 还 flash loan)
swap_in = 部分 Y (只用于还 flash loan 的部分)

→ swap_in << withdraw_amount
→ 比例 << 1.0 (通常 10%-50%)
```

#### 4.2.6 注意事项

1. **两者 Swap 方向相同**: 都是 collateral → debt，不能用 `swap.from` 币种判断
2. **CoinType 统一返回抵押资产**: 即 `withdraw.coin_type`，不要返回 `swap.target`
3. **Amount 区别**:
   - decrease_size: 返回 `withdraw_amount`
   - decrease_leverage: 返回 `'0'` (原 context 设计如此)

---

## 5. 边界情况

### 5.1 多个 WithdrawEvent

`close_position` 和 `decrease_size` 可能产生多个 `WithdrawEvent`:
- 主要抵押资产的 WithdrawEvent
- 奖励资产的 WithdrawEvent

**处理规则**: 不能依赖事件顺序，需要根据 `coin_type` 筛选：
```typescript
// 根据仓位方向确定抵押资产类型
const collateralCoinType = is_long ? base_token : quote_token

// 筛选出抵押资产的 WithdrawEvent
const mainWithdrawEvent = withdrawEvents.find(e => e.coin_type === collateralCoinType)
```

### 5.2 decrease_size 自动转 close_position

当用户请求提取的比例 >= 100% 时，SDK 自动调用 `close_position`，会产生 `ClosePositionEvent`

**处理规则**:
- **Action Type**: 以 `ClosePositionEvent` 存在为准，判定为 `close_position`
- **WithdrawEvent**: 根据 `coin_type` 筛选，不依赖事件顺序

```typescript
// Action 判断：ClosePositionEvent 存在即为 close_position
if (events.closePositionEvent) {
  action = 'close_position'
}

// Amount/CoinType 提取：根据 coin_type 筛选 WithdrawEvent
const collateralCoinType = is_long ? base_token : quote_token
const withdrawEvent = events.withdrawEvents.find(e => e.coin_type === collateralCoinType)
```

### 5.3 increase_leverage / decrease_leverage 的 amount 为 0

这两个 Action 原始 context 中的 amount 就是 `'0'`

---

## 6. 事件顺序规则

| Action | 典型事件顺序 |
|--------|-------------|
| open_position | `[ConfirmSwapEvent?] → OpenPositionEvent → DepositEvent → BorrowEvent` |
| close_position | `RepayEvent → WithdrawEvent(多个) → [ConfirmSwapEvent?] → ClosePositionEvent` |
| increase_size | `[ConfirmSwapEvent?] → DepositEvent → BorrowEvent` |
| decrease_size | `RepayEvent → WithdrawEvent(多个) → [ConfirmSwapEvent?]` |
| increase_leverage | `ConfirmSwapEvent → DepositEvent → BorrowEvent` |
| decrease_leverage | `ConfirmSwapEvent → RepayEvent → WithdrawEvent` |
| top_up_collateral | `[ConfirmSwapEvent?] → DepositEvent` |
| repay_debt | `[ConfirmSwapEvent?] → RepayEvent` |
| claim_reward | `ClaimRewardEvent` |
| withdraw_collateral | `WithdrawEvent` |

---

## 8. 总结

### 确定性规则（6 种 Action）
- `open_position`: OpenPositionEvent 存在
- `close_position`: ClosePositionEvent 存在
- `claim_reward`: 仅 ClaimRewardEvent
- `withdraw_collateral`: 仅 WithdrawEvent
- `top_up_collateral`: 仅 DepositEvent（无 BorrowEvent）
- `repay_debt`: 仅 RepayEvent（无 WithdrawEvent）

### 需要辅助判断的规则（4 种 Action）
- `increase_size` vs `increase_leverage`: 检查是否有用户本金输入
- `decrease_size` vs `decrease_leverage`: 检查 Flash Loan 借入币种

### 核心注意点
1. **事件中的 amount 是处理后的数量**，可能与用户原始输入不同
2. **increase_leverage / decrease_leverage 的 amount 原本就是 0**
3. **可能有多个 WithdrawEvent**，第一个是主操作
4. **decrease_size 可能自动转为 close_position**
