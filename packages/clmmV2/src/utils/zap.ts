import BN from 'bn.js'
import { SwapResult } from '../types/zap'
import { ClmmPoolUtil, d, getTickSide, TickMath } from '@cetusprotocol/common-sdk'

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
 * Verify swap data and calculate remaining amounts for liquidity provision
 * @param swapData - Result of the swap operation
 * @param original_input_amount - Original input amount before swap
 * @param original_sqrt_price - Original square root price before swap
 * @param fix_amount_a - Whether to fix the amount of token A
 * @param lower_tick - Lower tick boundary of the position
 * @param upper_tick - Upper tick boundary of the position
 * @param slippage - Slippage tolerance for the calculation
 * @returns Object containing:
 *   - remain_amount: Remaining amount after swap
 *   - fix_liquidity_amount_a: Whether to fix token A amount
 *   - is_valid_swap_result: Whether the swap result is valid
 *   - amount_a: Amount of token A to be used
 *   - amount_b: Amount of token B to be used
 *   - liquidity: Calculated liquidity amount
 *   - amount_limit_a: Minimum amount limit for token A
 *   - amount_limit_b: Minimum amount limit for token B
 */
export function verifySwapData(
  swapData: SwapResult,
  original_input_amount: string,
  original_sqrt_price: string,
  fix_amount_a: boolean,
  lower_tick: number,
  upper_tick: number,
  slippage: number,
  swap_slippage: number
) {
  const { after_sqrt_price, swap_in_amount, swap_out_amount } = swapData

  const afterTick = TickMath.sqrtPriceX64ToTickIndex(new BN(after_sqrt_price))
  const originalTick = TickMath.sqrtPriceX64ToTickIndex(new BN(original_sqrt_price))

  const afterTickSide = getTickSide(afterTick, lower_tick, upper_tick)
  const originalTickSide = getTickSide(originalTick, lower_tick, upper_tick)

  // After the swap, if the direction of the range changes, throw an exception
  if (afterTickSide !== originalTickSide) {
    throw new Error('Swap price out of range')
  }

  const swap_out_amount_limit = d(swap_out_amount)
    .mul(1 - swap_slippage)
    .toFixed(0)

  const after_amount_a = fix_amount_a ? d(original_input_amount).sub(swap_in_amount) : d(swap_out_amount_limit)
  const after_amount_b = fix_amount_a ? d(swap_out_amount_limit) : d(original_input_amount).sub(swap_in_amount)

  const { fix_liquidity_amount_a, use_amount_a, use_amount_b, liquidity, amount_limit_a, amount_limit_b, is_enough_amount, remain_amount } =
    calculateLiquidityAmountSide(
      after_amount_a.toString(),
      after_amount_b.toString(),
      original_sqrt_price,
      lower_tick,
      upper_tick,
      slippage,
      fix_amount_a
    )

  console.log('🚀 ~ is_enough_amount:', {
    is_enough_amount,
    original_input_amount,
    fix_liquidity_amount_a,
    after_amount_a,
    after_amount_b,
    remain_amount,
  })

  return {
    remain_amount,
    fix_liquidity_amount_a,
    is_valid_swap_result: is_enough_amount,
    amount_a: use_amount_a,
    amount_b: use_amount_b,
    liquidity,
    amount_limit_a,
    amount_limit_b,
  }
}
