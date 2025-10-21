import { d } from '@cetusprotocol/common-sdk'
import { BinAmount, BinStepConfig, VariableParameters } from '../types/dlmm'
import { BinUtils } from './binUtils'
import { BASIS_POINT, FEE_PRECISION, MAX_FEE_RATE } from '../types/constants'

export class FeeUtils {
  static getVariableFee(variableParameters: VariableParameters): string {
    const { volatility_accumulator, bin_step_config } = variableParameters
    const { variable_fee_control, bin_step } = bin_step_config

    if (d(variable_fee_control).gt(0)) {
      const square_vfa_bin = d(volatility_accumulator).mul(bin_step).pow(2)
      const v_fee = square_vfa_bin.mul(variable_fee_control)
      const scaled_v_fee = v_fee.add(99_999_999_999).div(100_000_000_000)
      return scaled_v_fee.toFixed(0)
    }
    return '0'
  }

  static calculateCompositionFee(amount: string, total_fee_rate: string) {
    const fee_amount = d(amount).mul(total_fee_rate)
    const composition_fee = d(fee_amount).mul(d(FEE_PRECISION).add(total_fee_rate))
    return composition_fee.div(1000000000000000000).toFixed(0)
  }

  static calculateProtocolFee(fee_amount: string, protocol_fee_rate: string) {
    const protocol_fee = d(fee_amount).mul(protocol_fee_rate).div(BASIS_POINT).ceil().toFixed(0)
    return protocol_fee
  }

  static getProtocolFees(fee_a: string, fee_b: string, protocol_fee_rate: string) {
    const protocol_fee_a = FeeUtils.calculateProtocolFee(fee_a, protocol_fee_rate)
    const protocol_fee_b = FeeUtils.calculateProtocolFee(fee_b, protocol_fee_rate)
    return {
      protocol_fee_a,
      protocol_fee_b,
    }
  }

  static getCompositionFees(
    active_bin: BinAmount,
    used_bin: BinAmount,
    variableParameters: VariableParameters
  ): { fees_a: string; fees_b: string } {
    const { bin_step_config } = variableParameters
    if (d(active_bin.liquidity || '0').eq(d(0))) {
      return {
        fees_a: '0',
        fees_b: '0',
      }
    }
    const { bin_step, base_factor } = bin_step_config
    const qPrice = BinUtils.getQPriceFromId(active_bin.bin_id, bin_step)
    const bin_liquidity = BinUtils.getLiquidity(active_bin.amount_a, active_bin.amount_b, qPrice)
    const delta_liquidity = BinUtils.getLiquidity(used_bin.amount_a, used_bin.amount_b, qPrice)
    const delta_liquidity_share = d(active_bin.liquidity).mul(delta_liquidity).div(bin_liquidity).toFixed(0)

    const { amount_a: amount_a_out, amount_b: amount_b_out } = BinUtils.calculateOutByShare(
      {
        bin_id: active_bin.bin_id,
        liquidity: d(active_bin.liquidity).add(delta_liquidity_share).toFixed(0),
        amount_a: d(active_bin.amount_a).add(used_bin.amount_a).toFixed(0),
        amount_b: d(active_bin.amount_b).add(used_bin.amount_b).toFixed(0),
        price_per_lamport: active_bin.price_per_lamport,
      },
      delta_liquidity_share
    )

    const base_fee = d(bin_step).mul(base_factor).mul(10)
    const variable_fee = FeeUtils.getVariableFee(variableParameters)

    let total_fee_rate = d(base_fee).add(variable_fee).toFixed(0)

    if (d(total_fee_rate).gt(MAX_FEE_RATE)) {
      total_fee_rate = MAX_FEE_RATE.toString()
    }

    let fees_a = '0'
    let fees_b = '0'

    if (d(amount_a_out).gt(used_bin.amount_a) && d(used_bin.amount_b).gt(amount_b_out)) {
      fees_b = FeeUtils.calculateCompositionFee(d(used_bin.amount_b).sub(amount_b_out).toFixed(0), total_fee_rate)
    } else if (d(amount_b_out).gt(used_bin.amount_b) && d(used_bin.amount_a).gt(amount_a_out)) {
      fees_a = FeeUtils.calculateCompositionFee(d(used_bin.amount_a).sub(amount_a_out).toFixed(0), total_fee_rate)
    }

    return {
      fees_a,
      fees_b,
    }
  }
}
