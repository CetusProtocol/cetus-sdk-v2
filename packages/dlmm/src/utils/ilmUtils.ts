import { d } from '@cetusprotocol/common-sdk'
import { Axis, IlmInputOptions, IlmInputResult, TokenTable } from '../types/ilm'
import { BinUtils } from './binUtils'

export class IlmUtils {
  static calculateIlm(options: IlmInputOptions): IlmInputResult {
    const { curvature, initial_price, max_price, bin_step, total_supply, pool_share_percentage, config } = options
    const { price_curve_points_num, liquidity_distribution_num, tokens_table_num, price_table_num } = config
    if (d(pool_share_percentage).lt(0) || d(pool_share_percentage).gt(100)) {
      throw new Error('Pool Share Percentage must be greater than 0 and less than 100.')
    }

    let flat = false

    if (d(max_price).lt(d(initial_price))) {
      throw new Error('Maximum Price must be greater or equal to Initial Price.')
    } else if (d(max_price).eq(initial_price) && !d(curvature).eq(0)) {
      throw new Error('Curvature must be 0 when Maximum and Initial Price are equal.')
    } else if (!d(max_price).eq(initial_price) && d(curvature).eq(0)) {
      throw new Error('Maximum and Initial Price must be equal when Curvature is 0.')
    } else if (d(max_price).eq(initial_price) && d(curvature).eq(0)) {
      flat = true
    }

    const myFormula = (c: string) => {
      // f * Math.pow((c / A), k) + i;
      return d(price_diff).mul(d(c).div(pool_supply).pow(curvature)).add(d(initial_price)).toString()
    }

    const integrate = (upper: number, lower: number) => {
      let u = d(price_diff)
        .mul(d(pool_supply).pow(-curvature))
        .mul(d(upper).pow(curvature + 1))
        .div(curvature + 1)
        .add(d(initial_price).mul(upper))
      let l = d(price_diff)
        .mul(d(pool_supply).pow(-curvature))
        .mul(d(lower).pow(curvature + 1))
        .div(curvature + 1)
        .add(d(initial_price).mul(lower))
      return u.sub(l)
    }

    const reverse_formula = (price: string) => {
      //  A * Math.pow(((p- i) / f), 1 / k);
      return d(pool_supply)
        .mul(
          d(price)
            .sub(initial_price)
            .div(price_diff)
            .pow(1 / curvature)
        )
        .toString()
    }

    const liquidity = (price: string) => {
      //  A * Math.pow((p - i), (1 / k) - 1) / (k * Math.pow(f, 1 / k));
      return d(pool_supply)
        .mul(
          d(price)
            .sub(initial_price)
            .pow(1 / curvature - 1)
        )
        .div(d(curvature).mul(d(price_diff).pow(1 / curvature)))
        .toString()
    }

    const binTokens = (price: string) => {
      return d(price)
        .sub(initial_price)
        .div(price_diff)
        .pow(1 / curvature)
        .mul(pool_supply)
    }

    const pool_supply = d(total_supply).mul(pool_share_percentage).div(100) // A
    const price_diff = d(max_price).sub(d(initial_price)).toFixed(8) // f

    const prices: string[] = []
    const heights: string[] = []

    let minBinId = BinUtils.getBinIdFromLamportPrice(initial_price, bin_step, false)
    let maxBinId = BinUtils.getBinIdFromLamportPrice(max_price, bin_step, false)
    let total = d(0)

    let binFlag = minBinId
    if (flat) {
      prices.push(initial_price)
      heights.push(d(initial_price).mul(pool_supply).toString())
    } else {
      while (binFlag <= maxBinId) {
        const price = BinUtils.getPricePerLamportFromBinId(binFlag, bin_step)
        const nextPrice = BinUtils.getPricePerLamportFromBinId(binFlag + 1, bin_step)
        const tokenDiff = binTokens(nextPrice).sub(binTokens(price))
        total = total.add(tokenDiff)
        heights.push(d(tokenDiff).mul(price).toString())
        prices.push(price)
        binFlag++
      }
    }
    const result: IlmInputResult = {
      price_curve: {
        data: [],
        min_y: '',
        max_y: '',
      },
      liquidity_curve: {
        data: [],
        min_y: '',
        max_y: '',
      },
      dlmm_bins: {
        data: [],
        min_y: '',
        max_y: '',
      },
      tokens_table: [],
      price_table: [],
      initial_fdv: d(initial_price).mul(total_supply).toString(),
      final_fdv: d(max_price).mul(total_supply).toString(),
      usdc_in_pool: '0',
    }
    var LDstep = d(price_diff).div(100)

    // price curve
    const pricePoints: Axis[] = []
    let priceMin = '0'
    let priceMax = '0'
    for (let index = 0; index < price_curve_points_num; index++) {
      const x = d(index)
        .mul(pool_supply)
        .div(price_curve_points_num - 1)
        .toString()
      const y = flat ? max_price : myFormula(x)
      priceMin = d(priceMin).lt(y) ? priceMin : y
      priceMax = d(priceMax).gt(y) ? priceMax : y
      pricePoints.push({ x, y })
    }
    result.price_curve = {
      data: pricePoints,
      min_y: priceMin,
      max_y: priceMax,
    }

    // liquidity curve
    let liquidityPoints: Axis[] = []
    let liquidityMin = '0'
    let liquidityMax = '0'
    if (flat) {
      liquidityMin = '0'
      liquidityMax = pool_supply.toString()
      liquidityPoints = [
        { x: initial_price, y: '0' },
        { x: initial_price, y: d(pool_supply).div(2).toString() },
        { x: initial_price, y: pool_supply.toString() },
      ]
    } else {
      for (let index = 0; index < liquidity_distribution_num; index++) {
        const x = d(initial_price)
          .add(d(index).mul(d(LDstep)))
          .toFixed(9)
        const y = liquidity(x)
        liquidityPoints.push({ x, y })
        liquidityMin = d(liquidityMin).lt(y) ? liquidityMin : y
        liquidityMax = d(liquidityMax).gt(y) ? liquidityMax : y
      }
    }
    result.liquidity_curve = {
      data: liquidityPoints,
      min_y: liquidityMin,
      max_y: liquidityMax,
    }

    // dlmm bins
    const dlmmBins: Axis[] = []
    let dlmmBinsMin = '0'
    let dlmmBinsMax = '0'
    prices.forEach((price, index) => {
      const x = price
      const y = heights[index]
      dlmmBins.push({ x, y })
      dlmmBinsMin = d(dlmmBinsMin).lt(y) ? dlmmBinsMin : y
      dlmmBinsMax = d(dlmmBinsMax).gt(y) ? dlmmBinsMax : y
    })
    result.dlmm_bins = {
      data: dlmmBins,
      min_y: dlmmBinsMin,
      max_y: dlmmBinsMax,
    }

    // Tokens Table
    const tokensTable: TokenTable[] = []
    let tokensWithdrawn = d(0)
    let step = d(pool_supply).div(tokens_table_num).toFixed(5)
    while (tokensWithdrawn.lte(pool_supply)) {
      const price = d(myFormula(tokensWithdrawn.toString())).toFixed(8)
      const n = tokensWithdrawn.toFixed(8)
      const amountUsd = integrate(Number(n), 0)
      tokensTable.push({ withdrawn: n, price, usdc_in_pool: amountUsd.toString() })
      tokensWithdrawn = tokensWithdrawn.add(step)
    }
    result.tokens_table = tokensTable

    // Price Table
    const step2 = d(price_diff).mul(10000000000).floor().div(100000000000)
    const priceTable: TokenTable[] = []
    if (flat) {
      priceTable.push({
        withdrawn: pool_supply.toString(),
        price: initial_price,
        usdc_in_pool: d(pool_supply).mul(initial_price).toString(),
      })
    } else {
      let r = d(0)
      let price = d(initial_price)
      while (r.lte(price_table_num)) {
        const tokensWithdrawn = d(reverse_formula(price.toFixed(8))).toFixed(8)
        const amountUsd = integrate(Number(tokensWithdrawn), 0).toFixed(8)
        priceTable.push({ withdrawn: tokensWithdrawn, price: price.toFixed(8), usdc_in_pool: amountUsd })
        price = d(price).add(step2)
        r = r.add(d(1))
      }
    }
    result.price_table = priceTable
    result.usdc_in_pool = priceTable[priceTable.length - 1].usdc_in_pool
    return result
  }
}
