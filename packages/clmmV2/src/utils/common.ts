import { bcs } from '@mysten/sui/bcs'
import BN from 'bn.js'
import {
  asIntN,
  buildNFT,
  d,
  DETAILS_KEYS,
  extractStructTagFromType,
  fixCoinType,
  MathUtil,
  NFT,
} from '@cetusprotocol/common-sdk'
import { handleMessageError, PoolErrorCode, PositionErrorCode } from '../errors/errors'
import { DynamicFee, FeeCoinType, FeeScheduler, FeeSchedulerMode, Partner, Pool, PoolFeeManager, PoolPermission, PoolPositionManager, PoolRewardManager, PoolTransactionInfo, Position, PositionInfo, PositionTransactionInfo, Reward, RewardPeriodEmission, RewardPeriodEmissionFormat, TickData } from '../types'
import { ClmmPositionStatus, poolFilterEvenTypes } from '../types'

export const BASIS_POINT = 10000


/**
 * Builds a Pool object based on a SuiObjectResponse.
 * @returns {Pool} - The built Pool object.
 */
export function buildPool(objects: any): Pool {
  const type = objects.type
  const formatType = extractStructTagFromType(type)
  const fields = objects.json
  if (fields == null) {
    handleMessageError(PoolErrorCode.InvalidPoolObject, `Pool id ${objects.objectId} not exists.`, {
      [DETAILS_KEYS.METHOD_NAME]: 'buildPool',
    })
  }
  const feeManagerFields = fields.fee_manager

  const dynamicFeeFields = feeManagerFields.dynamic_fee
  const dynamicFee: DynamicFee | undefined = dynamicFeeFields ? {
    ...dynamicFeeFields,
    bin_step_config: dynamicFeeFields.bin_step_config,
  } : undefined

  const coin_type_a = fixCoinType(formatType.type_arguments[0], false)
  const coin_type_b = fixCoinType(formatType.type_arguments[1], false)

  let feeCoinType: FeeCoinType
  const feeCoinFields = feeManagerFields.fee_coin
  const feeCoinVariant = feeManagerFields.fee_coin.variant
  if (feeCoinVariant === "Fixed") {
    feeCoinType = coin_type_a === fixCoinType(feeCoinFields.pos0.name, false) ? FeeCoinType.CoinTypeA : FeeCoinType.CoinTypeB
  } else {
    feeCoinType = FeeCoinType.InputCoinType
  }

  const feeSchedulerFields = feeManagerFields.fee_scheduler
  const feeScheduler: FeeScheduler | undefined = feeSchedulerFields ? {
    cliff_fee_numerator: feeSchedulerFields.cliff_fee_numerator,
    number_of_period: feeSchedulerFields.number_of_period,
    period_frequency: feeSchedulerFields.period_frequency,
    reduction_factor: feeSchedulerFields.reduction_factor,
    base_fee: feeSchedulerFields.base_fee,
    fee_scheduler_mode: feeSchedulerFields.fee_scheduler_mode.variant === "Linear" ? FeeSchedulerMode.Linear : FeeSchedulerMode.Exponential,
  } : undefined
  const feeManager: PoolFeeManager = {
    fee_coin: feeCoinType,
    fee_scheduler: feeScheduler,
    base_fee_rate: feeManagerFields.base_fee_rate,
    protocol_fee_rate: feeManagerFields.protocol_fee_rate,
    tick_spacing: feeManagerFields.tick_spacing,
    activation_time: feeManagerFields.activation_time,
    is_scheduler_over: feeManagerFields.is_scheduler_over,
    dynamic_fee: dynamicFee,
  }

  const permissions: PoolPermission = {
    ...fields.permissions.launch,
    ...fields.permissions.feature_permission,
  }

  const positionManagerFields = fields.position_manager
  const positionManager: PoolPositionManager = {
    tick_spacing: positionManagerFields.tick_spacing,
    position_index: positionManagerFields.position_index,
    min_tick_range: positionManagerFields.min_tick_range,
    position_handle: {
      id: positionManagerFields.positions.id,
      size: positionManagerFields.positions.size,
    },
  }

  const rewardManagerFields = fields.reward_manager
  const rewards: Reward[] = rewardManagerFields.rewards.map((reward: any) => {
    const current_emission_rate = reward.current_emission_rate
    const emissions_per_second = MathUtil.fromX64(new BN(current_emission_rate))
    const emissions_per_day = Math.floor(emissions_per_second.toNumber() * 60 * 60 * 24).toString()

    const info: Reward = {
      reward_coin: fixCoinType(reward.reward_coin.name, false),
      emissions_per_second: emissions_per_second.toString(),
      reward_harvested: reward.reward_harvested,
      reward_refunded: reward.reward_refunded,
      reward_released: reward.reward_released,
      growth_global: reward.growth_global,
      emissions_per_day,
      period_emission_rates: {
        id: reward.period_emission_rates.id,
        size: reward.period_emission_rates.size,
      },
    }
    return info
  })
  const rewardManager: PoolRewardManager = {
    emergency_reward_pause: rewardManagerFields.emergency_reward_pause,
    is_public: rewardManagerFields.is_public,
    last_updated_time: rewardManagerFields.last_updated_time,
    vault: {
      id: rewardManagerFields.vault.id,
      size: rewardManagerFields.vault.size,
    },
    rewards
  }


  const pool: Pool = {
    id: fields.id,
    pool_type: type,
    coin_type_a,
    coin_type_b,
    coin_amount_a: fields.coin_a,
    coin_amount_b: fields.coin_b,
    current_sqrt_price: fields.current_sqrt_price,
    current_tick_index: asIntN(BigInt(fields.current_tick_index.bits)),
    fee_growth_global_a: fields.fee_growth_global_a,
    fee_growth_global_b: fields.fee_growth_global_b,
    fee_protocol_coin_a: fields.fee_protocol_coin_a,
    fee_protocol_coin_b: fields.fee_protocol_coin_b,
    tick_spacing: positionManager.tick_spacing,
    ticks_handle: {
      id: fields.tick_manager.ticks.id,
      size: fields.tick_manager.ticks.size,
    },
    reward_manager: rewardManager,
    position_manager: positionManager,
    fee_manager: feeManager,
    permissions,
    index: fields.index,
    url: fields.url,
    liquidity: fields.liquidity,
    creator: fields.creator
  }
  return pool
}

/** Builds a Position object based on a SuiObjectResponse.
 * @param {SuiObjectResponse} object - The SuiObjectResponse containing information about the position.
 * @returns {Position} - The built Position object.
 */
export function buildPosition(object: any): Position {
  let nft: NFT = {
    creator: '',
    description: '',
    image_url: '',
    link: '',
    name: '',
    project_url: '',
  }

  let position = {
    ...nft,
    pos_object_id: '',
    owner: '',
    type: '',
    coin_type_a: '',
    coin_type_b: '',
    liquidity: '',
    tick_lower_index: 0,
    tick_upper_index: 0,
    index: 0,
    pool: '',
    reward_amount_owned_0: '0',
    reward_amount_owned_1: '0',
    reward_amount_owned_2: '0',
    reward_growth_inside_0: '0',
    reward_growth_inside_1: '0',
    reward_growth_inside_2: '0',
    fee_growth_inside_a: '0',
    fee_owned_a: '0',
    fee_growth_inside_b: '0',
    fee_owned_b: '0',
    position_status: ClmmPositionStatus.Exists,
  }
  let fields = object.json
  if (fields) {
    const type = object.type
    const ownerWarp = object.owner as {
      AddressOwner: string
    }

    if ('nft' in fields) {
      fields = fields.nft.fields
      nft.description = fields.description as string
      nft.name = fields.name
      nft.link = fields.url
    } else {
      nft = buildNFT(object)
    }

    position = {
      ...nft,
      pos_object_id: fields.id,
      owner: ownerWarp.AddressOwner,
      type,
      liquidity: fields.liquidity,
      coin_type_a: fixCoinType(fields.coin_type_a, false),
      coin_type_b: fixCoinType(fields.coin_type_b, false),
      tick_lower_index: asIntN(BigInt(fields.tick_lower_index.bits)),
      tick_upper_index: asIntN(BigInt(fields.tick_upper_index.bits)),
      index: fields.index,
      pool: fields.pool,
      reward_amount_owned_0: '0',
      reward_amount_owned_1: '0',
      reward_amount_owned_2: '0',
      reward_growth_inside_0: '0',
      reward_growth_inside_1: '0',
      reward_growth_inside_2: '0',
      fee_growth_inside_a: '0',
      fee_owned_a: '0',
      fee_growth_inside_b: '0',
      fee_owned_b: '0',
      position_status: ClmmPositionStatus.Exists,
    }
  }



  return position
}

/**
 * Builds a PositionReward object based on a response containing information about the reward.
 * @param {any} fields - The response containing information about the reward.
 * @returns {PositionReward} - The built PositionReward object.
 */
export function buildPositionInfo(fields: any): PositionInfo {
  const rewarders = {
    reward_amount_owned_0: '0',
    reward_amount_owned_1: '0',
    reward_amount_owned_2: '0',
    reward_growth_inside_0: '0',
    reward_growth_inside_1: '0',
    reward_growth_inside_2: '0',
  }
  fields = 'fields' in fields ? fields.fields : fields

  fields.rewards.forEach((item: any, index: number) => {
    const { amount_owned, growth_inside } = 'fields' in item ? item.fields : item
    if (index === 0) {
      rewarders.reward_amount_owned_0 = amount_owned
      rewarders.reward_growth_inside_0 = growth_inside
    } else if (index === 1) {
      rewarders.reward_amount_owned_1 = amount_owned
      rewarders.reward_growth_inside_1 = growth_inside
    } else if (index === 2) {
      rewarders.reward_amount_owned_2 = amount_owned
      rewarders.reward_growth_inside_2 = growth_inside
    }
  })

  const tick_lower_index = 'fields' in fields.tick_lower_index ? fields.tick_lower_index.fields.bits : fields.tick_lower_index.bits
  const tick_upper_index = 'fields' in fields.tick_upper_index ? fields.tick_upper_index.fields.bits : fields.tick_upper_index.bits

  const position: PositionInfo = {
    liquidity: fields.liquidity,
    tick_lower_index: asIntN(BigInt(tick_lower_index)),
    tick_upper_index: asIntN(BigInt(tick_upper_index)),
    ...rewarders,
    fee_growth_inside_a: fields.fee_growth_inside_a,
    fee_owned_a: fields.fee_owned_a,
    fee_growth_inside_b: fields.fee_growth_inside_b,
    fee_owned_b: fields.fee_owned_b,
    pos_object_id: fields.position_id,
  }
  return position
}

/**
 * Builds a TickData object based on a response containing information about tick data.
 * It must check if the response contains the required fields.
 * @returns {TickData} - The built TickData object.
 */
export function buildTickData(objects: any): TickData {


  const fields = objects.json

  const valueItem = fields.value.value
  const position: TickData = {
    object_id: objects.objectId,
    index: asIntN(BigInt(valueItem.index.bits)),
    sqrt_price: new BN(valueItem.sqrt_price),
    liquidity_net: new BN(valueItem.liquidity_net.bits),
    liquidity_gross: new BN(valueItem.liquidity_gross),
    fee_growth_outside_a: new BN(valueItem.fee_growth_outside_a),
    fee_growth_outside_b: new BN(valueItem.fee_growth_outside_b),
    rewarders_growth_outside: valueItem.rewards_growth_outside,
  }

  return position
}



const bcsTick = bcs.struct('Tick', {
  index: bcs.u32(),
  sqrt_price: bcs.u128(),
  liquidity_net: bcs.u128(),
  liquidity_gross: bcs.u128(),
  fee_growth_outside_a: bcs.u256(),
  fee_growth_outside_b: bcs.u256(),
  rewards_growth_outside: bcs.vector(bcs.u256()),
})

const bcsVectorTick = bcs.vector(bcsTick)


export function parseTicksFromReturnValue(bytes: Uint8Array | string | number[]): TickData[] {
  const data =
    typeof bytes === 'string'
      ? new Uint8Array(Buffer.from(bytes, 'base64'))
      : bytes instanceof Uint8Array
        ? bytes
        : Array.isArray(bytes)
          ? new Uint8Array(bytes)
          : new Uint8Array(bytes as ArrayBuffer)

  if (data.length === 0) {
    return []
  }

  const parsed = bcsVectorTick.parse(data)
  return parsed.map((tick) => ({
    object_id: '',
    index: asIntN(BigInt(tick.index), 32),
    sqrt_price: new BN(tick.sqrt_price.toString()),
    liquidity_net: new BN(BigInt.asIntN(128, BigInt(tick.liquidity_net.toString())).toString()),
    liquidity_gross: new BN(tick.liquidity_gross.toString()),
    fee_growth_outside_a: new BN(tick.fee_growth_outside_a.toString()),
    fee_growth_outside_b: new BN(tick.fee_growth_outside_b.toString()),
    rewarders_growth_outside: tick.rewards_growth_outside.map((x) => new BN(x.toString())),
  }))
}

export function buildClmmPositionName(pool_index: number, position_index: number): string {
  return `Cetus LP | Pool${pool_index}-${position_index}`
}

export function buildPositionTransactionInfo(data: any, txIndex: number, filterIds: string[]) {
  const list: PositionTransactionInfo[] = []
  const { timestampMs, events } = data

  const filterEvenTypes = [
    'AddLiquidityEvent',
    'RemoveLiquidityEvent',
    'CollectFeeEvent',
    'CollectRewardEvent',
    'CollectRewardV2Event',
    'HarvestEvent',
    'AddLiquidityV2Event',
    'RemoveLiquidityV2Event',
  ]

  events?.forEach((event: any, index: number) => {
    const type = extractStructTagFromType(event.type).name
    if (filterEvenTypes.includes(type)) {
      const info: PositionTransactionInfo = {
        tx_digest: event.id.txDigest,
        package_id: event.packageId,
        transaction_module: event.transactionModule,
        sender: event.sender,
        type: event.type,
        timestamp_ms: timestampMs || '0',
        parsed_json: event.parsedJson,
        index: `${txIndex}_${index}`,
      }

      switch (type) {
        case 'CollectFeeEvent':
          if (filterIds.includes(info.parsed_json.position) && (d(info.parsed_json.amount_a).gt(0) || d(info.parsed_json.amount_b).gt(0))) {
            list.push(info)
          }
          break
        case 'RemoveLiquidityEvent':
        case 'AddLiquidityEvent':
        case 'AddLiquidityV2Event':
        case 'RemoveLiquidityV2Event':
          if (d(info.parsed_json.amount_a).gt(0) || d(info.parsed_json.amount_b).gt(0)) {
            list.push(info)
          }
          break
        case 'CollectRewardEvent':
        case 'HarvestEvent':
        case 'CollectRewardV2Event':
          if (
            (filterIds.includes(info.parsed_json.position) || filterIds.includes(info.parsed_json.wrapped_position_id)) &&
            d(info.parsed_json.amount).gt(0)
          ) {
            list.push(info)
          }
          break

        default:
          break
      }
    }
  })

  return list
}

export function buildPoolTransactionInfo(data: any, txIndex: number, package_ids: string[], pool_id: string) {
  const list: PoolTransactionInfo[] = []
  const { timestampMs, events } = data

  events?.forEach((event: any, index: number) => {
    const { name: type, address: package_address } = extractStructTagFromType(event.type)
    if (poolFilterEvenTypes.includes(type) && package_ids.includes(package_address) && pool_id === event.parsedJson.pool) {
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


export function parsePartner(data: any): Partner {
  const fields = data.json
  const type = data.type
  const formatType = extractStructTagFromType(type)

  const partner: Partner = {
    id: fields.id,
    name: fields.name,
    ref_fee_rate: fields.ref_fee_rate,
    start_time: Number(fields.start_time),
    end_time: Number(fields.end_time),
    balances: {
      id: fields.balances.id,
      size: fields.balances.size,
    },
    type: formatType.full_address,
  }

  return partner
}

