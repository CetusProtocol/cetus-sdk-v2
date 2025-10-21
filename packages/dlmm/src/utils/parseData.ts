import {
  asIntN,
  d,
  DETAILS_KEYS,
  extractStructTagFromType,
  fixCoinType,
  getObjectFields,
  getObjectType,
  MathUtil,
} from '@cetusprotocol/common-sdk'
import { DevInspectResults, SuiEvent, SuiObjectResponse, SuiTransactionBlockResponse } from '@mysten/sui/client'
import BN from 'bn.js'
import Decimal from 'decimal.js'
import { DlmmErrorCode, handleError, DlmmError } from '../errors/errors'
import {
  BinAmount,
  BinLiquidityInfo,
  BinManager,
  BinSwap,
  DlmmBasePool,
  DlmmPool,
  DlmmPosition,
  Partner,
  PoolTransactionInfo,
  PositionFee,
  PositionManager,
  PositionReward,
  PreSwapQuote,
  Reward,
  RewardInfo,
  RewardManager,
  RewardPeriodEmission,
  RewardPeriodEmissionFormat,
  StrategyType,
  VariableParameters,
} from '../types/dlmm'
import { BinUtils } from './binUtils'
import { BASIS_POINT } from '../types/constants'
import { bcs } from '@mysten/sui/bcs'
import { blake2b } from 'blakejs'

/**
 * Parse the DLMM base pool data
 * @param data - The DLMM base pool data
 * @returns The DLMM base pool
 */
export function parseDlmmBasePool(data: SuiEvent): DlmmBasePool {
  try {
    const fields = data.parsedJson as any
    const pool: DlmmBasePool = {
      id: fields.pool_id,
      bin_step: Number(fields.bin_step),
      coin_type_a: fixCoinType(fields.coin_type_a, false),
      coin_type_b: fixCoinType(fields.coin_type_b, false),
    }

    return pool
  } catch (error) {
    return handleError(DlmmErrorCode.ParseError, error as Error, {
      [DETAILS_KEYS.METHOD_NAME]: 'parseDlmmBasePool',
      [DETAILS_KEYS.REQUEST_PARAMS]: data,
    })
  }
}

/**
 * Parse the DLMM pool data
 * @param data - The DLMM pool data
 * @returns The DLMM pool
 */
export function parseDlmmPool(data: SuiObjectResponse): DlmmPool {
  try {
    const fields = getObjectFields(data)
    const type = getObjectType(data) as string
    const formatType = extractStructTagFromType(type)

    const bin_manager: BinManager = {
      bin_step: fields.bin_manager.fields.bin_step,
      bin_manager_handle: fields.bin_manager.fields.bins.fields.id.id,
      size: fields.bin_manager.fields.bins.fields.size,
    }

    const position_manager: PositionManager = {
      bin_step: fields.position_manager.fields.bin_step,
      position_index: fields.position_manager.fields.position_index,
      position_handle: fields.position_manager.fields.positions.fields.id.id,
      size: fields.position_manager.fields.positions.fields.size,
    }

    const reward_manager_fields = fields.reward_manager.fields

    const rewards = reward_manager_fields.rewards.map((reward: any) => {
      const current_reward_rate = reward.fields.current_emission_rate
      const emissions_per_second = MathUtil.fromX64(new BN(current_reward_rate))
      const emissions_per_day = Math.floor(emissions_per_second.toNumber() * 60 * 60 * 24).toString()

      const info: Reward = {
        reward_coin: fixCoinType(reward.fields.reward_coin.fields.name, false),
        emissions_per_second: emissions_per_second.toString(),
        emissions_per_day,
        period_emission_rates: {
          id: reward.fields.period_emission_rates.fields.id.id,
          size: reward.fields.period_emission_rates.fields.size,
        },
      }
      return info
    })
    const reward_manager: RewardManager = {
      is_public: reward_manager_fields.is_public,
      emergency_reward_pause: reward_manager_fields.emergency_reward_pause,
      vault: {
        id: reward_manager_fields.vault.fields.id.id,
        size: reward_manager_fields.vault.fields.size,
      },
      rewards,
      last_updated_time: reward_manager_fields.last_updated_time,
    }

    const variable_parameters: VariableParameters = {
      volatility_accumulator: fields.v_parameters.fields.volatility_accumulator,
      volatility_reference: fields.v_parameters.fields.volatility_reference,
      index_reference: asIntN(BigInt(fields.v_parameters.fields.index_reference.fields.bits)),
      last_update_timestamp: fields.v_parameters.fields.last_update_timestamp,
      bin_step_config: fields.v_parameters.fields.bin_step_config.fields,
    }

    const pool: DlmmPool = {
      id: fields.id.id,
      bin_step: Number(fields.bin_step),
      coin_type_a: fixCoinType(formatType.type_arguments[0], false),
      coin_type_b: fixCoinType(formatType.type_arguments[1], false),
      pool_type: type,
      index: Number(fields.index),
      bin_manager,
      variable_parameters,
      active_id: asIntN(BigInt(fields.active_id.fields.bits)),
      permissions: fields.permissions.fields,
      balance_a: fields.balance_a,
      balance_b: fields.balance_b,
      base_fee_rate: fields.base_fee_rate,
      protocol_fee_a: fields.protocol_fee_a,
      protocol_fee_b: fields.protocol_fee_b,
      url: fields.url,
      reward_manager,
      position_manager,
    }
    pool.bin_step = pool.bin_manager.bin_step
    return pool
  } catch (error) {
    console.log('🚀 ~ parseDlmmPool ~ error:', error)
    return handleError(DlmmErrorCode.ParseError, error as Error, {
      [DETAILS_KEYS.METHOD_NAME]: 'parseDlmmPool',
      [DETAILS_KEYS.REQUEST_PARAMS]: data,
    })
  }
}

export function parsePartner(data: SuiObjectResponse): Partner {
  const fields = getObjectFields(data)
  const type = getObjectType(data) as string
  const formatType = extractStructTagFromType(type)

  const partner: Partner = {
    id: fields.id.id,
    name: fields.name,
    ref_fee_rate: d(fields.ref_fee_rate).div(BASIS_POINT).toNumber(),
    start_time: Number(fields.start_time),
    end_time: Number(fields.end_time),
    balances: {
      id: fields.balances.fields.id.id,
      size: fields.balances.fields.size,
    },
    type: formatType.full_address,
  }

  return partner
}

export function parseDlmmPosition(data: SuiObjectResponse): DlmmPosition {
  try {
    const fields = getObjectFields(data)
    const position: DlmmPosition = {
      uri: fields.uri,
      index: fields.index,
      id: fields.id.id,
      name: fields.name,
      pool_id: fields.pool_id,
      lower_bin_id: asIntN(BigInt(fields.lower_bin_id.fields.bits)),
      upper_bin_id: asIntN(BigInt(fields.upper_bin_id.fields.bits)),
      liquidity_shares: fields.liquidity_shares,
      description: fields.description,
      coin_type_a: fixCoinType(fields.coin_type_a, false),
      coin_type_b: fixCoinType(fields.coin_type_b, false),
    }

    return position
  } catch (error) {
    console.log('🚀 ~ parseDlmmPosition ~ error:', error)
    return handleError(DlmmErrorCode.ParseError, error as Error, {
      [DETAILS_KEYS.METHOD_NAME]: 'parseDlmmPosition',
      [DETAILS_KEYS.REQUEST_PARAMS]: data,
    })
  }
}

export function parseLiquidityShares(
  liquidity_shares: string[],
  bin_step: number,
  lower_bin_id: number,
  active_bin: BinAmount
): BinLiquidityInfo {
  const bins = liquidity_shares.map((liquidity, index) => {
    const bin_id = lower_bin_id + index
    const price_per_lamport = BinUtils.getPricePerLamportFromBinId(bin_id, bin_step)
    if (bin_id === active_bin.bin_id) {
      const { amount_a, amount_b } = BinUtils.calculateOutByShare(active_bin, liquidity)
      return {
        bin_id,
        amount_a,
        amount_b,
        liquidity,
        price_per_lamport,
      }
    }

    if (bin_id < active_bin.bin_id) {
      const amount_b = BinUtils.getAmountBFromLiquidity(liquidity)
      return {
        bin_id,
        amount_a: '0',
        amount_b,
        liquidity,
        price_per_lamport,
      }
    }

    const q_price = BinUtils.getQPriceFromId(bin_id, bin_step)
    const amount_a = BinUtils.getAmountAFromLiquidity(liquidity, q_price)
    return {
      bin_id,
      amount_a,
      amount_b: '0',
      liquidity,
      price_per_lamport,
    }
  })

  const amount_a = bins
    .reduce((acc, bin) => {
      return acc.add(new Decimal(bin.amount_a))
    }, new Decimal(0))
    .toFixed(0)

  const amount_b = bins
    .reduce((acc, bin) => {
      return acc.add(new Decimal(bin.amount_b))
    }, new Decimal(0))
    .toFixed(0)

  return {
    bins,
    amount_a,
    amount_b,
  }
}

export function parseBinInfoList(res: DevInspectResults): BinAmount[] {
  try {
    const bcsCoinAmount = bcs.struct('BinAmount', {
      id: bcs.struct('I32', {
        bits: bcs.u32(),
      }),
      amount_a: bcs.u64(),
      amount_b: bcs.u64(),
      price: bcs.u128(),
      liquidity_supply: bcs.u128(),
      rewards_growth_global: bcs.vector(bcs.u128()),
      fee_a_growth_global: bcs.u128(),
      fee_b_growth_global: bcs.u128(),
    })

    const bin_amounts = bcs.vector(bcsCoinAmount).parse(Uint8Array.from(res.results![1].returnValues![0][0]))

    return bin_amounts.map((bin_amount) => {
      const bin_id = asIntN(BigInt(bin_amount.id.bits))
      return {
        bin_id,
        amount_a: bin_amount.amount_a,
        amount_b: bin_amount.amount_b,
        liquidity: bin_amount.liquidity_supply,
        price_per_lamport: BinUtils.getPricePerLamportFromQPrice(bin_amount.price),
      }
    })
  } catch (error) {
    console.log('🚀 ~ parseBinInfo ~ error:', error)
    return []
  }
}

export function parseBinInfo(fields: any): BinAmount {
  try {
    const bin_id = asIntN(BigInt(fields.id.fields.bits))
    const bin_amount: BinAmount = {
      bin_id,
      amount_a: fields.amount_a,
      amount_b: fields.amount_b,
      liquidity: fields.liquidity_share,
      price_per_lamport: BinUtils.getPricePerLamportFromQPrice(fields.price),
    }

    return bin_amount
  } catch (error) {
    return handleError(DlmmErrorCode.ParseError, error as Error, {
      [DETAILS_KEYS.METHOD_NAME]: 'parseBinInfo',
      [DETAILS_KEYS.REQUEST_PARAMS]: {
        fields,
      },
    })
  }
}

export function parsedDlmmPosFeeData(simulate_res: DevInspectResults) {
  const feeData: Record<string, PositionFee> = {}
  const feeValueData: any[] = simulate_res.events?.filter((item: any) => {
    return item.type.includes('pool::CollectFeeEvent')
  })

  for (let i = 0; i < feeValueData.length; i += 1) {
    const { parsedJson } = feeValueData[i]
    const posObj = {
      position_id: parsedJson.position,
      fee_owned_a: parsedJson.fee_a,
      fee_owned_b: parsedJson.fee_b,
    }
    feeData[parsedJson.position] = posObj
  }

  return feeData
}

export function parsedDlmmPosRewardData(simulate_res: DevInspectResults) {
  const rewarderData: Record<string, PositionReward> = {}
  const rewarderValueData: any[] = simulate_res.events?.filter((item: any) => {
    return item.type.includes('pool::CollectRewardEvent')
  })

  for (let i = 0; i < rewarderValueData.length; i += 1) {
    const { parsedJson } = rewarderValueData[i]
    const position_id = parsedJson.position
    const reward_coin = parsedJson.reward
    const reward_amount = parsedJson.amount
    const rewardInfo: RewardInfo = {
      coin_type: fixCoinType(reward_coin.name, false),
      reward_owned: reward_amount,
    }
    let rewarder = rewarderData[position_id]
    if (rewarder) {
      rewarder.rewards.push(rewardInfo)
    } else {
      rewarder = {
        position_id,
        rewards: [rewardInfo],
      }
    }
    rewarderData[position_id] = rewarder
  }

  return rewarderData
}

export function parsedSwapQuoteData(simulate_res: DevInspectResults, a2b: boolean): PreSwapQuote | undefined {
  const rewarderValueData: any[] = simulate_res.events?.filter((item: any) => {
    return item.type.includes('pool::SwapEvent')
  })

  for (let i = 0; i < rewarderValueData.length; i += 1) {
    const { parsedJson } = rewarderValueData[i]
    const { partner, pool, amount_in, amount_out, fee, ref_fee, bin_swaps, from, target } = parsedJson
    const bin_swaps_info: BinSwap[] = bin_swaps.map((bin_swap: any) => {
      return {
        bin_id: bin_swap.bin_id.bits,
        in_amount: bin_swap.amount_in,
        out_amount: bin_swap.amount_out,
        fee: bin_swap.fee,
        var_fee_rate: bin_swap.var_fee_rate,
      }
    })
    const info: PreSwapQuote = {
      pool_id: pool,
      a2b,
      in_amount: amount_in,
      out_amount: amount_out,
      ref_fee_amount: ref_fee,
      fee_amount: fee,
      bin_swaps: bin_swaps_info,
      partner,
      from_coin_type: fixCoinType(from.name, false),
      to_coin_type: fixCoinType(target.name, false),
    }

    return info
  }
  return undefined
}

export function parseStrategyType(strategy_type: StrategyType): number {
  switch (strategy_type) {
    case StrategyType.Spot:
      return 0
    case StrategyType.Curve:
      return 1
    case StrategyType.BidAsk:
      return 2
  }
}
export const poolFilterEvenTypes = ['RemoveLiquidityEvent', 'SwapEvent', 'AddLiquidityEvent', 'ClosePositionEvent']
export function parsePoolTransactionInfo(data: SuiTransactionBlockResponse, txIndex: number, package_id: string, pool_id: string) {
  const list: PoolTransactionInfo[] = []
  const { timestampMs, events } = data

  events?.forEach((event: any, index) => {
    const { name: type, address: package_address } = extractStructTagFromType(event.type)
    if (poolFilterEvenTypes.includes(type) && package_address === package_id && pool_id === event.parsedJson.pool) {
      const info: PoolTransactionInfo = {
        tx: event.id.txDigest,
        sender: event.sender,
        type: event.type,
        block_time: timestampMs || '0',
        index: `${txIndex}_${index}`,
        parsed_json: event.parsedJson,
      }
      list.push(info)
    }
  })

  return list
}

export function generateRewardSchedule(baseTime: number, maxIntervals: number, timeInterval: number): number[] {
  const result: number[] = []

  let intervals = 0 // Start from 0 to include base time if needed
  const baseDateTime = new Date(baseTime * 1000).getTime() // Convert seconds to milliseconds
  const nowTime = new Date().getTime()
  while (true) {
    const rewardTime = baseDateTime + intervals * timeInterval

    if (rewardTime >= nowTime) {
      result.push(rewardTime)
    }

    if (intervals >= maxIntervals) {
      break
    }

    intervals += 1
  }

  return result
}

export function parseRewardPeriodEmission(
  periodEmissionList: RewardPeriodEmission[],
  startTimeInSeconds: number,
  endTimeInSeconds: number,
  durationSeconds: number
) {
  const result: RewardPeriodEmissionFormat[] = []
  for (let time = startTimeInSeconds; time <= endTimeInSeconds; time += durationSeconds) {
    const findRewardPeriodEmission = periodEmissionList.findLast((period) => d(time).gte(period.time))
    if (findRewardPeriodEmission) {
      result.push({
        time: time.toString(),
        emissions_per_second: findRewardPeriodEmission.emissions_per_second,
        emissions_per_day: findRewardPeriodEmission.emissions_per_day,
        visualized_time: new Date(time * 1000).toLocaleString(),
      })
    } else {
      result.push({
        emissions_per_day: '0',
        time: time.toString(),
        emissions_per_second: '0',
        visualized_time: new Date(time * 1000).toLocaleString(),
      })
    }
  }
  return result
}

export function parseCurrentRewardPeriodEmission(periodEmissionList: RewardPeriodEmission[]): RewardPeriodEmission | undefined {
  if (periodEmissionList.length === 0) {
    return undefined
  }
  const currentTime = new Date().getTime() / 1000
  const findRewardPeriodEmission = periodEmissionList.findLast((period) => d(currentTime).gte(period.time))
  if (findRewardPeriodEmission) {
    return findRewardPeriodEmission
  }
  return periodEmissionList[periodEmissionList.length - 1]
}

export function safeMulAmount(amount: Decimal, rate: Decimal): Decimal {
  const result = amount.mul(rate)
  if (result.gt(0) && result.lt(1)) {
    throw new DlmmError(`Multiplication ${result} is less than 1`, DlmmErrorCode.AmountTooSmall)
  }
  return result.floor()
}

export function safeAmount(amount: Decimal): Decimal {
  if (amount.gt(0) && amount.lt(1)) {
    throw new DlmmError(`Multiplication ${amount.toString()} is less than 1`, DlmmErrorCode.AmountTooSmall)
  }
  return amount.floor()
}

export function getRouterModule(strategy_type: StrategyType) {
  switch (strategy_type) {
    case StrategyType.Spot:
      return 'spot'
    case StrategyType.Curve:
      return 'curve'
    case StrategyType.BidAsk:
      return 'bid_ask'
  }
}

export function buildPoolKey(coin_type_a: string, coin_type_b: string, bin_step: number, base_factor: number) {
  // Convert coin types to bytes
  let coinABytes = Buffer.from(coin_type_a, 'utf8')
  const coinBBytes = Buffer.from(coin_type_b, 'utf8')

  const lenB = coinBBytes.length

  let i = 0

  // Append coinB bytes to coinA (without validation)
  while (i < lenB) {
    const byteB = coinBBytes[i]
    coinABytes = Buffer.concat([coinABytes, Buffer.from([byteB])])
    i++
  }

  // Serialize bin_step and base_factor using BCS
  const binStepBytes = bcs.u16().serialize(bin_step).toBytes()
  const baseFactorBytes = bcs.u16().serialize(base_factor).toBytes()

  // Concatenate all bytes
  const combinedBytes = Buffer.concat([coinABytes, binStepBytes, baseFactorBytes])

  // Hash with blake2b256
  const hash = blake2b(combinedBytes, undefined, 32)

  return `0x${Buffer.from(hash).toString('hex')}`
}
