import { d } from '@cetusprotocol/common-sdk'
import { DynamicFee, FeeScheduler, FeeSchedulerMode, PoolFeeManager } from '../types/clmm_type'

const SCALE_OFFSET = 64n
const ONE_Q64 = 1n << SCALE_OFFSET
const BASIC_POINT = 10000n
const MAX_U16 = 0xffff
const MAX_U64 = (1n << 64n) - 1n
export const MAX_FEE_RATE = 100_000_000;

function mulDivFloor(a: string, b: string, denominator: string): string {
  return d(a).mul(b).div(denominator).toString()
}

function mulDivRound(a: string, b: string, denominator: string): string {
  return d(a).mul(b).add(d(denominator).div(2)).div(denominator).toString()
}

function mulQ64(a: string, b: string): string {
  return mulDivRound(a, b, ONE_Q64.toString())
}

function powQ64(base: string, exp: number): string {
  let result = ONE_Q64.toString()
  let b = base
  let e = exp

  while (e > 0) {
    if (e & 1) {
      result = mulQ64(result, b)
    }
    e >>= 1
    if (e > 0) {
      b = mulQ64(b, b)
    }
  }

  return result
}

function getFeeInPeriod(cliffFeeNumerator: string, reductionFactor: string, passedPeriod: number): string {
  if (d(reductionFactor).eq(0)) {
    return cliffFeeNumerator
  }

  const bps = mulDivFloor(reductionFactor, ONE_Q64.toString(), BASIC_POINT.toString())
  const base = d(ONE_Q64).sub(d(bps)).toString()
  const result = powQ64(base, passedPeriod)
  let fee = mulDivRound(result, cliffFeeNumerator, ONE_Q64.toString())

  if (d(fee).gt(MAX_U64)) {
    fee = MAX_U64.toString()
  }

  return fee
}

export function get_base_fee_by_period(feeScheduler: FeeScheduler, period: number): string {
  const { cliff_fee_numerator, reduction_factor, number_of_period, fee_scheduler_mode } = feeScheduler

  const cappedPeriod = Math.min(period, Number(number_of_period))

  if (fee_scheduler_mode === FeeSchedulerMode.Linear) {
    const feeNumerator = d(cliff_fee_numerator).sub(d(reduction_factor).mul(cappedPeriod))
    const safeFee = feeNumerator.lt(0) ? 0n : feeNumerator
    return safeFee.toString()
  }

  const cappedForExponential = Math.min(cappedPeriod, MAX_U16)
  const feeNumerator = getFeeInPeriod(cliff_fee_numerator, reduction_factor, cappedForExponential)

  return feeNumerator.toString()
}

export function get_base_fee(feeScheduler: FeeScheduler, current_time: number, activation_time: number): string {
  const { period_frequency, cliff_fee_numerator } = feeScheduler
  if (d(period_frequency).eq(0)) {
    return cliff_fee_numerator
  }
  if (current_time < activation_time) {
    throw new Error("Invalid timestamp: current_time < activation_time")
  }
  const period = d(current_time).sub(d(activation_time)).div(d(period_frequency)).toNumber()
  return get_base_fee_by_period(feeScheduler, period)
}

export function get_max_base_fee(feeScheduler: FeeScheduler): string {
  const { cliff_fee_numerator } = feeScheduler
  return cliff_fee_numerator
}

export function get_min_base_fee(feeScheduler: FeeScheduler): string {
  const { number_of_period } = feeScheduler
  return get_base_fee_by_period(feeScheduler, Number(number_of_period))
}

export function get_total_fee(feeScheduler: FeeScheduler, feeManager: PoolFeeManager, current_timestamp: number): string {
  const { base_fee_rate, is_scheduler_over, activation_time } = feeManager
  let base_fee
  if (is_scheduler_over) {
    base_fee = base_fee_rate
  } else {
    base_fee = get_base_fee(feeScheduler, current_timestamp, Number(activation_time))
  }
  let dynamic_fee = 0
  if (feeManager.dynamic_fee) {
    dynamic_fee = Number(get_variable_fee(feeManager.dynamic_fee))
  }
  const total_fee = d(base_fee).add(dynamic_fee).toFixed(0)
  if (Number(total_fee) > MAX_FEE_RATE) {
    return MAX_FEE_RATE.toString()
  }
  return total_fee.toString()
}


export function get_variable_fee(dynamic_fee: DynamicFee): string {
  const { volatility_accumulator, bin_step_config } = dynamic_fee
  const { bin_step, variable_fee_control } = bin_step_config

  const variableFeeControl = BigInt(variable_fee_control)
  if (variableFeeControl === 0n) {
    return '0'
  }

  const volatilityAccumulator = BigInt(volatility_accumulator)
  const binStep = BigInt(bin_step)

  const squareVfaBin = (volatilityAccumulator * binStep) ** 2n
  const vFee = squareVfaBin * variableFeeControl
  const scaledVFee = (vFee + 99_999_999_999n) / 100_000_000_000n

  return scaledVFee.toString()
}

