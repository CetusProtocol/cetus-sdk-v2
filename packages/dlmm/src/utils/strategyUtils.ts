import { d } from '@cetusprotocol/common-sdk'
import { BinAmount, BinLiquidityInfo, StrategyType, WeightsInfo } from '../types/dlmm'
import { WeightUtils } from './weightUtils'
import { BinUtils, SCALE_OFFSET } from './binUtils'
import { safeAmount, safeMulAmount } from './parseData'
import Decimal from 'decimal.js'

export class StrategyUtils {
  static toAmountsByWeights(weights_info: WeightsInfo): BinLiquidityInfo {
    const {
      total_weight_a,
      total_weight_b,
      weights,
      weight_per_prices,
      total_amount_a,
      total_amount_b,
      active_weight_a,
      active_weight_b,
      lower_bin_id,
      upper_bin_id,
      active_id,
      bin_step,
    } = weights_info

    const ky = total_weight_b.isZero()
      ? d(0)
      : d(total_amount_b)
          .mul(d(2).pow(SCALE_OFFSET * 2))
          .div(total_weight_b)
          .floor()

    const kx = total_weight_a.isZero()
      ? d(0)
      : d(total_amount_a)
          .mul(d(2).pow(SCALE_OFFSET * 2))
          .div(total_weight_a)
          .floor()

    const amount_a_in_active_id = safeAmount(kx.mul(active_weight_a).div(d(2).pow(SCALE_OFFSET * 2)))
    const amount_b_in_active_id = safeAmount(ky.mul(active_weight_b).div(d(2).pow(SCALE_OFFSET * 2)))

    const bin_count = upper_bin_id - lower_bin_id + 1
    let bin_id = lower_bin_id
    let idx = 0
    const bin_amounts: BinAmount[] = []
    while (idx < bin_count) {
      let amount_a_in_bin = d(0)
      let amount_b_in_bin = d(0)

      const qPrice = BinUtils.getQPriceFromId(bin_id, bin_step)

      if (bin_id < active_id) {
        amount_b_in_bin = safeAmount(ky.mul(weights[idx]).div(d(2).pow(SCALE_OFFSET)))
      } else if (bin_id > active_id) {
        amount_a_in_bin = safeAmount(kx.mul(weight_per_prices[idx]).div(d(2).pow(SCALE_OFFSET * 2)))
      } else {
        amount_a_in_bin = amount_a_in_active_id
        amount_b_in_bin = amount_b_in_active_id
      }
      const liquidity = BinUtils.getLiquidity(amount_a_in_bin.toString(), amount_b_in_bin.toString(), qPrice)

      bin_amounts.push({
        bin_id,
        amount_a: amount_a_in_bin.toString(),
        amount_b: amount_b_in_bin.toString(),
        price_per_lamport: BinUtils.getPricePerLamportFromBinId(bin_id, bin_step),
        liquidity,
      })
      bin_id += 1
      idx += 1
    }

    const info: BinLiquidityInfo = {
      bins: bin_amounts,
      amount_a: total_amount_a.toString(),
      amount_b: total_amount_b.toString(),
    }
    return info
  }

  /**
   * Given a strategy type and amounts of X and Y, returns the distribution of liquidity.
   * @param active_id The bin id of the active bin.
   * @param bin_step The step size of each bin.
   * @param min_bin_id The min bin id.
   * @param max_bin_id The max bin id.
   * @param amount_a The amount of X token to deposit.
   * @param amount_b The amount of Y token to deposit.
   * @param amount_a_in_active_bin The amount of X token in the active bin.
   * @param amount_b_in_active_bin The amount of Y token in the active bin.
   * @param strategy_type The strategy type.
   * @returns The distribution of liquidity.
   */
  static toAmountsBothSideByStrategy(
    active_id: number,
    bin_step: number,
    min_bin_id: number,
    max_bin_id: number,
    amount_a: string,
    amount_b: string,
    strategy_type: StrategyType,
    active_bin_of_pool?: BinAmount
  ): BinLiquidityInfo {
    const weights = WeightUtils.toWeight({
      strategy_type,
      active_id,
      bin_step,
      lower_bin_id: min_bin_id,
      upper_bin_id: max_bin_id,
      total_amount_a: amount_a,
      total_amount_b: amount_b,
      active_bin_of_pool,
    })

    return this.toAmountsByWeights(weights)
  }

  static autoFillCoinByStrategy(
    active_id: number,
    bin_step: number,
    amount: string,
    fix_amount_a: boolean,
    min_bin_id: number,
    max_bin_id: number,
    strategy_type: StrategyType,
    active_bin_of_pool?: BinAmount
  ): BinLiquidityInfo {
    switch (strategy_type) {
      case StrategyType.Spot: {
        let weights = WeightUtils.toWeightSpotBalanced(min_bin_id, max_bin_id)
        return WeightUtils.autoFillCoinByWeight(
          active_id,
          bin_step,
          amount,
          fix_amount_a,
          active_bin_of_pool?.amount_a || '0',
          active_bin_of_pool?.amount_b || '0',
          weights
        )
      }
      case StrategyType.Curve: {
        let weights = WeightUtils.toWeightCurve(min_bin_id, max_bin_id, active_id)
        return WeightUtils.autoFillCoinByWeight(
          active_id,
          bin_step,
          amount,
          fix_amount_a,
          active_bin_of_pool?.amount_a || '0',
          active_bin_of_pool?.amount_b || '0',
          weights
        )
      }
      case StrategyType.BidAsk: {
        let weights = WeightUtils.toWeightBidAsk(min_bin_id, max_bin_id, active_id)
        return WeightUtils.autoFillCoinByWeight(
          active_id,
          bin_step,
          amount,
          fix_amount_a,
          active_bin_of_pool?.amount_a || '0',
          active_bin_of_pool?.amount_b || '0',
          weights
        )
      }
    }
  }

  // only apply for
  static autoFillCoinByStrategyV2(
    active_id: number,
    bin_step: number,
    amount: string,
    fix_amount_a: boolean,
    min_bin_id: number,
    max_bin_id: number,
    strategy_type: StrategyType,
    active_bin_of_pool?: BinAmount
  ): BinLiquidityInfo {
    const info = this.autoFillCoinByStrategy(
      active_id,
      bin_step,
      amount,
      fix_amount_a,
      min_bin_id,
      max_bin_id,
      strategy_type,
      active_bin_of_pool
    )
    const weights = WeightUtils.toWeight({
      strategy_type,
      active_id,
      bin_step,
      lower_bin_id: min_bin_id,
      upper_bin_id: max_bin_id,
      total_amount_a: info.amount_a,
      total_amount_b: info.amount_b,
      active_bin_of_pool,
    })

    return this.toAmountsByWeights(weights)
  }
}
