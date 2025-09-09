import type { SuiObjectResponse, SuiTransactionBlockResponse } from '@mysten/sui/client'
import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions'
import BN from 'bn.js'
import {
  asIntN,
  buildNFT,
  d,
  DETAILS_KEYS,
  extractStructTagFromType,
  getMoveObjectType,
  getObjectDeletedResponse,
  getObjectFields,
  getObjectId,
  getObjectNotExistsResponse,
  getObjectOwner,
  MathUtil,
} from '@cetusprotocol/common-sdk'
import { handleMessageError, PoolErrorCode, PositionErrorCode } from '../errors/errors'
import { CetusClmmSDK } from '../sdk'
import type { Pool, PoolStatus, PoolTransactionInfo, Position, PositionInfo, PositionTransactionInfo, Rewarder } from '../types'
import { ClmmIntegrateUtilsModule, ClmmPositionStatus, poolFilterEvenTypes } from '../types'
import type { TickData } from '../types/clmmpool'
import type { NFT } from '../types/sui'

/**
 * Builds a pool name based on two coin types and tick spacing.
 * @param {string} coin_type_a - The type of the first coin.
 * @param {string} coin_type_b - The type of the second coin.
 * @param {string} tick_spacing - The tick spacing of the pool.
 * @returns {string} - The name of the pool.
 */
function buildPoolName(coin_type_a: string, coin_type_b: string, tick_spacing: string) {
  const coinNameA = extractStructTagFromType(coin_type_a).name
  const coinNameB = extractStructTagFromType(coin_type_b).name
  return `${coinNameA}-${coinNameB}[${tick_spacing}]`
}

/**
 * Builds a Pool object based on a SuiObjectResponse.
 * @param {SuiObjectResponse} objects - The SuiObjectResponse containing information about the pool.
 * @returns {Pool} - The built Pool object.
 */
export function buildPool(objects: SuiObjectResponse): Pool {
  const type = getMoveObjectType(objects) as string
  const formatType = extractStructTagFromType(type)
  const fields = getObjectFields(objects)
  if (fields == null) {
    handleMessageError(PoolErrorCode.InvalidPoolObject, `Pool id ${getObjectId(objects)} not exists.`, {
      [DETAILS_KEYS.METHOD_NAME]: 'buildPool',
    })
  }

  const rewarders: Rewarder[] = []
  fields.rewarder_manager.fields.rewarders.forEach((item: any) => {
    const { emissions_per_second } = item.fields
    const emissionSeconds = MathUtil.fromX64(new BN(emissions_per_second))
    const emissionsEveryDay = Math.floor(emissionSeconds.toNumber() * 60 * 60 * 24)

    rewarders.push({
      emissions_per_second,
      coin_type: extractStructTagFromType(item.fields.reward_coin.fields.name).source_address,
      growth_global: item.fields.growth_global,
      emissions_every_day: emissionsEveryDay,
    })
  })

  const is_pause = fields.is_pause
  const pool_status: PoolStatus = {
    disable_add_liquidity: is_pause,
    disable_remove_liquidity: is_pause,
    disable_swap: is_pause,
    disable_flash_loan: is_pause,
    disable_collect_fee: is_pause,
    disable_collect_reward: is_pause,
  }

  const pool: Pool = {
    id: getObjectId(objects),
    pool_type: type,
    coin_type_a: formatType.type_arguments[0],
    coin_type_b: formatType.type_arguments[1],
    coin_amount_a: fields.coin_a,
    coin_amount_b: fields.coin_b,
    current_sqrt_price: fields.current_sqrt_price,
    current_tick_index: asIntN(BigInt(fields.current_tick_index.fields.bits)),
    fee_growth_global_a: fields.fee_growth_global_a,
    fee_growth_global_b: fields.fee_growth_global_b,
    fee_protocol_coin_a: fields.fee_protocol_coin_a,
    fee_protocol_coin_b: fields.fee_protocol_coin_b,
    fee_rate: fields.fee_rate,
    pool_status,
    liquidity: fields.liquidity,
    position_manager: {
      positions_handle: fields.position_manager.fields.positions.fields.id.id,
      size: fields.position_manager.fields.positions.fields.size,
    },
    rewarder_infos: rewarders,
    rewarder_last_updated_time: fields.rewarder_manager.fields.last_updated_time,
    tick_spacing: fields.tick_spacing,
    ticks_handle: fields.tick_manager.fields.ticks.fields.id.id,
    uri: fields.url,
    index: Number(fields.index),
    name: '',
  }
  pool.name = buildPoolName(pool.coin_type_a, pool.coin_type_b, pool.tick_spacing)
  return pool
}

/** Builds a Position object based on a SuiObjectResponse.
 * @param {SuiObjectResponse} object - The SuiObjectResponse containing information about the position.
 * @returns {Position} - The built Position object.
 */
export function buildPosition(object: SuiObjectResponse): Position {
  if (object.error != null || object.data?.content?.dataType !== 'moveObject') {
    handleMessageError(PositionErrorCode.InvalidPositionObject, `Position not exists. Get Position error:${object.error}`, {
      [DETAILS_KEYS.METHOD_NAME]: 'buildPosition',
    })
  }

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
  let fields = getObjectFields(object)
  if (fields) {
    const type = getMoveObjectType(object) as string
    const ownerWarp = getObjectOwner(object) as {
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
      pos_object_id: fields.id.id,
      owner: ownerWarp.AddressOwner,
      type,
      liquidity: fields.liquidity,
      coin_type_a: fields.coin_type_a.fields.name,
      coin_type_b: fields.coin_type_b.fields.name,
      tick_lower_index: asIntN(BigInt(fields.tick_lower_index.fields.bits)),
      tick_upper_index: asIntN(BigInt(fields.tick_upper_index.fields.bits)),
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

  const deletedResponse = getObjectDeletedResponse(object)
  if (deletedResponse) {
    position.pos_object_id = deletedResponse.objectId
    position.position_status = ClmmPositionStatus.Deleted
  }
  const objectNotExistsResponse = getObjectNotExistsResponse(object)
  if (objectNotExistsResponse) {
    position.pos_object_id = objectNotExistsResponse
    position.position_status = ClmmPositionStatus.NotExists
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
 * @param {SuiObjectResponse} objects - The response containing information about tick data.
 * @returns {TickData} - The built TickData object.
 */
export function buildTickData(objects: SuiObjectResponse): TickData {
  if (objects.error != null || objects.data?.content?.dataType !== 'moveObject') {
    handleMessageError(PoolErrorCode.InvalidTickObject, `Tick not exists. Get tick data error:${objects.error}`, {
      [DETAILS_KEYS.METHOD_NAME]: 'buildTickData',
    })
  }

  const fields = getObjectFields(objects)

  const valueItem = fields.value.fields.value.fields
  const position: TickData = {
    object_id: getObjectId(objects),
    index: asIntN(BigInt(valueItem.index.fields.bits)),
    sqrt_price: new BN(valueItem.sqrt_price),
    liquidity_net: new BN(valueItem.liquidity_net.fields.bits),
    liquidity_gross: new BN(valueItem.liquidity_gross),
    fee_growth_outside_a: new BN(valueItem.fee_growth_outside_a),
    fee_growth_outside_b: new BN(valueItem.fee_growth_outside_b),
    rewarders_growth_outside: valueItem.rewards_growth_outside,
  }

  return position
}

/**
 * Builds a TickData object based on a given event's fields.
 * @param {any} fields - The fields of an event.
 * @returns {TickData} - The built TickData object.
 * @throws {Error} If any required field is missing.
 */
export function buildTickDataByEvent(fields: any): TickData {
  if (
    !fields ||
    !fields.index ||
    !fields.sqrt_price ||
    !fields.liquidity_net ||
    !fields.liquidity_gross ||
    !fields.fee_growth_outside_a ||
    !fields.fee_growth_outside_b
  ) {
    handleMessageError(PoolErrorCode.InvalidTickFields, `Invalid tick fields.`, {
      [DETAILS_KEYS.METHOD_NAME]: 'buildTickDataByEvent',
    })
  }

  // It's assumed that asIntN is a function that converts a BigInt to an integer.
  const index = asIntN(BigInt(fields.index.bits))
  const sqrt_price = new BN(fields.sqrt_price)
  const liquidity_net = new BN(fields.liquidity_net.bits)
  const liquidity_gross = new BN(fields.liquidity_gross)
  const fee_growth_outside_a = new BN(fields.fee_growth_outside_a)
  const fee_growth_outside_b = new BN(fields.fee_growth_outside_b)
  const rewarders_growth_outside = fields.rewards_growth_outside || []

  const tick: TickData = {
    object_id: '',
    index,
    sqrt_price,
    liquidity_net,
    liquidity_gross,
    fee_growth_outside_a,
    fee_growth_outside_b,
    rewarders_growth_outside,
  }

  return tick
}

export function buildClmmPositionName(pool_index: number, position_index: number): string {
  return `Cetus LP | Pool${pool_index}-${position_index}`
}

export function buildPositionTransactionInfo(data: SuiTransactionBlockResponse, txIndex: number, filterIds: string[]) {
  const list: PositionTransactionInfo[] = []
  const { timestampMs, events } = data

  const filterEvenTypes = [
    'AddLiquidityEvent',
    'RemoveLiquidityEvent',
    'CollectFeeEvent',
    'CollectRewardEvent',
    'CollectRewardV2Event',
    'HarvestEvent',
  ]

  events?.forEach((event, index) => {
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

export function buildPoolTransactionInfo(data: SuiTransactionBlockResponse, txIndex: number, package_id: string, pool_id: string) {
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

export function buildTransferCoinToSender(sdk: CetusClmmSDK, tx: Transaction, coin: TransactionObjectArgument, coinType: string) {
  tx.moveCall({
    target: `${sdk.sdkOptions.integrate.published_at}::${ClmmIntegrateUtilsModule}::transfer_coin_to_sender`,
    typeArguments: [coinType],
    arguments: [coin],
  })
}

// If recipient not set, transfer objects move call will use ctx sender
export function buildTransferCoin(
  sdk: CetusClmmSDK,
  tx: Transaction,
  coin: TransactionObjectArgument,
  coinType: string,
  recipient?: string
) {
  if (recipient != null) {
    tx.transferObjects([coin], tx.pure.address(recipient))
  } else {
    buildTransferCoinToSender(sdk, tx, coin, coinType)
  }
}
