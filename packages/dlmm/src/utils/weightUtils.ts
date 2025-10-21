import { d } from '@cetusprotocol/common-sdk'
import { BinLiquidityInfo, BinWeight, StrategyType, WeightsInfo, WeightsOptions } from '../types/dlmm'
import Decimal from 'decimal.js'
import { DEFAULT_MAX_WEIGHT, DEFAULT_MIN_WEIGHT } from '../types/constants'
import { BinUtils, SCALE_OFFSET } from './binUtils'
import { safeMulAmount } from './parseData'

export class WeightUtils {
  static toWeight(options: WeightsOptions): WeightsInfo {
    console.log('🚀 ~ WeightUtils ~ toWeight ~ options:', options)

    const { strategy_type, active_id, bin_step, lower_bin_id, upper_bin_id, total_amount_a, total_amount_b, active_bin_of_pool } = options
    const single_side = active_id < lower_bin_id || active_id > upper_bin_id
    const active_bin_price = BinUtils.getQPriceFromId(active_id, bin_step)

    let active_weight_a = d(0)
    let active_weight_b = d(0)

    let base_weight = d(DEFAULT_MIN_WEIGHT)
    if (strategy_type === StrategyType.BidAsk) {
      base_weight = d(DEFAULT_MIN_WEIGHT)
    } else if (strategy_type === StrategyType.Curve) {
      base_weight = d(DEFAULT_MAX_WEIGHT)
    } else if (strategy_type === StrategyType.Spot) {
      base_weight = d(1)
    }

    if (!single_side && active_bin_of_pool) {
      const weights = this.calculateActiveWeights(active_bin_of_pool.amount_a, active_bin_of_pool.amount_b, active_bin_price, base_weight)
      active_weight_a = weights.active_weight_a
      active_weight_b = weights.active_weight_b
    }

    if (active_id === lower_bin_id && d(total_amount_b).isZero()) {
      active_weight_a = d(base_weight)
        .mul(d(2).pow(SCALE_OFFSET * 2))
        .div(d(active_bin_price))
        .floor()
      active_weight_b = d(0)
    }
    if (active_id === upper_bin_id && d(total_amount_a).isZero()) {
      active_weight_b = d(base_weight).mul(d(2).pow(SCALE_OFFSET)).floor()
      active_weight_a = d(0)
    }

    if (active_id > lower_bin_id && active_id < upper_bin_id) {
      if (d(total_amount_a).isZero()) {
        active_weight_b = d(base_weight).mul(d(2).pow(SCALE_OFFSET)).floor()
        active_weight_a = d(0)
      }
      if (d(total_amount_b).isZero()) {
        active_weight_a = d(base_weight)
          .mul(d(2).pow(SCALE_OFFSET * 2))
          .div(d(active_bin_price))
          .floor()
        active_weight_b = d(0)
      }
    }
    let total_weight_a = single_side ? d(0) : active_weight_a
    let total_weight_b = single_side ? d(0) : active_weight_b

    const diff_weight = d(DEFAULT_MAX_WEIGHT).sub(d(DEFAULT_MIN_WEIGHT)).floor()

    const left_end_bin_id = active_id > upper_bin_id ? upper_bin_id : active_id
    const right_start_bin_id = active_id < lower_bin_id ? lower_bin_id : active_id

    const diff_min_weight =
      active_id > lower_bin_id
        ? left_end_bin_id === lower_bin_id
          ? d(0)
          : diff_weight.div(d(left_end_bin_id - lower_bin_id)).floor()
        : d(0)

    const diff_max_weight =
      upper_bin_id > active_id
        ? right_start_bin_id === upper_bin_id
          ? d(0)
          : diff_weight.div(d(upper_bin_id - right_start_bin_id)).floor()
        : d(0)

    let bin_id = lower_bin_id
    let weights: Decimal[] = []
    let weight_per_prices: Decimal[] = []

    while (bin_id <= upper_bin_id) {
      let weight: Decimal = d(0)
      if (bin_id < active_id) {
        const delta_bin = left_end_bin_id - bin_id
        if (strategy_type === StrategyType.Spot) {
          weight = d(1)
        } else if (strategy_type === StrategyType.BidAsk) {
          weight = d(base_weight).add(diff_min_weight.mul(delta_bin)).floor()
        } else if (strategy_type === StrategyType.Curve) {
          weight = d(base_weight).sub(diff_min_weight.mul(delta_bin)).floor()
        }
      } else if (bin_id > active_id) {
        const delta_bin = bin_id - right_start_bin_id
        if (strategy_type === StrategyType.Spot) {
          weight = d(1)
        } else if (strategy_type === StrategyType.BidAsk) {
          weight = d(base_weight).add(diff_max_weight.mul(delta_bin)).floor()
        } else if (strategy_type === StrategyType.Curve) {
          weight = d(base_weight).sub(diff_max_weight.mul(delta_bin)).floor()
        }
      } else {
        weight = base_weight
      }
      weights.push(weight)

      if (bin_id < active_id) {
        total_weight_b = total_weight_b.add(weight.mul(d(2).pow(SCALE_OFFSET))).floor()
        weight_per_prices.push(d(0))
      } else if (bin_id > active_id) {
        const weight_per_price = weight
          .mul(d(2).pow(SCALE_OFFSET * 2))
          .div(BinUtils.getQPriceFromId(bin_id, bin_step))
          .floor()
        weight_per_prices.push(weight_per_price)
        total_weight_a = total_weight_a.add(weight_per_price).floor()
      } else {
        weight_per_prices.push(d(0))
      }

      bin_id += 1
    }

    return {
      ...options,
      total_weight_a,
      total_weight_b,
      active_weight_a,
      active_weight_b,
      weights,
      weight_per_prices,
    }
  }

  static toWeightSpotBalanced(min_bin_id: number, max_bin_id: number): BinWeight[] {
    let distributions = []
    for (let i = min_bin_id; i <= max_bin_id; i++) {
      distributions.push({
        bin_id: i,
        weight: 1,
      })
    }
    return distributions
  }

  static toWeightDescendingOrder(min_bin_id: number, max_bin_id: number): BinWeight[] {
    let distributions = []
    for (let i = min_bin_id; i <= max_bin_id; i++) {
      distributions.push({
        bin_id: i,
        weight: max_bin_id - i + 1,
      })
    }
    return distributions
  }

  static toWeightAscendingOrder(min_bin_id: number, max_bin_id: number): BinWeight[] {
    let distributions = []
    for (let i = min_bin_id; i <= max_bin_id; i++) {
      distributions.push({
        bin_id: i,
        weight: i - min_bin_id + 1,
      })
    }
    return distributions
  }

  static toWeightCurve(min_bin_id: number, max_bin_id: number, active_id: number): BinWeight[] {
    if (active_id < min_bin_id) {
      return WeightUtils.toWeightDescendingOrder(min_bin_id, max_bin_id)
    } else if (active_id > max_bin_id) {
      return WeightUtils.toWeightAscendingOrder(min_bin_id, max_bin_id)
    }

    let maxWeight = DEFAULT_MAX_WEIGHT
    let minWeight = DEFAULT_MIN_WEIGHT

    let diffWeight = maxWeight - minWeight
    let diffMinWeight = active_id > min_bin_id ? Math.floor(diffWeight / (active_id - min_bin_id)) : 0
    let diffMaxWeight = max_bin_id > active_id ? Math.floor(diffWeight / (max_bin_id - active_id)) : 0

    let distributions: BinWeight[] = []
    for (let i = min_bin_id; i <= max_bin_id; i++) {
      if (i < active_id) {
        distributions.push({
          bin_id: i,
          weight: maxWeight - (active_id - i) * diffMinWeight,
        })
      } else if (i > active_id) {
        distributions.push({
          bin_id: i,
          weight: maxWeight - (i - active_id) * diffMaxWeight,
        })
      } else {
        distributions.push({
          bin_id: i,
          weight: maxWeight,
        })
      }
    }
    return distributions
  }

  static toWeightBidAsk(min_bin_id: number, max_bin_id: number, active_id: number): BinWeight[] {
    if (active_id > max_bin_id) {
      return WeightUtils.toWeightDescendingOrder(min_bin_id, max_bin_id)
    } else if (active_id < min_bin_id) {
      return WeightUtils.toWeightAscendingOrder(min_bin_id, max_bin_id)
    }

    let maxWeight = DEFAULT_MAX_WEIGHT
    let minWeight = DEFAULT_MIN_WEIGHT

    let diffWeight = maxWeight - minWeight
    let diffMinWeight = active_id > min_bin_id ? Math.floor(diffWeight / (active_id - min_bin_id)) : 0
    let diffMaxWeight = max_bin_id > active_id ? Math.floor(diffWeight / (max_bin_id - active_id)) : 0

    let distributions: BinWeight[] = []
    for (let i = min_bin_id; i <= max_bin_id; i++) {
      if (i < active_id) {
        distributions.push({
          bin_id: i,
          weight: minWeight + (active_id - i) * diffMinWeight,
        })
      } else if (i > active_id) {
        distributions.push({
          bin_id: i,
          weight: minWeight + (i - active_id) * diffMaxWeight,
        })
      } else {
        distributions.push({
          bin_id: i,
          weight: minWeight,
        })
      }
    }
    return distributions
  }

  /**
   * Distribute totalAmount to all bid side bins according to given distributions.
   * @param active_id - active bin id
   * @param amount_b - total amount of coin b to be distributed
   * @param distributions - weight distribution of each bin
   * @returns array of {binId, amount} where amount is the amount of coin b in each bin
   */
  static toAmountBidSide(
    active_id: number,
    amount_b: string,
    bin_step: number,
    distributions: BinWeight[],
    contain_active_bin = false
  ): BinLiquidityInfo {
    // get sum of weight
    const totalWeight = distributions
      .filter((bin) => bin.bin_id <= active_id)
      .reduce(function (sum, el) {
        if (contain_active_bin) {
          return el.bin_id > active_id ? sum : sum.add(el.weight) // skip all ask side
        } else {
          return el.bin_id >= active_id ? sum : sum.add(el.weight) // skip all ask side
        }
      }, d(0))

    if (totalWeight.cmp(d(0)) != 1) {
      throw Error('Invalid parameters')
    }

    const bin_amounts = distributions.map((bin) => {
      let price_per_lamport = BinUtils.getPricePerLamportFromBinId(bin.bin_id, bin_step)

      const isValidBin = bin.bin_id <= active_id

      if (!isValidBin || (bin.bin_id >= active_id && !contain_active_bin)) {
        return {
          bin_id: bin.bin_id,
          amount_a: '0',
          amount_b: '0',
          price_per_lamport,
          liquidity: '0',
        }
      } else {
        const rate = d(bin.weight).div(totalWeight)
        const amount_b_in_bin = safeMulAmount(d(amount_b), rate).toString()
        const amount_a = '0'
        const qPrice = BinUtils.getQPriceFromId(bin.bin_id, bin_step)
        const liquidity = BinUtils.getLiquidity(amount_a, amount_b_in_bin, qPrice)
        return {
          bin_id: bin.bin_id,
          amount_b: amount_b_in_bin,
          amount_a,
          price_per_lamport,
          liquidity,
        }
      }
    })

    return {
      bins: bin_amounts,
      amount_a: '0',
      amount_b,
    }
  }

  /**
   * Distribute totalAmount to all ask side bins according to given distributions.
   * @param active_id active bin id
   * @param amount_a total amount of coin a to be distributed
   * @param distributions weight distribution of each bin
   * @returns array of {binId, amount} where amount is the amount of coin a in each bin
   */
  static toAmountAskSide(
    active_id: number,
    bin_step: number,
    amount_a: string,
    distributions: BinWeight[],
    contain_active_bin = false
  ): BinLiquidityInfo {
    // get sum of weight
    const totalWeight: Decimal = distributions
      .filter((bin) => bin.bin_id >= active_id)
      .reduce(function (sum, el) {
        if (el.bin_id <= active_id && !contain_active_bin) {
          return sum
        } else {
          const price_per_lamport = BinUtils.getPricePerLamportFromBinId(el.bin_id, bin_step)
          const weightPerPrice = new Decimal(el.weight).div(price_per_lamport)
          return sum.add(weightPerPrice)
        }
      }, new Decimal(0))

    if (totalWeight.cmp(new Decimal(0)) != 1) {
      throw Error('Invalid parameters')
    }

    const bin_amounts = distributions.map((bin) => {
      let price_per_lamport = BinUtils.getPricePerLamportFromBinId(bin.bin_id, bin_step)
      const isValidBin = bin.bin_id >= active_id

      if (!isValidBin || (bin.bin_id <= active_id && !contain_active_bin)) {
        return {
          bin_id: bin.bin_id,
          amount_a: '0',
          amount_b: '0',
          price_per_lamport,
          liquidity: '0',
        }
      } else {
        const weightPerPrice = new Decimal(bin.weight).div(price_per_lamport)
        const rate = weightPerPrice.div(totalWeight)
        const amount_a_in_bin = safeMulAmount(d(amount_a), rate).toString()
        const amount_b = '0'
        const qPrice = BinUtils.getQPriceFromId(bin.bin_id, bin_step)
        const liquidity = BinUtils.getLiquidity(amount_a_in_bin, amount_b, qPrice)
        return {
          bin_id: bin.bin_id,
          amount_a: amount_a_in_bin,
          amount_b,
          price_per_lamport,
          liquidity,
        }
      }
    })

    return {
      bins: bin_amounts,
      amount_a,
      amount_b: '0',
    }
  }

  /**
   * Distributes the given amounts of tokens X and Y to both bid and ask side bins
   * based on the provided weight distributions.
   *
   * @param activeId - The id of the active bin.
   * @param binStep - The step interval between bin ids.
   * @param amountX - Total amount of token X to distribute.
   * @param amountY - Total amount of token Y to distribute.
   * @param amountXInActiveBin - Amount of token X already in the active bin.
   * @param amountYInActiveBin - Amount of token Y already in the active bin.
   * @param distributions - Array of bins with their respective weight distributions.
   * @param mintX - Mint information for token X. Get from DLMM instance.
   * @param mintY - Mint information for token Y. Get from DLMM instance.
   * @param clock - Clock instance. Get from DLMM instance.
   * @returns An array of objects containing binId, amountX, and amountY for each bin.
   */
  static toAmountBothSide(
    active_id: number,
    bin_step: number,
    amount_a: string,
    amount_b: string,
    amount_a_in_active_bin: string,
    amount_b_in_active_bin: string,
    distributions: BinWeight[]
  ): BinLiquidityInfo {
    const isOnlyAmountA = !d(amount_a).isZero() && d(amount_b).isZero()
    const isOnlyAmountB = d(amount_a).isZero() && !d(amount_b).isZero()

    // only bid side
    if (active_id > distributions[distributions.length - 1].bin_id) {
      return WeightUtils.toAmountBidSide(active_id, amount_b, bin_step, distributions)
    }

    if (isOnlyAmountB && active_id !== distributions[distributions.length - 1].bin_id) {
      return WeightUtils.toAmountBidSide(active_id, amount_b, bin_step, distributions, true)
    }

    // only ask side
    if (active_id < distributions[0].bin_id) {
      return WeightUtils.toAmountAskSide(active_id, bin_step, amount_a, distributions)
    }

    if (isOnlyAmountA && active_id !== distributions[0].bin_id) {
      return WeightUtils.toAmountAskSide(active_id, bin_step, amount_a, distributions, true)
    }

    const activeBins = distributions.filter((element) => {
      return element.bin_id === active_id
    })

    if (activeBins.length === 1) {
      const { totalWeightA, totalWeightB, activeWeightA, activeWeightB } = WeightUtils.calculateTotalWeights(
        bin_step,
        distributions,
        active_id,
        activeBins[0],
        amount_a_in_active_bin,
        amount_b_in_active_bin,
        isOnlyAmountA ? 'a' : isOnlyAmountB ? 'b' : undefined
      )
      const kA = new Decimal(amount_a.toString()).div(totalWeightA)
      const kB = new Decimal(amount_b.toString()).div(totalWeightB)
      const bin_amounts = distributions.map((bin) => {
        let price_per_lamport = BinUtils.getPricePerLamportFromBinId(bin.bin_id, bin_step)
        if (bin.bin_id < active_id || (bin.bin_id === active_id && isOnlyAmountB)) {
          const amount_b = safeMulAmount(kB, new Decimal(bin.weight))
          const amount_a = '0'
          const qPrice = BinUtils.getQPriceFromId(bin.bin_id, bin_step)
          const liquidity = BinUtils.getLiquidity(amount_a, amount_b.toString(), qPrice)
          return {
            bin_id: bin.bin_id,
            amount_a: '0',
            amount_b: amount_b.toString(),
            price_per_lamport,
            liquidity,
          }
        }
        if (bin.bin_id > active_id || (bin.bin_id === active_id && isOnlyAmountA)) {
          const weighPerPrice = new Decimal(bin.weight).div(price_per_lamport)
          const amount_a = safeMulAmount(kA, new Decimal(weighPerPrice))
          const amount_b = '0'
          const qPrice = BinUtils.getQPriceFromId(bin.bin_id, bin_step)
          const liquidity = BinUtils.getLiquidity(amount_a.toString(), amount_b, qPrice)

          return {
            bin_id: bin.bin_id,
            amount_a: amount_a.toString(),
            amount_b: '0',
            price_per_lamport,
            liquidity,
          }
        }

        const amountAActiveBin = safeMulAmount(kA, activeWeightA)
        const amountBActiveBin = safeMulAmount(kB, activeWeightB)
        let amount_a = amountAActiveBin.toString()
        let amount_b = amountBActiveBin.toString()

        const qPrice = BinUtils.getQPriceFromId(bin.bin_id, bin_step)
        const liquidity = BinUtils.getLiquidity(amount_a, amount_b, qPrice)
        return {
          bin_id: bin.bin_id,
          amount_a,
          amount_b,
          price_per_lamport,
          liquidity,
        }
      })

      const total_amount_a = bin_amounts.reduce((sum, bin) => d(sum).add(d(bin.amount_a)), d(0)).toString()
      const total_amount_b = bin_amounts.reduce((sum, bin) => d(sum).add(d(bin.amount_b)), d(0)).toString()

      return {
        bins: bin_amounts,
        amount_a: total_amount_a,
        amount_b: total_amount_b,
      }
    } else {
      const { totalWeightA, totalWeightB } = WeightUtils.calculateTotalWeights(bin_step, distributions, active_id)
      let kA = new Decimal(amount_a.toString()).div(totalWeightA)
      let kB = new Decimal(amount_b.toString()).div(totalWeightB)
      // let k = kA.lessThan(kB) ? kA : kB

      const bin_amounts = distributions.map((bin) => {
        let price_per_lamport = BinUtils.getPricePerLamportFromBinId(bin.bin_id, bin_step)
        if (bin.bin_id < active_id) {
          const amount = safeMulAmount(kB, new Decimal(bin.weight))
          return {
            bin_id: bin.bin_id,
            amount_a: '0',
            amount_b: amount.toString(),
            price_per_lamport,
          }
        } else {
          let weighPerPrice = new Decimal(bin.weight).div(price_per_lamport)
          const amount = safeMulAmount(kA, weighPerPrice)
          return {
            bin_id: bin.bin_id,
            amount_a: amount.toString(),
            amount_b: '0',
            price_per_lamport,
          }
        }
      })

      const total_amount_a = bin_amounts.reduce((sum, bin) => d(sum).add(d(bin.amount_a)), d(0)).toString()
      const total_amount_b = bin_amounts.reduce((sum, bin) => d(sum).add(d(bin.amount_b)), d(0)).toString()

      return {
        bins: bin_amounts,
        amount_a: total_amount_a,
        amount_b: total_amount_b,
      }
    }
  }

  /**
   * Distributes the given amount of coin B to both bid and ask side bins
   * based on the provided weight distributions.
   *
   * @param active_id - The id of the active bin.
   * @param bin_step - The step interval between bin ids.
   * @param amount_a - Total amount of coin A to distribute.
   * @param amount_a_in_active_bin - Amount of coin A already in the active bin.
   * @param amount_b_in_active_bin - Amount of coin B already in the active bin.
   * @param distributions - Array of bins with their respective weight distributions.
   * @returns An array of objects containing binId, amountA, and amountB for each bin.
   */
  static autoFillCoinByWeight(
    active_id: number,
    bin_step: number,
    amount: string,
    fix_amount_a: boolean,
    amount_a_in_active_bin: string,
    amount_b_in_active_bin: string,
    distributions: BinWeight[]
  ): BinLiquidityInfo {
    // only bid side
    if (active_id > distributions[distributions.length - 1].bin_id) {
      return WeightUtils.toAmountBidSide(active_id, amount, bin_step, distributions)
    }
    // only ask side
    if (active_id < distributions[0].bin_id) {
      return WeightUtils.toAmountAskSide(active_id, bin_step, amount, distributions)
    }

    const activeBins = distributions.filter((element) => {
      return element.bin_id === active_id
    })

    const { totalWeightA, totalWeightB } = WeightUtils.calculateTotalWeights(
      bin_step,
      distributions,
      active_id,
      activeBins.length === 1 ? activeBins[0] : undefined,
      activeBins.length === 1 ? amount_a_in_active_bin : undefined,
      activeBins.length === 1 ? amount_b_in_active_bin : undefined
    )

    let k = d(0)

    if (fix_amount_a) {
      k = totalWeightA.isZero() ? new Decimal(0) : new Decimal(amount).div(totalWeightA)
    } else {
      k = totalWeightB.isZero() ? new Decimal(0) : new Decimal(amount).div(totalWeightB)
    }
    const other_amount = safeMulAmount(k, fix_amount_a ? totalWeightB : totalWeightA).toString()

    return WeightUtils.toAmountBothSide(
      active_id,
      bin_step,
      fix_amount_a ? amount : other_amount,
      fix_amount_a ? other_amount : amount,
      amount_a_in_active_bin,
      amount_b_in_active_bin,
      distributions
    )
  }

  static calculateActiveWeights(
    amount_a_in_active_id: string,
    amount_b_in_active_id: string,
    active_bin_price: string,
    base_weight: Decimal
  ): { active_weight_a: Decimal; active_weight_b: Decimal } {
    const p0 = d(active_bin_price)
    const amountA = d(amount_a_in_active_id)
    const amountB = d(amount_b_in_active_id)

    let active_weight_a: Decimal = d(0)
    let active_weight_b: Decimal = d(0)

    if (amountA.isZero() && amountB.isZero()) {
      active_weight_a = d(base_weight)
        .mul(d(2).pow(SCALE_OFFSET * 2))
        .div(p0.mul(2))
        .floor()
      active_weight_b = d(base_weight).mul(d(2).pow(SCALE_OFFSET)).div(2).floor()
    } else {
      // Calculate wx0
      if (amountA.isZero()) {
        active_weight_a = d(0)
      } else {
        const m = amountB.mul(d(2).pow(SCALE_OFFSET)).div(amountA)
        active_weight_a = d(base_weight)
          .mul(d(2).pow(SCALE_OFFSET * 2))
          .div(p0.add(m))
          .floor()
      }

      // Calculate wy0
      if (amountB.isZero()) {
        active_weight_b = d(0)
      } else {
        const m = d(2).pow(SCALE_OFFSET).add(p0.mul(amountA).div(amountB)).floor()
        active_weight_b = d(base_weight)
          .mul(d(2).pow(SCALE_OFFSET * 2))
          .div(m)
          .floor()
      }
    }

    return { active_weight_a, active_weight_b }
  }

  static calculateTotalWeights(
    bin_step: number,
    distributions: BinWeight[],
    active_id: number,
    activeBin?: BinWeight,
    amount_a_in_active_bin?: string,
    amount_b_in_active_bin?: string,
    is_only_amount?: 'a' | 'b'
  ): { totalWeightA: Decimal; totalWeightB: Decimal; activeWeightA: Decimal; activeWeightB: Decimal } {
    const p0 = d(BinUtils.getPricePerLamportFromBinId(active_id, bin_step))
    let activeWeightA = d(0)
    let activeWeightB = d(0)

    if (amount_a_in_active_bin && amount_b_in_active_bin && activeBin && !is_only_amount) {
      if (d(amount_a_in_active_bin).isZero() && d(amount_b_in_active_bin).isZero()) {
        activeWeightA = new Decimal(activeBin.weight).div(p0.mul(new Decimal(2)))
        activeWeightB = new Decimal(activeBin.weight).div(new Decimal(2))
      } else {
        let amountAInActiveBinDec = new Decimal(amount_a_in_active_bin.toString())
        let amountBInActiveBinDec = new Decimal(amount_b_in_active_bin.toString())

        if (!d(amount_a_in_active_bin).isZero()) {
          activeWeightA = new Decimal(activeBin.weight).div(p0.add(amountBInActiveBinDec.div(amountAInActiveBinDec)))
        }
        if (!d(amount_b_in_active_bin).isZero()) {
          activeWeightB = new Decimal(activeBin.weight).div(new Decimal(1).add(p0.mul(amountAInActiveBinDec).div(amountBInActiveBinDec)))
        }
      }
    }

    let totalWeightA = activeWeightA
    let totalWeightB = activeWeightB
    distributions.forEach((element) => {
      if (element.bin_id < active_id || is_only_amount === 'b') {
        totalWeightB = totalWeightB.add(new Decimal(element.weight))
      }
      if (element.bin_id > active_id || is_only_amount === 'a') {
        let price_per_lamport = BinUtils.getPricePerLamportFromBinId(element.bin_id, bin_step)
        let weighPerPrice = new Decimal(element.weight).div(price_per_lamport)
        totalWeightA = totalWeightA.add(weighPerPrice)
      }
    })
    return { totalWeightA, totalWeightB, activeWeightA, activeWeightB }
  }
}
