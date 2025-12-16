import BN from 'bn.js'
import { SwapResult } from '../types/zap'
import { ClmmPoolUtil, d, getTickSide, TickMath } from '@cetusprotocol/common-sdk'
import Decimal from 'decimal.js'

/**
 * Calculate if there is enough liquidity amount for adding liquidity to a pool
 * @param amount_a - Amount of token A
 * @param amount_b - Amount of token B
 * @param curr_sqrt_price - Current square root price of the pool
 * @param lower_tick - Lower tick boundary of the position
 * @param upper_tick - Upper tick boundary of the position
 * @param slippage - Slippage tolerance for the calculation
 * @param fix_amount_a - Whether to fix the amount of token A
 * @returns Object containing:
 *   - is_enough_amount: Whether there is enough amount for the other token
 *   - use_amount_a: Amount of token A to be used
 *   - use_amount_b: Amount of token B to be used
 *   - liquidity: Calculated liquidity amount
 *   - amount_limit_a: Minimum amount limit for token A
 *   - amount_limit_b: Minimum amount limit for token B
 *   - remain_amount: Remaining amount of the non-fixed token
 */
export function calculateLiquidityAmountEnough(
  amount_a: string,
  amount_b: string,
  curr_sqrt_price: string,
  lower_tick: number,
  upper_tick: number,
  slippage: number,
  fix_amount_a: boolean
) {
  const fixCoinAmount = fix_amount_a ? new BN(amount_a) : new BN(amount_b)

  const liquidityInput = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
    lower_tick,
    upper_tick,
    fixCoinAmount,
    fix_amount_a,
    true,
    slippage,
    new BN(curr_sqrt_price)
  )

  const use_amount_a = fix_amount_a ? fixCoinAmount.toString() : liquidityInput.coin_amount_a.toString()
  const use_amount_b = fix_amount_a ? liquidityInput.coin_amount_b.toString() : fixCoinAmount.toString()

  const remain_amount_a = d(amount_a).sub(use_amount_a)
  const remain_amount_b = d(amount_b).sub(use_amount_b)

  const is_enough_amount = fix_amount_a ? remain_amount_b.gte(0) : remain_amount_a.gte(0)

  return {
    is_enough_amount,
    use_amount_a,
    use_amount_b,
    liquidity: liquidityInput.liquidity_amount,
    amount_limit_a: liquidityInput.coin_amount_limit_a,
    amount_limit_b: liquidityInput.coin_amount_limit_b,
    remain_amount: fix_amount_a ? remain_amount_b : remain_amount_a,
  }
}
/**
 * Calculate the optimal side for adding liquidity based on current price and tick range
 * @param amount_a - Amount of token A
 * @param amount_b - Amount of token B
 * @param curr_sqrt_price - Current square root price of the pool
 * @param lower_tick - Lower tick boundary of the position
 * @param upper_tick - Upper tick boundary of the position
 * @param slippage - Slippage tolerance for the calculation
 * @param fix_amount_a - Whether to fix the amount of token A
 * @returns Object containing:
 *   - fix_liquidity_amount_a: Whether to fix token A amount
 *   - is_enough_amount: Whether there is enough amount for the other token
 *   - use_amount_a: Amount of token A to be used
 *   - use_amount_b: Amount of token B to be used
 *   - liquidity: Calculated liquidity amount
 *   - amount_limit_a: Minimum amount limit for token A
 *   - amount_limit_b: Minimum amount limit for token B
 *   - remain_amount: Remaining amount of the non-fixed token
 */
export function calculateLiquidityAmountSide(
  amount_a: string,
  amount_b: string,
  curr_sqrt_price: string,
  lower_tick: number,
  upper_tick: number,
  slippage: number,
  fix_amount_a: boolean
) {
  const currTick = TickMath.sqrtPriceX64ToTickIndex(new BN(curr_sqrt_price))
  let fix_liquidity_amount_a = fix_amount_a

  if (currTick < lower_tick) {
    fix_liquidity_amount_a = true
  } else if (currTick > upper_tick) {
    fix_liquidity_amount_a = false
  }

  let res = calculateLiquidityAmountEnough(amount_a, amount_b, curr_sqrt_price, lower_tick, upper_tick, slippage, fix_liquidity_amount_a)
  // If not enough, fix the other side to add liquidity
  if (!res.is_enough_amount) {
    fix_liquidity_amount_a = !fix_liquidity_amount_a
    res = calculateLiquidityAmountEnough(amount_a, amount_b, curr_sqrt_price, lower_tick, upper_tick, slippage, fix_liquidity_amount_a)
  }
  return {
    fix_liquidity_amount_a,
    ...res,
  }
}

/**
 * Calculate the swap amount needed to achieve target ratio
 * @param coin_amount - Total coin amount available
 * @param fix_amount_a - Whether to fix token A amount (true) or token B amount (false)
 * @param current_price - Current price:
 *   - When fix_amount_a = true: current_price = B/A (price of B in terms of A)
 *   - When fix_amount_a = false: current_price = A/B (price of A in terms of B)
 * @param target_ratio - Target ratio to achieve:
 *   - When fix_amount_a = true: target_ratio = B/A
 *   - When fix_amount_a = false: target_ratio = A/B
 * @param tolerance - Tolerance for the target ratio (default: 0.01)
 * @returns Object containing:
 *   - swap_amount: Amount to swap
 *   - final_amount_a: Final amount of token A (remaining A when fix_amount_a=true, obtained A when fix_amount_a=false)
 *   - final_amount_b: Final amount of token B (obtained B when fix_amount_a=true, remaining B when fix_amount_a=false)
 */
export function calcExactSwapAmount(coin_amount: string, fix_amount_a: boolean, current_price: string, target_ratio: string) {
  const amount = d(coin_amount)

  const price = d(current_price)
  const target = d(target_ratio)

  const maxSwap = amount

  // initial balances
  const A0 = fix_amount_a ? amount : d(0)
  const B0 = fix_amount_a ? d(0) : amount

  // desired ratio range
  const maxR = target
  // Ensure minR is not negative (ratio must be positive)
  const minR = d(target).mul(0.999)

  let left = d(0)
  let right = maxSwap
  let best: Decimal | null = null

  function computeFinal(x: Decimal) {
    if (fix_amount_a) {
      const A = A0.minus(x)
      const B = B0.plus(x.mul(price))
      return { A, B, R: B.div(A) }
    } else {
      const A = A0.plus(x.mul(price))
      const B = B0.minus(x)
      return { A, B, R: A.div(B) }
    }
  }

  // binary search
  for (let i = 0; i < 120; i++) {
    const mid = left.plus(right).div(2)
    const { A, B, R } = computeFinal(mid)

    if (A.lte(0) || B.lte(0)) {
      right = mid
      continue
    }

    if (R.gt(maxR)) {
      // Ratio is too high → swapped too much → decrease swap amount
      right = mid
    } else if (R.lt(minR)) {
      // Ratio is too low → swapped too little → increase swap
      left = mid
    } else {
      best = mid // In the range
      if (d(minR).eq(0)) {
        break
      }
      right = mid // Continue to find a smaller swap
    }
  }

  if (!best) {
    return {
      swap_amount: '0',
      final_amount_a: A0.toFixed(0),
      final_amount_b: B0.toFixed(0),
    }
  }

  const { A, B } = computeFinal(best)

  return {
    swap_amount: best.toFixed(0),
    final_amount_a: A.toFixed(0),
    final_amount_b: B.toFixed(0),
  }
}
