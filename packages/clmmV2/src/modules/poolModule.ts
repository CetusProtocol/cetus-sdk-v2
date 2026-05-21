// @ts-nocheck
import type { SuiObjectResponse } from '@mysten/sui/jsonRpc'
import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions'
import { normalizeSuiAddress } from '@mysten/sui/utils'
import { SuiGrpcClient } from '@mysten/sui/grpc'
import { handleError, handleMessageError, PartnerErrorCode, PoolErrorCode } from '../errors/errors'
import { CetusClmmV2SDK } from '../sdk'
import {
  FetchParams,
  Pool,
  PoolImmutables,
  PoolTransactionInfo,
  CreatePoolOptions,
  DestroyCreatePoolReceiptOptions,
  TickData,
} from '../types'
import {
  buildPool,
  buildPoolTransactionInfo,
  buildTickData,
  parseTicksFromReturnValue,
} from '../utils/common'

import type { PageQuery, PaginationArgs, SuiObjectIdType } from '@cetusprotocol/common-sdk'
import {
  asUintN,
  CACHE_TIME_24H,
  CLOCK_ADDRESS,
  CoinAsset,
  createFullClient,
  d,
  DataPage,
  DETAILS_KEYS,
  extractStructTagFromType,
  getPackagerConfigs,
  IModule,
  tickScore,
} from '@cetusprotocol/common-sdk'

type GetTickParams = {
  start?: number
  limit: number
} & FetchParams

export type CreatePoolAndAddLiquidityRowResult = {
  pos_id: TransactionObjectArgument
  remain_coin_a: TransactionObjectArgument
  remain_coin_b: TransactionObjectArgument
  tx: Transaction
  remain_coin_type_a: string
  remain_coin_type_b: string
}

/**
 * Helper class to help interact with clmm pools with a pool router interface.
 */
export class PoolModule implements IModule<CetusClmmV2SDK> {
  protected _sdk: CetusClmmV2SDK

  constructor(sdk: CetusClmmV2SDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }



  async getPoolImmutables(pagination_args: PaginationArgs = 'all', force_refresh = false): Promise<DataPage<PoolImmutables>> {
    const { package_id } = this._sdk.sdkOptions.clmm_pool
    const allPools: PoolImmutables[] = []
    const dataPage: DataPage<PoolImmutables> = {
      data: [],
      has_next_page: false,
    }

    const queryAll = pagination_args === 'all'
    const cacheAllKey = `${package_id}_getPoolImmutables`
    if (queryAll) {
      const cacheDate = this._sdk.getCache<PoolImmutables[]>(cacheAllKey, force_refresh)
      if (cacheDate) {
        allPools.push(...cacheDate)
      }
    }
    if (allPools.length === 0) {
      try {
        const moveEventType = `${package_id}::registry::CreatePoolEvent`
        const objects = await this._sdk.FullClient.queryEventsByPage({ MoveEventType: moveEventType }, pagination_args)
        dataPage.has_next_page = objects.has_next_page
        dataPage.next_cursor = objects.next_cursor
        objects.data.forEach((object: any) => {
          const fields = object.parsedJson
          if (fields) {
            allPools.push({
              id: fields.pool_id,
              tick_spacing: fields.tick_spacing,
              coin_type_a: extractStructTagFromType(fields.coin_type_a).full_address,
              coin_type_b: extractStructTagFromType(fields.coin_type_b).full_address,
            })
          }
        })
      } catch (error) {
        return handleError(PoolErrorCode.FetchError, error as Error, {
          [DETAILS_KEYS.METHOD_NAME]: 'getPoolImmutables',
        })
      }
    }
    dataPage.data = allPools
    if (queryAll) {
      this._sdk.updateCache(`${package_id}_getPoolImmutables`, allPools, CACHE_TIME_24H)
    }
    return dataPage
  }


  async getPools(pagination_args: PaginationArgs = 'all', force_refresh = false): Promise<DataPage<Pool>> {
    const dataPage: DataPage<Pool> = {
      data: [],
      has_next_page: false,
    }

    const poolImmutables = await this.getPoolImmutables(pagination_args, force_refresh)

    const objectDataResponses: any[] = await this._sdk.FullClient.batchGetObjects(
      poolImmutables.data.map((item) => item.id),
      {
        content: true,
        json: true,
      }
    )

    for (const suiObj of objectDataResponses) {
      if (suiObj.error != null || suiObj.data?.content?.dataType !== 'moveObject') {
        handleMessageError(
          PoolErrorCode.InvalidPoolObject,
          `getPoolWithPages error code: ${suiObj.error?.code ?? 'unknown error'}, please check config and object ids`,
          {
            [DETAILS_KEYS.METHOD_NAME]: 'getPoolsWithPage',
          }
        )
      }
      const pool = buildPool(suiObj)
      dataPage.data.push(pool)
      const cacheKey = `${pool.id}_getPoolObject`
      this._sdk.updateCache(cacheKey, pool, CACHE_TIME_24H)
    }
    dataPage.has_next_page = poolImmutables.has_next_page
    dataPage.next_cursor = poolImmutables.next_cursor
    return dataPage
  }



  /**
   * Gets a list of pools.
   * @param {string[]} assign_pools An array of pool ID to get.
   * @returns {Promise<Pool[]>} array of Pool objects.
   */
  async getAssignPools(assign_pools: string[]): Promise<Pool[]> {
    if (assign_pools.length === 0) {
      return []
    }
    const allPool: Pool[] = []

    const objectDataResponses: any[] = await this._sdk.FullClient.batchGetObjects(assign_pools, {
      content: true,
      json: true,
    })

    for (const suiObj of objectDataResponses) {
      if (suiObj.error != null || suiObj.data?.content?.dataType !== 'moveObject') {
        handleMessageError(
          PoolErrorCode.InvalidPoolObject,
          `getPools error code: ${suiObj.error?.code ?? 'unknown error'}, please check config and object ids`,
          {
            [DETAILS_KEYS.METHOD_NAME]: 'getAssignPools',
          }
        )
      }

      const pool = buildPool(suiObj as any)
      allPool.push(pool)
      const cacheKey = `${pool.id}_getPoolObject`
      this._sdk.updateCache(cacheKey, pool, CACHE_TIME_24H)
    }
    return allPool
  }

  /**
   * Gets a pool by its object ID.
   * @param {string} pool_id The object ID of the pool to get.
   * @param {true} force_refresh Whether to force a refresh of the cache.
   * @returns {Promise<Pool>} A promise that resolves to a Pool object.
   */
  async getPool(pool_id: string, force_refresh = true): Promise<Pool> {
    const cacheKey = `${pool_id}_getPoolObject`
    const cacheData = this._sdk.getCache<Pool>(cacheKey, force_refresh)
    if (cacheData !== undefined) {
      return cacheData
    }
    const object = (await this._sdk.FullClient.getObject({
      objectId: pool_id,
      include: {
        type: true,
        content: true,
        json: true,
      },
    })) as any as SuiObjectResponse

    if (object.error != null || object.data?.content?.dataType !== 'moveObject') {
      handleMessageError(
        PoolErrorCode.InvalidPoolObject,
        `getPool error code: ${object.error?.code ?? 'unknown error'}, please check config and object id`,
        {
          [DETAILS_KEYS.METHOD_NAME]: 'getPool',
        }
      )
    }
    const pool = buildPool(object)
    // if (verify_pool_status) {
    //   const poolStatus = await this.getPoolStatus(pool_id)
    //   if (poolStatus) {
    //     pool.pool_status = poolStatus
    //   }
    // }
    this._sdk.updateCache(cacheKey, pool)
    return pool
  }



  async getPoolTransactionList({
    pool_id,
    pagination_args,
    order = 'descending',
    full_rpc_url,
  }: {
    pool_id: string
    full_rpc_url?: string
    pagination_args: PageQuery
    order?: 'ascending' | 'descending' | null | undefined
  }): Promise<DataPage<PoolTransactionInfo>> {
    const { FullClient: fullClient, sdkOptions } = this._sdk
    let client
    if (full_rpc_url) {
      client = createFullClient(new SuiGrpcClient({ baseUrl: full_rpc_url, network: this._sdk.sdkOptions.env === 'testnet' ? 'testnet' : 'mainnet' }))
    } else {
      client = fullClient
    }
    const data: DataPage<PoolTransactionInfo> = {
      data: [],
      has_next_page: false,
    }

    const limit = 50
    const query = pagination_args
    const user_limit = pagination_args.limit || 10
    // const eventContractMaps = sdkOptions.env === 'testnet' ? eventTestnetContractMaps : eventMainnetContractMaps
    do {
      const res = await client.queryTransactionBlocksByPage({ ChangedObject: pool_id }, { ...query, limit: 50 }, order)
      res.data.forEach((item, index) => {
        data.next_cursor = res.next_cursor
        const dataList = buildPoolTransactionInfo(item, index, {} as any, pool_id)
        data.data = [...data.data, ...dataList]
      })
      data.has_next_page = res.has_next_page
      data.next_cursor = res.next_cursor
      query.cursor = res.next_cursor
    } while (data.data.length < user_limit && data.has_next_page)

    if (data.data.length > user_limit) {
      data.data = data.data.slice(0, user_limit)
      data.next_cursor = data.data[data.data.length - 1].tx
    }

    return data
  }


  public createPool(option: CreatePoolOptions) {
    const tx = new Transaction()
    const { coin_type_a, coin_type_b } = option
    const { receipt, pool_id } = this.createPoolAndReturnReceipt(option, tx)
    this.destroyCreatePoolReceipt({ receipt, pool_id, coin_type_a, coin_type_b }, tx)
    return tx
  }


  public createPoolAndReturnReceipt(option: CreatePoolOptions, tx: Transaction): { receipt: TransactionObjectArgument, pool_id: TransactionObjectArgument } {
    const { coin_type_a, coin_type_b, tick_spacing, has_dynamic_fee, fee_coin_type, min_tick_range, initialize_price, url, fee_rate, swap_open_time,
      liquidity_open_time, fee_scheduler_mode } = option
    const { clmm_pool } = this.sdk.sdkOptions
    const { registry_id, global_config_id, versioned_id } = getPackagerConfigs(clmm_pool)
    let args: TransactionObjectArgument[] = []
    let methodName = ''
    if (fee_scheduler_mode !== undefined) {
      methodName = "create_launch_pool"
      args = [
        tx.object(registry_id),
        tx.object(global_config_id),
        tx.pure.u32(tick_spacing),
        tx.pure.u64(fee_rate),
        tx.pure.bool(has_dynamic_fee),
        tx.pure.u8(fee_scheduler_mode),
        tx.pure.u8(fee_coin_type),
        tx.pure.u32(min_tick_range),
        tx.pure.option("u64", liquidity_open_time),
        tx.pure.option("u64", swap_open_time),
        tx.pure.u128(initialize_price),
        tx.pure.string(url),
        tx.object(versioned_id),
        tx.object(CLOCK_ADDRESS),
      ]
    } else {
      methodName = "create_pool"
      args = [
        tx.object(registry_id),
        tx.object(global_config_id),
        tx.pure.u32(tick_spacing),
        tx.pure.u64(fee_rate),
        tx.pure.bool(has_dynamic_fee),
        tx.pure.u8(fee_coin_type),
        tx.pure.u32(min_tick_range),
        tx.pure.option("u64", liquidity_open_time),
        tx.pure.option("u64", swap_open_time),
        tx.pure.u128(initialize_price),
        tx.pure.string(url),
        tx.object(versioned_id),
        tx.object(CLOCK_ADDRESS),
      ]
    }

    const [receipt, pool_id] = tx.moveCall({
      target: `${clmm_pool.published_at}::registry::${methodName}`,
      typeArguments: [coin_type_a, coin_type_b],
      arguments: args,
    })

    return {
      receipt,
      pool_id,
    }
  }



  public destroyCreatePoolReceipt(option: DestroyCreatePoolReceiptOptions, tx: Transaction) {
    const { receipt, pool_id, coin_type_a, coin_type_b } = option
    const { clmm_pool } = this.sdk.sdkOptions
    const { versioned_id } = getPackagerConfigs(clmm_pool)

    tx.moveCall({
      target: `${clmm_pool.published_at}::registry::destroy_receipt`,
      typeArguments: [coin_type_a, coin_type_b],
      arguments: [
        receipt,
        pool_id,
        tx.object(versioned_id),
      ],
    })

  }



  /**
   * Fetches ticks from the exchange.
   * @param {FetchParams} params The parameters for the fetch.
   * @returns {Promise<TickData[]>} A promise that resolves to an array of tick data.
   */
  async fetchTicks(params: FetchParams): Promise<TickData[]> {
    let ticks: TickData[] = []
    let start: number | undefined = undefined
    const limit = 512

    while (true) {
      const data = await this.getTicks({
        pool_id: params.pool_id,
        coin_type_a: params.coin_type_a,
        coin_type_b: params.coin_type_b,
        start,
        limit,
      })
      ticks = [...ticks, ...data]
      if (data.length < limit) {
        break
      }
      start = Number(asUintN(BigInt(data[data.length - 1].index)))
    }
    return ticks
  }

  /**
   * Fetches ticks from the exchange using the simulation exec tx.
   * @param {GetTickParams} params The parameters for the fetch.
   * @returns {Promise<TickData[]>} A promise that resolves to an array of tick data.
   */
  private async getTicks(params: GetTickParams): Promise<TickData[]> {
    const { clmm_pool } = this.sdk.sdkOptions
    const ticks: TickData[] = []
    const typeArguments = [params.coin_type_a, params.coin_type_b]

    const tx = new Transaction()


    const args = [tx.object(params.pool_id), tx.pure.option("u32", params.start), tx.pure.u64(params.limit.toString())]

    tx.moveCall({
      target: `${clmm_pool.published_at}::pool::fetch_ticks`,
      arguments: args,
      typeArguments,
    })

    const simulateRes: any = await this.sdk.FullClient.simulateTransaction({
      transaction: tx,
      checksEnabled: false,
      include: { commandResults: true },
    })

    if (simulateRes.error != null) {
      handleMessageError(
        PoolErrorCode.InvalidTickObjectId,
        `getTicks error code: ${simulateRes.error ?? 'unknown error'}, please check config and tick object ids`,
        {
          [DETAILS_KEYS.METHOD_NAME]: 'getTicks',
          [DETAILS_KEYS.REQUEST_PARAMS]: params,
        }
      )
    }

    const returnValues = simulateRes.commandResults?.[0]?.returnValues
    if (returnValues != null && returnValues.length > 0) {
      const [bcsBytes] = returnValues[0]
      ticks.push(...parseTicksFromReturnValue(bcsBytes))
    }
    return ticks
  }

  /**
   * Fetches ticks from the fullnode using the RPC API.
   * @param {string} tick_handle The handle for the tick. Get tick handle from `sdk.Pool.getPool()`
   * @returns {Promise<TickData[]>} A promise that resolves to an array of tick data.
   */
  async fetchTicksByRpc(tick_handle: string): Promise<TickData[]> {
    let allTickData: TickData[] = []
    let nextCursor: string | null = null
    const limit = 50
    while (true) {
      const allTickId: SuiObjectIdType[] = []
      const idRes: any = await this.sdk.FullClient.listDynamicFields({
        parentId: tick_handle,
        cursor: nextCursor,
        limit,
      })
      nextCursor = idRes.cursor
      idRes.dynamicFields.forEach((item: any) => {
        if (extractStructTagFromType(item.objectType).module === 'skip_list') {
          allTickId.push(item.objectId)
        }
      })

      allTickData = [...allTickData, ...(await this.getTicksByRpc(allTickId))]

      if (!idRes.hasNextPage) {
        break
      }
    }

    return allTickData
  }

  /**
   * Get ticks by tick object ids.
   * @param {string} tick_object_id The object ids of the ticks.
   * @returns {Promise<TickData[]>} A promise that resolves to an array of tick data.
   */
  private async getTicksByRpc(tick_object_id: string[]): Promise<TickData[]> {
    const ticks: TickData[] = []
    const objectDataResponses: any[] = await this.sdk.FullClient.batchGetObjects(tick_object_id, { content: true, json: true })
    for (const suiObj of objectDataResponses) {
      if (suiObj.error != null || suiObj.data?.content?.dataType !== 'moveObject') {
        handleMessageError(
          PoolErrorCode.InvalidTickObjectId,
          `getTicksByRpc error code: ${suiObj.error?.code ?? 'unknown error'}, please check config and tick object ids`,
          {
            [DETAILS_KEYS.METHOD_NAME]: 'getTicksByRpc',
          }
        )
      }

      const tick = buildTickData(suiObj as any)
      if (tick != null) {
        ticks.push(tick)
      }
    }
    return ticks
  }

  /**
   * Gets the tick data for the given tick index.
   * @param {string} tick_handle The handle for the tick.
   * @param {number} tick_index The index of the tick.
   * @returns {Promise<TickData | null>} A promise that resolves to the tick data.
   */
  async getTickDataByIndex(tick_handle: string, tick_index: number): Promise<TickData> {
    const name = { type: 'u64', value: asUintN(BigInt(tickScore(tick_index).toString())).toString() }
    const res = await this.sdk.FullClient.getDynamicFieldObject({
      parentId: tick_handle,
      name,
    })

    if (res.error != null || res.data?.content?.dataType !== 'moveObject') {
      handleMessageError(PoolErrorCode.InvalidTickIndex, `get tick by index: ${tick_index} error: ${res.error}`, {
        [DETAILS_KEYS.METHOD_NAME]: 'getTickDataByIndex',
      })
    }

    return buildTickData(res)
  }

  /**
   * Gets the tick data for the given object ID.
   * @param {string} tick_id The object ID of the tick.
   * @returns {Promise<TickData | null>} A promise that resolves to the tick data.
   */
  async getTickDataByObjectId(tick_id: string): Promise<TickData | null> {
    const res: any = await this.sdk.FullClient.getObject({
      objectId: tick_id,
      include: { content: true, json: true, type: true },
    })

    if (res.error != null || res.data?.content?.dataType !== 'moveObject') {
      handleMessageError(
        PoolErrorCode.InvalidTickObjectId,
        `getTicksByRpc error code: ${res.error?.code ?? 'unknown error'}, please check config and tick object ids`,
        {
          [DETAILS_KEYS.METHOD_NAME]: 'getTickDataByObjectId',
        }
      )
    }
    return buildTickData(res)
  }






}
