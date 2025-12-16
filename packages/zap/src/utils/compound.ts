import BN from 'bn.js'
import { ClmmPoolUtil, d, fixCoinType } from '@cetusprotocol/common-sdk'

/**
 * Calculate liquidity amounts with fallback strategy
 * First tries to fix amount_a, if not enough then tries to fix amount_b
 * @param current_sqrt_price - Current sqrt price of the pool
 * @param tick_lower - Lower tick boundary of the position
 * @param tick_upper - Upper tick boundary of the position
 * @param amount_a - Amount of token A available
 * @param amount_b - Amount of token B available
 * @param slippage - Slippage tolerance for the calculation
 * @returns Object containing:
 *   - liquidity: Calculated liquidity amount
 *   - use_amount_a: Amount of token A to be used
 *   - use_amount_b: Amount of token B to be used
 *   - amount_limit_a: Minimum amount limit for token A
 *   - amount_limit_b: Minimum amount limit for token B
 *   - fix_amount_a: Whether amount A was fixed (true) or amount B was fixed (false)
 *   - remain_amount: Remaining amount of the non-fixed token
 *   - is_enough_amount: Whether there was enough amount for the calculation
 */
export function calculateLiquidityWithFallback({
    current_sqrt_price,
    tick_lower,
    tick_upper,
    amount_a,
    amount_b,
    slippage
  }:{
    current_sqrt_price: string,
    tick_lower: number,
    tick_upper: number,
    amount_a: string,
    amount_b: string,
    slippage: number
  }
) {
  // First try to fix amount_a (fix_amount_a = true)
  const fixAmountA = new BN(amount_a)
  
  const liquidityInputA = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
    tick_lower,
    tick_upper,
    fixAmountA,
    true, // fix_amount_a = true
    true, // round_up = true
    slippage,
    new BN(current_sqrt_price)
  )

  const use_amount_a_fixed = fixAmountA.toString()
  const use_amount_b_calculated = liquidityInputA.coin_amount_b.toString()
  
  const remain_amount_b = d(amount_b).sub(use_amount_b_calculated)
  const is_enough_amount_b = remain_amount_b.gte(0)

  // If we have enough amount_b, return the result with fix_amount_a = true
  if (is_enough_amount_b) {
    return {
      liquidity: liquidityInputA.liquidity_amount,
      use_amount_a: use_amount_a_fixed,
      use_amount_b: use_amount_b_calculated,
      amount_limit_a: liquidityInputA.coin_amount_limit_a,
      amount_limit_b: liquidityInputA.coin_amount_limit_b,
      fix_amount_a: true,
      remain_amount: remain_amount_b,
      is_enough_amount: true
    }
  }

  // If not enough amount_b, try to fix amount_b (fix_amount_a = false)
  const fixAmountB = new BN(amount_b)
  console.log("🚀 ~ calculateLiquidityWithFallback ~ fixAmountB:", fixAmountB.toString())
  
  const liquidityInputB = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
    tick_lower,
    tick_upper,
    fixAmountB,
    false, // fix_amount_a = false
    true, // round_up = true
    slippage,
    new BN(current_sqrt_price)
  )
  console.log("🚀 ~ calculateLiquidityWithFallback ~ liquidityInputB:", JSON.stringify(liquidityInputB, null, 2))

  const use_amount_a_calculated = liquidityInputB.coin_amount_a.toString()
  const use_amount_b_fixed = fixAmountB.toString()
  
  const remain_amount_a = d(amount_a).sub(use_amount_a_calculated)
  const is_enough_amount_a = remain_amount_a.gte(0)

  // Return the result with fix_amount_a = false
  return {
    liquidity: liquidityInputB.liquidity_amount,
    use_amount_a: use_amount_a_calculated,
    use_amount_b: use_amount_b_fixed,
    amount_limit_a: liquidityInputB.coin_amount_limit_a,
    amount_limit_b: liquidityInputB.coin_amount_limit_b,
    fix_amount_a: false,
    remain_amount: remain_amount_a,
    is_enough_amount: is_enough_amount_a
  }
}

export function isEmptyObj(obj: any) {
  if (obj === null || typeof obj !== 'object') {
    return true;
  }
  return Object.keys(obj).length === 0;
}

export function isNotMergeCoin(not_merge_coins: string[], coin_type: string) {
  const fixCoinTypeNotMergeCoins = not_merge_coins.map((coin) => fixCoinType(coin))
  return !fixCoinTypeNotMergeCoins.includes(fixCoinType(coin_type))
}

export function isSameType(coin_type1: string, coin_type2: string) {
  return fixCoinType(coin_type1) === fixCoinType(coin_type2)
}
