import { d, DETAILS_KEYS, MathUtil } from '@cetusprotocol/common-sdk'
import { BIN_BOUND, MAX_BIN_PER_POSITION } from '../types/constants'
import Decimal from 'decimal.js'
import { BASIS_POINT_MAX } from '../types/constants'
import BN from 'bn.js'
import { DlmmErrorCode, handleError } from '../errors/errors'
import { BinAmount, BinLiquidityInfo } from '../types/dlmm'

const MAX_EXPONENTIAL = new BN(0x80000)
export const SCALE_OFFSET = 64
export const ONE = new BN(1).shln(SCALE_OFFSET)
const MAX = new BN(2).pow(new BN(128)).sub(new BN(1))

export class BinUtils {
  /**
   * Split bins into multiple smaller positions based on MAX_BIN_PER_POSITION
   * @param bins - The bins to split
   * @param lower_bin_id - The lower bin id
   * @param upper_bin_id - The upper bin id
   * @returns Array of bin info objects for each position
   */
  static splitBinLiquidityInfo(liquidity_bins: BinLiquidityInfo, lower_bin_id: number, upper_bin_id: number): BinLiquidityInfo[] {
    const position_count = BinUtils.getPositionCount(lower_bin_id, upper_bin_id)
    if (position_count <= 1) {
      return [liquidity_bins]
    }

    const positions: BinLiquidityInfo[] = []
    let current_lower = lower_bin_id

    for (let i = 0; i < position_count; i++) {
      const current_upper = Math.min(current_lower + MAX_BIN_PER_POSITION - 2, upper_bin_id)
      const position_bins = liquidity_bins.bins.filter((bin) => bin.bin_id >= current_lower && bin.bin_id <= current_upper)

      positions.push({
        bins: position_bins,
        amount_a: position_bins.reduce((acc, bin) => d(acc).plus(bin.amount_a), d(0)).toFixed(0),
        amount_b: position_bins.reduce((acc, bin) => d(acc).plus(bin.amount_b), d(0)).toFixed(0),
      })

      current_lower = current_upper + 1
    }

    return positions
  }

  /**
   * Process bins by rate
   * @param bins - The bins to be processed
   * @param rate - The rate to be applied
   * @returns The processed bins
   */
  static processBinsByRate(bins: BinAmount[], rate: string): BinLiquidityInfo {
    const used_bins: BinAmount[] = []
    let used_total_amount_a = d(0)
    let used_total_amount_b = d(0)

    bins.forEach((bin) => {
      const { amount_a, amount_b, liquidity = '0' } = bin
      const used_liquidity = d(rate).mul(liquidity).toFixed(0)
      let used_amount_a = d(amount_a).mul(rate)
      let used_amount_b = d(amount_b).mul(rate)

      if (d(used_amount_a).lt(1) && d(used_amount_a).gt(0)) {
        used_amount_a = d(1)
      }
      if (d(used_amount_b).lt(1) && d(used_amount_b).gt(0)) {
        used_amount_b = d(1)
      }

      used_total_amount_a = d(used_total_amount_a).plus(used_amount_a)
      used_total_amount_b = d(used_total_amount_b).plus(used_amount_b)

      used_bins.push({
        bin_id: bin.bin_id,
        amount_a: used_amount_a.toFixed(0),
        amount_b: used_amount_b.toFixed(0),
        price_per_lamport: bin.price_per_lamport,
        liquidity: used_liquidity,
      })
    })

    return {
      bins: used_bins,
      amount_a: used_total_amount_a.toFixed(0),
      amount_b: used_total_amount_b.toFixed(0),
    }
  }

  /**
   * Calculate the amount of token A and token B to be removed from a bin
   * @param bin - The bin information
   * @param remove_liquidity - The amount of liquidity to be removed
   * @returns The amount of token A and token B to be removed
   */
  static calculateOutByShare(bin: BinAmount, remove_liquidity: string) {
    const { amount_a, amount_b, liquidity = '0' } = bin

    if (liquidity === '0') {
      return {
        amount_a: '0',
        amount_b: '0',
      }
    }

    if (d(remove_liquidity).gte(d(liquidity))) {
      return {
        amount_a: amount_a,
        amount_b: amount_b,
      }
    }

    const amount_a_out = d(remove_liquidity).div(liquidity).mul(amount_a).toFixed(0, Decimal.ROUND_FLOOR)
    const amount_b_out = d(remove_liquidity).div(liquidity).mul(amount_b).toFixed(0, Decimal.ROUND_FLOOR)

    return {
      amount_a: amount_a_out,
      amount_b: amount_b_out,
    }
  }

  /**
   * Get the number of positions in a range of bin ids
   * @param lower_bin_id - The lower bin id
   * @param upper_bin_id - The upper bin id
   * @returns The number of positions
   */
  static getPositionCount(lower_bin_id: number, upper_bin_id: number) {
    const binDelta = d(upper_bin_id).sub(lower_bin_id).add(1)
    const positionCount = binDelta.div(MAX_BIN_PER_POSITION)
    return Number(positionCount.toFixed(0, Decimal.ROUND_UP))
  }

  /**
   * Calculate the amount of liquidity following the constant sum formula `L = price * x + y`
   * @param amount_a
   * @param amount_b
   * @param qPrice Price is in Q64x64
   * @returns
   */
  static getLiquidity(amount_a: string, amount_b: string, qPrice: string): string {
    const px = d(qPrice).mul(amount_a)
    const liquidity = px.add(d(amount_b).mul(d(2).pow(SCALE_OFFSET)))
    return liquidity.toFixed(0)
  }

  /**
   * Calculate amount_a from liquidity when all liquidity is in token A
   * @param liquidity - The liquidity amount
   * @param qPrice - Price in Q64x64 format
   * @returns The amount of token A
   */
  static getAmountAFromLiquidity(liquidity: string, qPrice: string): string {
    return d(liquidity).div(d(qPrice)).toFixed(0)
  }

  /**
   * Calculate amount_b from liquidity when all liquidity is in token B
   * @param liquidity - The liquidity amount
   * @returns The amount of token B
   */
  static getAmountBFromLiquidity(liquidity: string): string {
    return d(liquidity).div(d(2).pow(SCALE_OFFSET)).toFixed(0)
  }

  /**
   * Calculate amounts from liquidity using the same logic as Move code
   * @param amount_a - Current amount of token A in the bin
   * @param amount_b - Current amount of token B in the bin
   * @param delta_liquidity - The liquidity delta to calculate amounts for
   * @param liquidity_supply - Total liquidity supply in the bin
   * @returns [amount_a_out, amount_b_out]
   */
  static getAmountsFromLiquidity(amount_a: string, amount_b: string, delta_liquidity: string, liquidity_supply: string): [string, string] {
    if (d(liquidity_supply).isZero()) {
      handleError(DlmmErrorCode.LiquiditySupplyIsZero, 'Liquidity supply is zero')
    }

    if (d(delta_liquidity).gt(d(liquidity_supply))) {
      handleError(DlmmErrorCode.InvalidDeltaLiquidity, 'Invalid delta liquidity')
    }

    if (d(delta_liquidity).isZero()) {
      return ['0', '0']
    }

    let out_amount_a: string
    if (d(amount_a).isZero()) {
      out_amount_a = '0'
    } else {
      out_amount_a = d(amount_a).mul(d(delta_liquidity)).div(d(liquidity_supply)).toFixed(0, Decimal.ROUND_FLOOR)
    }

    let out_amount_b: string
    if (d(amount_b).isZero()) {
      out_amount_b = '0'
    } else {
      out_amount_b = d(amount_b).mul(d(delta_liquidity)).div(d(liquidity_supply)).toFixed(0, Decimal.ROUND_FLOOR)
    }

    return [out_amount_a, out_amount_b]
  }

  /**
   * Get the price of a bin by bin id
   * @param bin_id - The bin id
   * @param bin_step - The bin step
   * @param decimal_a - The decimal of the token a
   * @param decimal_b - The decimal of the token b
   * @returns The price of the bin
   */
  static getPriceFromBinId(bin_id: number, bin_step: number, decimal_a: number, decimal_b: number): string {
    const pricePerLamport = BinUtils.getPricePerLamportFromBinId(bin_id, bin_step)
    return BinUtils.getPriceFromLamport(decimal_a, decimal_b, pricePerLamport).toString()
  }

  /**
   * Get the price per lamport of a bin by bin id
   * @param bin_id - The bin id
   * @param bin_step - The bin step
   * @returns The price per lamport of the bin
   */
  static getPricePerLamportFromBinId(bin_id: number, bin_step: number): string {
    const binStepNum = new Decimal(bin_step).div(new Decimal(BASIS_POINT_MAX))
    return new Decimal(1).add(new Decimal(binStepNum)).pow(new Decimal(bin_id)).toString()
  }

  /**
   * Get the bin id from a price
   * @param price - The price
   * @param binStep - The bin step
   * @param min - Whether to use the minimum or maximum bin id
   * @param decimal_a - The decimal of the token a
   * @param decimal_b - The decimal of the token b
   * @returns The bin id
   */
  public static getBinIdFromPrice(price: string, binStep: number, min: boolean, decimal_a: number, decimal_b: number): number {
    const pricePerLamport = BinUtils.getPricePerLamport(decimal_a, decimal_b, price)
    return BinUtils.getBinIdFromLamportPrice(pricePerLamport, binStep, min)
  }

  /**
   * Get the bin id from a price per lamport
   * @param pricePerLamport - The price per lamport
   * @param binStep - The bin step
   * @param min - Whether to use the minimum or maximum bin id
   * @returns The bin id
   */
  public static getBinIdFromLamportPrice(pricePerLamport: string, binStep: number, min: boolean): number {
    const binStepNum = new Decimal(binStep).div(new Decimal(BASIS_POINT_MAX))
    const binId = new Decimal(pricePerLamport).log().dividedBy(new Decimal(1).add(binStepNum).log())
    return (min ? binId.floor() : binId.ceil()).toNumber()
  }

  /**
   * Get the price per lamport
   * @param decimal_a - The decimal of the token a
   * @param decimal_b - The decimal of the token b
   * @param price - The price
   * @returns The price per lamport
   */
  public static getPricePerLamport(decimal_a: number, decimal_b: number, price: string): string {
    return new Decimal(price).mul(new Decimal(10 ** (decimal_b - decimal_a))).toString()
  }

  /**
   * Convert price per lamport back to original price
   * @param decimal_a - The decimal of the token a
   * @param decimal_b - The decimal of the token b
   * @param pricePerLamport - The price per lamport
   * @returns The original price
   */
  public static getPriceFromLamport(decimal_a: number, decimal_b: number, pricePerLamport: string): string {
    return new Decimal(pricePerLamport).div(new Decimal(10 ** (decimal_b - decimal_a))).toString()
  }

  /**
   * Get the reverse price
   * @param price - The price
   * @returns The reverse price
   */
  public static getReversePrice(price: string): string {
    return new Decimal(1).div(price).toString()
  }

  /**
   * Get the price of a bin by bin id
   * @param binId - The bin id
   * @param binStep - The bin step
   * @returns The price of the bin
   */
  static getQPriceFromId(binId: number, binStep: number): string {
    const bps = new BN(binStep).shln(SCALE_OFFSET).div(new BN(BASIS_POINT_MAX))
    const base = ONE.add(bps)
    return BinUtils.pow(base, new BN(binId)).toString()
  }

  /**
   * Convert QPrice (Q64x64 format) to actual price
   * @param qPrice - The price in Q64x64 format
   * @returns The actual price
   */
  static getPricePerLamportFromQPrice(qPrice: string): string {
    return MathUtil.fromX64(new BN(qPrice)).toString()
  }

  static pow(base: BN, exp: BN): BN {
    let invert = exp.isNeg()

    if (exp.isZero()) {
      return ONE
    }

    exp = invert ? exp.abs() : exp

    if (exp.gt(MAX_EXPONENTIAL)) {
      return new BN(0)
    }

    let squaredBase = base
    let result = ONE

    if (squaredBase.gte(result)) {
      squaredBase = MAX.div(squaredBase)
      invert = !invert
    }

    if (!exp.and(new BN(0x1)).isZero()) {
      result = result.mul(squaredBase).shrn(SCALE_OFFSET)
    }

    squaredBase = squaredBase.mul(squaredBase).shrn(SCALE_OFFSET)

    if (!exp.and(new BN(0x2)).isZero()) {
      result = result.mul(squaredBase).shrn(SCALE_OFFSET)
    }

    squaredBase = squaredBase.mul(squaredBase).shrn(SCALE_OFFSET)

    if (!exp.and(new BN(0x4)).isZero()) {
      result = result.mul(squaredBase).shrn(SCALE_OFFSET)
    }

    squaredBase = squaredBase.mul(squaredBase).shrn(SCALE_OFFSET)

    if (!exp.and(new BN(0x8)).isZero()) {
      result = result.mul(squaredBase).shrn(SCALE_OFFSET)
    }

    squaredBase = squaredBase.mul(squaredBase).shrn(SCALE_OFFSET)

    if (!exp.and(new BN(0x10)).isZero()) {
      result = result.mul(squaredBase).shrn(SCALE_OFFSET)
    }

    squaredBase = squaredBase.mul(squaredBase).shrn(SCALE_OFFSET)

    if (!exp.and(new BN(0x20)).isZero()) {
      result = result.mul(squaredBase).shrn(SCALE_OFFSET)
    }

    squaredBase = squaredBase.mul(squaredBase).shrn(SCALE_OFFSET)

    if (!exp.and(new BN(0x40)).isZero()) {
      result = result.mul(squaredBase).shrn(SCALE_OFFSET)
    }

    squaredBase = squaredBase.mul(squaredBase).shrn(SCALE_OFFSET)

    if (!exp.and(new BN(0x80)).isZero()) {
      result = result.mul(squaredBase).shrn(SCALE_OFFSET)
    }

    squaredBase = squaredBase.mul(squaredBase).shrn(SCALE_OFFSET)

    if (!exp.and(new BN(0x100)).isZero()) {
      result = result.mul(squaredBase).shrn(SCALE_OFFSET)
    }

    squaredBase = squaredBase.mul(squaredBase).shrn(SCALE_OFFSET)

    if (!exp.and(new BN(0x200)).isZero()) {
      result = result.mul(squaredBase).shrn(SCALE_OFFSET)
    }

    squaredBase = squaredBase.mul(squaredBase).shrn(SCALE_OFFSET)

    if (!exp.and(new BN(0x400)).isZero()) {
      result = result.mul(squaredBase).shrn(SCALE_OFFSET)
    }

    squaredBase = squaredBase.mul(squaredBase).shrn(SCALE_OFFSET)

    if (!exp.and(new BN(0x800)).isZero()) {
      result = result.mul(squaredBase).shrn(SCALE_OFFSET)
    }

    squaredBase = squaredBase.mul(squaredBase).shrn(SCALE_OFFSET)

    if (!exp.and(new BN(0x1000)).isZero()) {
      result = result.mul(squaredBase).shrn(SCALE_OFFSET)
    }

    squaredBase = squaredBase.mul(squaredBase).shrn(SCALE_OFFSET)

    if (!exp.and(new BN(0x2000)).isZero()) {
      result = result.mul(squaredBase).shrn(SCALE_OFFSET)
    }

    squaredBase = squaredBase.mul(squaredBase).shrn(SCALE_OFFSET)

    if (!exp.and(new BN(0x4000)).isZero()) {
      result = result.mul(squaredBase).shrn(SCALE_OFFSET)
    }

    squaredBase = squaredBase.mul(squaredBase).shrn(SCALE_OFFSET)

    if (!exp.and(new BN(0x8000)).isZero()) {
      result = result.mul(squaredBase).shrn(SCALE_OFFSET)
    }

    squaredBase = squaredBase.mul(squaredBase).shrn(SCALE_OFFSET)

    if (!exp.and(new BN(0x10000)).isZero()) {
      result = result.mul(squaredBase).shrn(SCALE_OFFSET)
    }

    squaredBase = squaredBase.mul(squaredBase).shrn(SCALE_OFFSET)

    if (!exp.and(new BN(0x20000)).isZero()) {
      result = result.mul(squaredBase).shrn(SCALE_OFFSET)
    }

    squaredBase = squaredBase.mul(squaredBase).shrn(SCALE_OFFSET)

    if (!exp.and(new BN(0x40000)).isZero()) {
      result = result.mul(squaredBase).shrn(SCALE_OFFSET)
    }

    if (result.isZero()) {
      return new BN(0)
    }

    if (invert) {
      result = MAX.div(result)
    }

    return result
  }

  /**
   * Converts a bin ID to a score by adding the bin bound and validating the range
   * @param binId - The bin ID to convert
   * @returns The calculated bin score
   * @throws Error if the bin ID is invalid
   */
  static binScore(binId: number): string {
    const score = BigInt(binId) + BIN_BOUND
    if (score < 0n || score > BIN_BOUND * 2n) {
      handleError(DlmmErrorCode.InvalidBinId, new Error('Invalid bin ID'), {
        [DETAILS_KEYS.METHOD_NAME]: 'binScore',
        [DETAILS_KEYS.REQUEST_PARAMS]: { binId },
      })
    }

    return score.toString()
  }

  /**
   * Converts a score back to bin ID by subtracting the bin bound
   * @param score - The score to convert
   * @returns The calculated bin ID
   * @throws Error if the score is invalid
   */
  static scoreToBinId(score: string): number {
    const binId = BigInt(score) - BIN_BOUND
    if (binId < -BIN_BOUND || binId > BIN_BOUND) {
      handleError(DlmmErrorCode.InvalidBinId, new Error('Invalid score'), {
        [DETAILS_KEYS.METHOD_NAME]: 'scoreToBinId',
        [DETAILS_KEYS.REQUEST_PARAMS]: { score },
      })
    }

    return Number(binId)
  }

  /**
   * Resolves the bin position from a score.
   *
   * @param score - The score to resolve
   * @returns Tuple of [group index, offset in group]
   */
  static resolveBinPosition(score: string): [string, number] {
    const scoreBigInt = BigInt(score)
    const groupIndex = scoreBigInt >> 4n
    const offsetInGroup = Number(scoreBigInt & 0xfn)

    return [groupIndex.toString(), offsetInGroup]
  }

  static findMinMaxBinId(binStep: number) {
    const base = 1 + binStep / BASIS_POINT_MAX
    const maxQPriceSupported = new Decimal('18446744073709551615')
    const n = maxQPriceSupported.log(10).div(new Decimal(base).log(10)).floor()

    let minBinId = n.neg()
    let maxBinId = n

    let minQPrice = d(1)
    let maxQPrice = d('340282366920938463463374607431768211455')

    while (true) {
      const qPrice = d(BinUtils.getQPriceFromId(minBinId.toNumber(), binStep))
      if (qPrice.gt(minQPrice) && !qPrice.isZero()) {
        break
      } else {
        minBinId = minBinId.add(1)
      }
    }

    while (true) {
      const qPrice = d(BinUtils.getQPriceFromId(maxBinId.toNumber(), binStep))
      if (qPrice.lt(maxQPrice) && !qPrice.isZero()) {
        break
      } else {
        maxBinId = maxBinId.sub(1)
      }
    }

    return {
      minBinId: minBinId.toNumber(),
      maxBinId: maxBinId.toNumber(),
    }
  }

  static getBinShift(active_id: number, bin_step: number, max_price_slippage: number): number {
    const price = BinUtils.getPricePerLamportFromBinId(active_id, bin_step)
    const price_limit = d(price)
      .mul(1 + max_price_slippage)
      .toString()
    const slippage_active_id = BinUtils.getBinIdFromLamportPrice(price_limit, bin_step, true)
    const bin_shift = d(slippage_active_id).sub(active_id).abs().toFixed(0, Decimal.ROUND_UP)

    console.log('getBinShift Options:', {
      active_id,
      bin_shift,
    })
    return Number(bin_shift)
  }
}
