import { BASIS_POINT_MAX } from '../types/constants'
import { Axis, IlmInputOptions, IlmInputResult, TokenTable } from '../types/ilm'
import { BinUtils } from './binUtils'

export class IlmUtils {
  static calculateIlm(options: IlmInputOptions): IlmInputResult {
    const { curvature, initial_price, max_price, bin_step, total_supply, pool_share_percentage, config } = options
    const { price_curve_points_num, liquidity_distribution_num, tokens_table_num, price_table_num } = config
    if (pool_share_percentage < 0 || pool_share_percentage > 100) {
      throw new Error('Pool Share Percentage must be greater than 0 and less than 100.')
    }

    let flat = false

    if (max_price < initial_price) {
      throw new Error('Maximum Price must be greater or equal to Initial Price.')
    } else if (max_price === initial_price && curvature !== 0) {
      throw new Error('Curvature must be 0 when Maximum and Initial Price are equal.')
    } else if (max_price !== initial_price && curvature === 0) {
      throw new Error('Maximum and Initial Price must be equal when Curvature is 0.')
    } else if (max_price === initial_price && curvature === 0) {
      flat = true
    }

    const myFormula = (c: number) => {
      // f * Math.pow((c / A), k) + i;
      return price_diff * Math.pow(c / pool_supply, curvature) + initial_price
    }

    const integrate = (upper: number, lower: number) => {
      let u = (price_diff * Math.pow(pool_supply, -curvature) * Math.pow(upper, curvature + 1)) / (curvature + 1) + initial_price * upper
      let l = (price_diff * Math.pow(pool_supply, -curvature) * Math.pow(lower, curvature + 1)) / (curvature + 1) + initial_price * lower
      return u - l
    }

    const reverse_formula = (price: number) => {
      //  A * Math.pow(((p- i) / f), 1 / k);
      return pool_supply * Math.pow((price - initial_price) / price_diff, 1 / curvature)
    }

    const liquidity = (price: number) => {
      //  A * Math.pow((p - i), (1 / k) - 1) / (k * Math.pow(f, 1 / k));
      return (pool_supply * Math.pow(price - initial_price, 1 / curvature - 1)) / (curvature * Math.pow(price_diff, 1 / curvature))
    }

    const binTokens = (price: number) => {
      return Math.pow((price - initial_price) / price_diff, 1 / curvature) * pool_supply
    }

    const getBinIdFromLamportPrice = (pricePerLamport: number, binStep: number, min: boolean): number => {
      const binStepNum = binStep / BASIS_POINT_MAX
      const binId = Math.log(pricePerLamport) / Math.log(1 + binStepNum)
      return min ? Math.floor(binId) : Math.ceil(binId)
    }

    const getPricePerLamportFromBinId = (binId: number, binStep: number): number => {
      const binStepNum = binStep / BASIS_POINT_MAX
      return Math.pow(1 + binStepNum, binId)
    }

    const pool_supply = (total_supply * pool_share_percentage) / 100 // A
    const price_diff = max_price - initial_price // f

    const prices: number[] = []
    const heights: number[] = []

    let minBinId = getBinIdFromLamportPrice(initial_price, bin_step, false)
    let maxBinId = getBinIdFromLamportPrice(max_price, bin_step, false)
    let total = 0

    let binFlag = minBinId
    if (flat) {
      prices.push(initial_price)
      heights.push(initial_price * pool_supply)
    } else {
      while (binFlag <= maxBinId) {
        const price = getPricePerLamportFromBinId(binFlag, bin_step)
        const nextPrice = getPricePerLamportFromBinId(binFlag + 1, bin_step)
        const tokenDiff = binTokens(nextPrice) - binTokens(price)
        total = total + tokenDiff
        heights.push(tokenDiff * price)
        prices.push(price)
        binFlag++
      }
    }
    const result: IlmInputResult = {
      price_curve: {
        data: [],
        min_y: 0,
        max_y: 0,
      },
      liquidity_curve: {
        data: [],
        min_y: 0,
        max_y: 0,
      },
      dlmm_bins: {
        data: [],
        min_y: 0,
        max_y: 0,
      },
      tokens_table: [],
      price_table: [],
      initial_fdv: initial_price * total_supply,
      final_fdv: max_price * total_supply,
      usdc_in_pool: 0,
    }
    var LDstep = price_diff / 100

    // price curve
    const pricePoints: Axis[] = []
    let priceMin = 0
    let priceMax = 0
    for (let index = 0; index < price_curve_points_num; index++) {
      const x = (index * pool_supply) / (price_curve_points_num - 1)
      const y = flat ? max_price : myFormula(x)
      priceMin = priceMin < y ? priceMin : y
      priceMax = priceMax > y ? priceMax : y
      pricePoints.push({ x, y })
    }
    result.price_curve = {
      data: pricePoints,
      min_y: priceMin,
      max_y: priceMax,
    }

    // liquidity curve
    let liquidityPoints: Axis[] = []
    let liquidityMin = 0
    let liquidityMax = 0
    if (flat) {
      liquidityMin = 0
      liquidityMax = pool_supply
      liquidityPoints = [
        { x: initial_price, y: 0 },
        { x: initial_price, y: pool_supply / 2 },
        { x: initial_price, y: pool_supply },
      ]
    } else {
      for (let index = 0; index < liquidity_distribution_num; index++) {
        const x = initial_price + index * LDstep
        const y = liquidity(x)
        liquidityPoints.push({ x, y })
        liquidityMin = liquidityMin < y ? liquidityMin : y
        liquidityMax = liquidityMax > y ? liquidityMax : y
      }
    }
    result.liquidity_curve = {
      data: liquidityPoints,
      min_y: liquidityMin,
      max_y: liquidityMax,
    }

    // dlmm bins
    const dlmmBins: Axis[] = []
    let dlmmBinsMin = 0
    let dlmmBinsMax = 0
    prices.forEach((price, index) => {
      const x = price
      const y = heights[index]
      dlmmBins.push({ x, y })
      dlmmBinsMin = dlmmBinsMin < y ? dlmmBinsMin : y
      dlmmBinsMax = dlmmBinsMax > y ? dlmmBinsMax : y
    })
    result.dlmm_bins = {
      data: dlmmBins,
      min_y: dlmmBinsMin,
      max_y: dlmmBinsMax,
    }

    // Tokens Table
    const tokensTable: TokenTable[] = []
    let tokensWithdrawn = 0
    let step = pool_supply / tokens_table_num
    while (tokensWithdrawn <= pool_supply) {
      const price = myFormula(tokensWithdrawn)
      const n = tokensWithdrawn
      const amountUsd = integrate(n, 0)
      tokensTable.push({ withdrawn: n, price, usdc_in_pool: amountUsd })
      tokensWithdrawn = tokensWithdrawn + step
    }
    result.tokens_table = tokensTable

    // Price Table
    const step2 = Math.floor(price_diff * 10000000000) / 100000000000
    const priceTable: TokenTable[] = []
    if (flat) {
      priceTable.push({
        withdrawn: pool_supply,
        price: initial_price,
        usdc_in_pool: pool_supply * initial_price,
      })
    } else {
      let r = 0
      let price = initial_price
      while (r <= price_table_num) {
        const tokensWithdrawn = reverse_formula(price)
        const amountUsd = integrate(tokensWithdrawn, 0)
        priceTable.push({ withdrawn: tokensWithdrawn, price: price, usdc_in_pool: amountUsd })
        price = price + step2
        r = r + 1
      }
    }
    result.price_table = priceTable
    result.usdc_in_pool = priceTable[priceTable.length - 1].usdc_in_pool
    return result
  }
}
