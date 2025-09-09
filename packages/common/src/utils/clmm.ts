import type { Transaction } from '@mysten/sui/dist/cjs/transactions'
import BN from 'bn.js'
import { DETAILS_KEYS } from '../errors/baseError'
import { CommonErrorCode, handleMessageError } from '../errors/errors'
import type { CoinAmounts, LiquidityInput } from '../type/clmm'
import { MAX_SQRT_PRICE, MIN_SQRT_PRICE, PositionStatus } from '../type/clmm'
import type { Package } from '../type/sui'
import Decimal from './decimal'
import { d, fromDecimalsAmount, toDecimalsAmount } from './numbers'
import { TickMath } from './tickMath'
import { MathUtil, ONE, U64_MAX, ZERO } from './utils'

/**
 * Get the amount A delta about two prices, for give amount of liquidity.
 * `delta_a = (liquidity * delta_sqrt_price) / sqrt_price_upper * sqrt_price_lower)`
 *
 * @param sqrt_price_0 - A sqrt price
 * @param sqrt_price_1 - Another sqrt price
 * @param liquidity - The amount of usable liquidity
 * @param round_up - Whether to round the amount up or down
 * @returns
 */
export function getDeltaA(sqrt_price_0: BN, sqrt_price_1: BN, liquidity: BN, round_up: boolean): BN {
  const sqrt_price_diff = sqrt_price_0.gt(sqrt_price_1) ? sqrt_price_0.sub(sqrt_price_1) : sqrt_price_1.sub(sqrt_price_0)
  const numerator = liquidity.mul(sqrt_price_diff).shln(64)
  const denominator = sqrt_price_0.mul(sqrt_price_1)
  const quotient = numerator.div(denominator)
  const remainder = numerator.mod(denominator)
  const result = round_up && !remainder.eq(ZERO) ? quotient.add(new BN(1)) : quotient
  return result
}

/**
 * Get the amount B delta about two prices, for give amount of liquidity.
 * `delta_a = (liquidity * delta_sqrt_price) / sqrt_price_upper * sqrt_price_lower)`
 *
 * @param sqrt_price_0 - A sqrt price
 * @param sqrt_price_1 - Another sqrt price
 * @param liquidity - The amount of usable liquidity
 * @param round_up - Whether to round the amount up or down
 * @returns
 */
export function getDeltaB(sqrt_price_0: BN, sqrt_price_1: BN, liquidity: BN, round_up: boolean): BN {
  const sqrt_price_diff = sqrt_price_0.gt(sqrt_price_1) ? sqrt_price_0.sub(sqrt_price_1) : sqrt_price_1.sub(sqrt_price_0)
  if (liquidity.eq(ZERO) || sqrt_price_diff.eq(ZERO)) {
    return ZERO
  }
  const p = liquidity.mul(sqrt_price_diff)
  const should_round_up = round_up && p.and(U64_MAX).gt(ZERO)
  const result = should_round_up ? p.shrn(64).add(ONE) : p.shrn(64)
  if (MathUtil.isOverflow(result, 64)) {
    throw new Error('Result large than u64 max')
  }
  return result
}

/**
 * Get the next sqrt price from give a delta of token_a.
 * `new_sqrt_price = (sqrt_price * liquidity) / (liquidity +/- amount * sqrt_price)`
 *
 * @param sqrt_price - The start sqrt price
 * @param liquidity - The amount of usable liquidity
 * @param amount - The amount of token_a
 * @param by_amount_in - Weather to fixed input
 */
export function getNextSqrtPriceAUp(sqrt_price: BN, liquidity: BN, amount: BN, by_amount_in: boolean): BN {
  if (amount.eq(ZERO)) {
    return sqrt_price
  }
  const numerator = MathUtil.checkMulShiftLeft(sqrt_price, liquidity, 64, 256)
  const liquidity_shl_64 = liquidity.shln(64)
  const product = MathUtil.checkMul(sqrt_price, amount, 256)
  if (!by_amount_in && liquidity_shl_64.lte(product)) {
    throw new Error('getNextSqrtPriceAUp - Unable to divide liquidityShl64 by product')
  }
  const next_sqrt_price = by_amount_in
    ? MathUtil.checkDivRoundUpIf(numerator, liquidity_shl_64.add(product), true)
    : MathUtil.checkDivRoundUpIf(numerator, liquidity_shl_64.sub(product), true)
  if (next_sqrt_price.lt(new BN(MIN_SQRT_PRICE))) {
    throw new Error('getNextSqrtPriceAUp - Next sqrt price less than min sqrt price')
  }
  if (next_sqrt_price.gt(new BN(MAX_SQRT_PRICE))) {
    throw new Error('getNextSqrtPriceAUp - Next sqrt price greater than max sqrt price')
  }

  return next_sqrt_price
}

/**
 * Get the next sqrt price from give a delta of token_b.
 * `new_sqrt_price = (sqrt_price +(delta_b / liquidity)`
 *
 * @param sqrt_price - The start sqrt price
 * @param liquidity - The amount of usable liquidity
 * @param amount - The amount of token_a
 * @param by_amount_in - Weather to fixed input
 */
export function getNextSqrtPriceBDown(sqrt_price: BN, liquidity: BN, amount: BN, by_amount_in: boolean): BN {
  const delta_sqrt_price = MathUtil.checkDivRoundUpIf(amount.shln(64), liquidity, !by_amount_in)
  const next_sqrt_price = by_amount_in ? sqrt_price.add(delta_sqrt_price) : sqrt_price.sub(delta_sqrt_price)

  if (next_sqrt_price.lt(new BN(MIN_SQRT_PRICE)) || next_sqrt_price.gt(new BN(MAX_SQRT_PRICE))) {
    throw new Error('getNextSqrtPriceAUp - Next sqrt price out of bounds')
  }

  return next_sqrt_price
}

/**
 * Get next sqrt price from input parameter.
 *
 * @param sqrt_price
 * @param liquidity
 * @param amount
 * @param a_to_b
 * @returns
 */
export function getNextSqrtPriceFromInput(sqrt_price: BN, liquidity: BN, amount: BN, a_to_b: boolean): BN {
  return a_to_b ? getNextSqrtPriceAUp(sqrt_price, liquidity, amount, true) : getNextSqrtPriceBDown(sqrt_price, liquidity, amount, true)
}

/**
 * Get the next sqrt price from output parameters.
 *
 * @param sqrt_price
 * @param liquidity
 * @param amount
 * @param a_to_b
 * @returns
 */
export function getNextSqrtPriceFromOutput(sqrt_price: BN, liquidity: BN, amount: BN, a_to_b: boolean): BN {
  return a_to_b ? getNextSqrtPriceBDown(sqrt_price, liquidity, amount, false) : getNextSqrtPriceAUp(sqrt_price, liquidity, amount, false)
}

/**
 * Get the amount of delta_a or delta_b from input parameters, and round up result.
 *
 * @param current_sqrt_price
 * @param target_sqrt_price
 * @param liquidity
 * @param a_to_b
 * @returns
 */
export function getDeltaUpFromInput(current_sqrt_price: BN, target_sqrt_price: BN, liquidity: BN, a_to_b: boolean): BN {
  const sqrt_price_diff = current_sqrt_price.gt(target_sqrt_price)
    ? current_sqrt_price.sub(target_sqrt_price)
    : target_sqrt_price.sub(current_sqrt_price)

  if (liquidity.lte(ZERO) || sqrt_price_diff.eq(ZERO)) {
    return ZERO
  }

  let result
  if (a_to_b) {
    const numerator = new BN(liquidity).mul(new BN(sqrt_price_diff)).shln(64)
    const denominator = target_sqrt_price.mul(current_sqrt_price)
    const quotient = numerator.div(denominator)
    const remainder = numerator.mod(denominator)
    result = !remainder.eq(ZERO) ? quotient.add(ONE) : quotient
  } else {
    const product = new BN(liquidity).mul(new BN(sqrt_price_diff))
    const should_round_up = product.and(U64_MAX).gt(ZERO)
    result = should_round_up ? product.shrn(64).add(ONE) : product.shrn(64)
  }
  return result
}

/**
 * Get the amount of delta_a or delta_b from output parameters, and round down result.
 *
 * @param current_sqrt_price
 * @param target_sqrt_price
 * @param liquidity
 * @param a_to_b
 * @returns
 */
export function getDeltaDownFromOutput(current_sqrt_price: BN, target_sqrt_price: BN, liquidity: BN, a_to_b: boolean): BN {
  const sqrt_price_diff = current_sqrt_price.gt(target_sqrt_price)
    ? current_sqrt_price.sub(target_sqrt_price)
    : target_sqrt_price.sub(current_sqrt_price)

  if (liquidity.lte(ZERO) || sqrt_price_diff.eq(ZERO)) {
    return ZERO
  }

  let result
  if (a_to_b) {
    const product = liquidity.mul(sqrt_price_diff)
    result = product.shrn(64)
  } else {
    const numerator = liquidity.mul(sqrt_price_diff).shln(64)
    const denominator = target_sqrt_price.mul(current_sqrt_price)
    result = numerator.div(denominator)
  }
  return result
}

/**
 * Estimate liquidity for coin A
 * @param sqrt_price_x - coin A sqrt price
 * @param sqrt_price_y - coin B sqrt price
 * @param coin_amount - token amount
 * @return
 */
export function estimateLiquidityForCoinA(sqrt_price_x: BN, sqrt_price_y: BN, coin_amount: BN) {
  const lower_sqrt_price_x64 = BN.min(sqrt_price_x, sqrt_price_y)
  const upper_sqrt_price_x64 = BN.max(sqrt_price_x, sqrt_price_y)
  const num = MathUtil.fromX64BN(coin_amount.mul(upper_sqrt_price_x64).mul(lower_sqrt_price_x64))
  const dem = upper_sqrt_price_x64.sub(lower_sqrt_price_x64)
  return !num.isZero() && !dem.isZero() ? num.div(dem) : new BN(0)
}

/**
 * Estimate liquidity for coin B
 * @param sqrt_price_x - coin A sqrt price
 * @param sqrt_price_y - coin B sqrt price
 * @param coin_amount - token amount
 * @return
 */
export function estimateLiquidityForCoinB(sqrt_price_x: BN, sqrt_price_y: BN, coin_amount: BN) {
  const lower_sqrt_price_x64 = BN.min(sqrt_price_x, sqrt_price_y)
  const upper_sqrt_price_x64 = BN.max(sqrt_price_x, sqrt_price_y)
  const delta = upper_sqrt_price_x64.sub(lower_sqrt_price_x64)
  return !delta.isZero() ? coin_amount.shln(64).div(delta) : new BN(0)
}

export class ClmmPoolUtil {
  /**
   * Get token amount from liquidity.
   * @param liquidity - liquidity
   * @param cur_sqrt_price - Pool current sqrt price
   * @param lower_sqrt_price - position lower sqrt price
   * @param upper_sqrt_price - position upper sqrt price
   * @param round_up - is round up
   * @returns
   */
  static getCoinAmountFromLiquidity(
    liquidity: BN,
    cur_sqrt_price: BN,
    lower_sqrt_price: BN,
    upper_sqrt_price: BN,
    round_up: boolean
  ): CoinAmounts {
    const liq = new Decimal(liquidity.toString())
    const cur_sqrt_price_str = new Decimal(cur_sqrt_price.toString())
    const lower_price_str = new Decimal(lower_sqrt_price.toString())
    const upper_price_str = new Decimal(upper_sqrt_price.toString())
    let coin_a
    let coin_b
    if (cur_sqrt_price.lt(lower_sqrt_price)) {
      coin_a = MathUtil.toX64Decimal(liq).mul(upper_price_str.sub(lower_price_str)).div(lower_price_str.mul(upper_price_str))
      coin_b = new Decimal(0)
    } else if (cur_sqrt_price.lt(upper_sqrt_price)) {
      coin_a = MathUtil.toX64Decimal(liq).mul(upper_price_str.sub(cur_sqrt_price_str)).div(cur_sqrt_price_str.mul(upper_price_str))

      coin_b = MathUtil.fromX64Decimal(liq.mul(cur_sqrt_price_str.sub(lower_price_str)))
    } else {
      coin_a = new Decimal(0)
      coin_b = MathUtil.fromX64Decimal(liq.mul(upper_price_str.sub(lower_price_str)))
    }
    if (round_up) {
      return {
        coin_amount_a: coin_a.ceil().toString(),
        coin_amount_b: coin_b.ceil().toString(),
      }
    }
    return {
      coin_amount_a: coin_a.floor().toString(),
      coin_amount_b: coin_b.floor().toString(),
    }
  }

  /**
   * Estimate liquidity and token amount from one amounts
   * @param lower_tick - lower tick
   * @param upper_tick - upper tick
   * @param coin_amount - token amount
   * @param is_coin_a - is token A
   * @param round_up - is round up
   * @param is_increase - is increase
   * @param slippage - slippage percentage
   * @param cur_sqrt_price - current sqrt price.
   * @return IncreaseLiquidityInput
   */
  static estLiquidityAndCoinAmountFromOneAmounts(
    lower_tick: number,
    upper_tick: number,
    coin_amount: BN,
    is_coin_a: boolean,
    round_up: boolean,
    slippage: number,
    cur_sqrt_price: BN
  ): LiquidityInput {
    const current_tick = TickMath.sqrtPriceX64ToTickIndex(cur_sqrt_price)
    const lower_sqrt_price = TickMath.tickIndexToSqrtPriceX64(lower_tick)
    const upper_sqrt_price = TickMath.tickIndexToSqrtPriceX64(upper_tick)
    let liquidity
    if (current_tick < lower_tick) {
      if (!is_coin_a) {
        throw new Error('lower tick cannot calculate liquidity by coinB')
      }
      liquidity = estimateLiquidityForCoinA(lower_sqrt_price, upper_sqrt_price, coin_amount)
    } else if (current_tick > upper_tick) {
      if (is_coin_a) {
        throw new Error('upper tick cannot calculate liquidity by coinA')
      }
      liquidity = estimateLiquidityForCoinB(upper_sqrt_price, lower_sqrt_price, coin_amount)
    } else if (is_coin_a) {
      liquidity = estimateLiquidityForCoinA(cur_sqrt_price, upper_sqrt_price, coin_amount)
    } else {
      liquidity = estimateLiquidityForCoinB(cur_sqrt_price, lower_sqrt_price, coin_amount)
    }
    const coin_amounts = ClmmPoolUtil.getCoinAmountFromLiquidity(liquidity, cur_sqrt_price, lower_sqrt_price, upper_sqrt_price, round_up)
    const token_limit_a = round_up
      ? d(coin_amounts.coin_amount_a.toString())
          .mul(1 + slippage)
          .toString()
      : d(coin_amounts.coin_amount_a.toString())
          .mul(1 - slippage)
          .toString()

    const token_limit_b = round_up
      ? d(coin_amounts.coin_amount_b.toString())
          .mul(1 + slippage)
          .toString()
      : d(coin_amounts.coin_amount_b.toString())
          .mul(1 - slippage)
          .toString()

    return {
      coin_amount_a: coin_amounts.coin_amount_a,
      coin_amount_b: coin_amounts.coin_amount_b,
      coin_amount_limit_a: round_up ? Decimal.ceil(token_limit_a).toString() : Decimal.floor(token_limit_a).toString(),
      coin_amount_limit_b: round_up ? Decimal.ceil(token_limit_b).toString() : Decimal.floor(token_limit_b).toString(),
      liquidity_amount: liquidity.toString(),
      fix_amount_a: is_coin_a,
    }
  }

  /**
   * Estimate liquidity from token amounts
   * @param cur_sqrt_price - current sqrt price.
   * @param lower_tick - lower tick
   * @param upper_tick - upper tick
   * @param token_amount - token amount
   * @return
   */
  static estimateLiquidityFromCoinAmounts(cur_sqrt_price: BN, lower_tick: number, upper_tick: number, token_amount: CoinAmounts): string {
    if (lower_tick > upper_tick) {
      return handleMessageError(CommonErrorCode.InvalidTick, 'lower tick cannot be greater than lower tick', {
        [DETAILS_KEYS.METHOD_NAME]: 'estimateLiquidityFromCoinAmounts',
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          lower_tick,
          upper_tick,
          token_amount,
        },
      })
    }
    const curr_tick = TickMath.sqrtPriceX64ToTickIndex(cur_sqrt_price)
    const lower_sqrt_price = TickMath.tickIndexToSqrtPriceX64(lower_tick)
    const upper_sqrt_price = TickMath.tickIndexToSqrtPriceX64(upper_tick)
    if (curr_tick < lower_tick) {
      return estimateLiquidityForCoinA(lower_sqrt_price, upper_sqrt_price, new BN(token_amount.coin_amount_a)).toString()
    }
    if (curr_tick >= upper_tick) {
      return estimateLiquidityForCoinB(upper_sqrt_price, lower_sqrt_price, new BN(token_amount.coin_amount_b)).toString()
    }
    const estimate_liquidity_amount_a = estimateLiquidityForCoinA(cur_sqrt_price, upper_sqrt_price, new BN(token_amount.coin_amount_a))
    const estimate_liquidity_amount_b = estimateLiquidityForCoinB(cur_sqrt_price, lower_sqrt_price, new BN(token_amount.coin_amount_b))
    return BN.min(estimate_liquidity_amount_a, estimate_liquidity_amount_b).toString()
  }

  static calculateDepositRatio(lower_tick: number, upper_tick: number, cur_sqrt_price: BN) {
    // Use a fixed amount of token A with proper decimals
    const coin_amount_a = new BN(100000000)
    const { coin_amount_b } = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
      lower_tick,
      upper_tick,
      coin_amount_a,
      true,
      true,
      0,
      cur_sqrt_price
    )

    const curr_price = TickMath.sqrtPriceX64ToPrice(cur_sqrt_price, 0, 0)

    const transform_amount_b = d(coin_amount_a.toString()).mul(curr_price)

    const total_amount = transform_amount_b.add(coin_amount_b.toString())
    const ratio_a = transform_amount_b.div(total_amount)
    const ratio_b = d(coin_amount_b.toString()).div(total_amount)

    return { ratio_a, ratio_b }
  }

  static calculateAmountDepositRatio(
    lower_tick: number,
    upper_tick: number,
    cur_sqrt_price: BN,
    coin_decimal_a: number,
    coin_decimal_b: number
  ) {
    const curr_price = TickMath.sqrtPriceX64ToPrice(cur_sqrt_price, coin_decimal_a, coin_decimal_b)
    const current_tick = TickMath.sqrtPriceX64ToTickIndex(cur_sqrt_price)
    if (current_tick < lower_tick) {
      return { ratio_a: new Decimal(1), ratio_b: new Decimal(0), curr_price }
    }
    if (current_tick > upper_tick) {
      return { ratio_a: new Decimal(0), ratio_b: new Decimal(1), curr_price }
    }
    const coin_amount_a = new BN(toDecimalsAmount(1, coin_decimal_a))
    const { coin_amount_b: coin_amount_b } = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
      lower_tick,
      upper_tick,
      coin_amount_a,
      true,
      true,
      0,
      cur_sqrt_price
    )

    const amount_a = fromDecimalsAmount(coin_amount_a.toString(), coin_decimal_a)
    const amount_b = fromDecimalsAmount(coin_amount_b.toString(), coin_decimal_b)
    const total_amount = d(amount_a).add(amount_b)

    const ratio_a = d(amount_a).div(total_amount)

    const ratio_b = d(amount_b).div(total_amount)

    return { ratio_a, ratio_b, curr_price }
  }

  static getCoinAmountsFromRatio(
    ratio_a: Decimal,
    ratio_b: Decimal,
    total_value: string,
    token_price_a: string,
    token_price_b: string,
    decimals_a: number,
    decimals_b: number
  ) {
    const amount_a = d(toDecimalsAmount(d(total_value).mul(ratio_a).div(token_price_a).toString(), decimals_a)).toFixed(0)
    const amount_b = d(toDecimalsAmount(d(total_value).mul(ratio_b).div(token_price_b).toString(), decimals_b)).toFixed(0)

    return { amount_a, amount_b }
  }

  /**
   * Estimate coin amounts from total amount
   * @param lower_tick
   * @param upper_tick
   * @param decimals_a
   * @param decimals_b
   * @param cur_sqrt_price
   * @param total_amount
   * @param token_price_a
   * @param token_price_b
   * @returns
   */
  static estCoinAmountsFromTotalAmount(
    lower_tick: number,
    upper_tick: number,
    cur_sqrt_price: BN,
    total_value: string,
    token_price_a: string,
    token_price_b: string,
    decimals_a: number,
    decimals_b: number
  ) {
    const { ratio_a, ratio_b } = ClmmPoolUtil.calculateDepositRatio(lower_tick, upper_tick, cur_sqrt_price)

    return ClmmPoolUtil.getCoinAmountsFromRatio(ratio_a, ratio_b, total_value, token_price_a, token_price_b, decimals_a, decimals_b)
  }

  /**
   * Get the position status for the given tick indices.
   *
   * @param current_tick_index The current tick index.
   * @param lower_tick_index The lower tick index.
   * @param upper_tick_index The upper tick index.
   * @returns The position status.
   */
  static getPositionStatus(current_tick_index: number, lower_tick_index: number, upper_tick_index: number): PositionStatus {
    if (current_tick_index < lower_tick_index) {
      return PositionStatus.BelowRange
    }
    if (current_tick_index < upper_tick_index) {
      return PositionStatus.InRange
    }
    return PositionStatus.AboveRange
  }
}

/**
 * Utility function to retrieve packager configurations from a package object.
 * @param {Package<T>} package_obj - The package object containing configurations.
 * @throws {Error} Throws an error if the package does not have a valid config.
 * @returns {T} The retrieved configuration.
 */
export function getPackagerConfigs<T extends Package<any>>(package_obj: T): T extends Package<infer C> ? C : never {
  if (package_obj.config === undefined) {
    throw new Error(`package: ${package_obj.package_id}  not config in sdk SdkOptions`)
  }
  return package_obj.config as T extends Package<infer C> ? C : never
}

export async function printTransaction(tx: Transaction, is_print = true) {
  console.log(`inputs`, tx.getData().inputs)
  tx.getData().commands.forEach((item, index) => {
    if (is_print) {
      console.log(`transaction ${index}: `, item)
    }
  })
}
