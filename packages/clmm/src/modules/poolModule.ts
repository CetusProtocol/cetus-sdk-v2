import { SuiClient, type DynamicFieldPage, type SuiObjectResponse } from '@mysten/sui/client'
import type { TransactionObjectArgument } from '@mysten/sui/transactions'
import { Transaction } from '@mysten/sui/transactions'
import { normalizeSuiAddress } from '@mysten/sui/utils'
import BN from 'bn.js'
import { ConfigErrorCode, handleError, handleMessageError, PartnerErrorCode, PoolErrorCode, PositionErrorCode } from '../errors/errors'
import type { CetusClmmSDK } from '../sdk'
import {
  PoolLiquiditySnapshot,
  poolLiquiditySnapshotType,
  PositionSnapshot,
  type CalculateCreatePoolResult,
  type CalculateCreatePoolWithPriceParams,
  type ClmmConfig,
  type CreatePoolAddLiquidityParams,
  type CreatePoolAddLiquidityWithPriceParams,
  type FetchParams,
  type Pool,
  type PoolImmutables,
  PoolStatus,
  type PoolTransactionInfo,
  type Position,
  type PositionInfo,
  type TickData,
} from '../types'
import { ClmmFetcherModule, ClmmPartnerModule } from '../types/sui'
import {
  buildPool,
  buildPoolTransactionInfo,
  buildPositionInfo,
  buildTickData,
  buildTickDataByEvent,
  buildTransferCoinToSender,
} from '../utils/common'

import type { PageQuery, PaginationArgs, SuiObjectIdType } from '@cetusprotocol/common-sdk'
import {
  asUintN,
  CACHE_TIME_24H,
  ClmmPoolUtil,
  CLOCK_ADDRESS,
  CoinAsset,
  CoinAssist,
  createFullClient,
  d,
  DataPage,
  DETAILS_KEYS,
  extractStructTagFromType,
  getObjectFields,
  getObjectPreviousTransactionDigest,
  getPackagerConfigs,
  IModule,
  isSortedSymbols,
  TickMath,
  tickScore,
  TickUtil,
} from '@cetusprotocol/common-sdk'
import { VestUtils } from '../utils/vestUtils'

type GetTickParams = {
  start: number[]
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
export class PoolModule implements IModule<CetusClmmSDK> {
  protected _sdk: CetusClmmSDK

  constructor(sdk: CetusClmmSDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  /**
   * Gets a list of positions for the given positionHandle.
   * @param {string} position_handle The handle for the position.
   * @returns {DataPage<Position>} A promise that resolves to an array of Position objects.
   */
  async getPositionList(position_handle: string, pagination_args: PaginationArgs = 'all'): Promise<DataPage<Position>> {
    const dataPage: DataPage<Position> = {
      data: [],
      has_next_page: true,
    }
    const objects = await this._sdk.FullClient.getDynamicFieldsByPage(position_handle, pagination_args)

    dataPage.has_next_page = objects.has_next_page
    dataPage.next_cursor = objects.next_cursor

    const positionObjectIDs = objects.data.map((item: any) => {
      if (item.error != null) {
        handleMessageError(
          ConfigErrorCode.InvalidConfig,
          `when getPositionList get position objects error: ${item.error}, please check the rpc, contracts address config and position id.`,
          {
            [DETAILS_KEYS.METHOD_NAME]: 'getPositionList',
          }
        )
      }

      return item.name.value
    })

    const allPosition: Position[] = await this._sdk.Position.getSimplePositionList(positionObjectIDs)
    dataPage.data = allPosition
    return dataPage
  }

  /**
   * Gets a list of pool immutables.
   * @param {PaginationArgs} paginationArgs The cursor and limit to start at.
   * @returns {Promise<DataPage<PoolImmutables>>} Array of PoolImmutable objects.
   */
  async getPoolImmutablesWithPage(pagination_args: PaginationArgs = 'all', force_refresh = false): Promise<DataPage<PoolImmutables>> {
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
        const moveEventType = `${package_id}::factory::CreatePoolEvent`
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

  /**
   * Gets a list of pools.
   * @param {PaginationArgs} pagination_args The cursor and limit to start at.
   * @param {boolean} force_refresh Whether to force a refresh of the cache.
   * @returns {Promise<Pool[]>} An array of Pool objects.
   */
  async getPoolsWithPage(pagination_args: PaginationArgs = 'all', force_refresh = false): Promise<DataPage<Pool>> {
    const dataPage: DataPage<Pool> = {
      data: [],
      has_next_page: false,
    }

    const poolImmutables = await this.getPoolImmutablesWithPage(pagination_args, force_refresh)

    const objectDataResponses: any[] = await this._sdk.FullClient.batchGetObjects(
      poolImmutables.data.map((item) => item.id),
      {
        showContent: true,
        showType: true,
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
   * Get the liquidity snapshot of a pool.
   * @param pool_id The ID of the pool.
   * @returns The liquidity snapshot of the pool.
   */
  async getPoolLiquiditySnapshot(pool_id: string, show_details = false): Promise<PoolLiquiditySnapshot> {
    try {
      const res = await this._sdk.FullClient.getDynamicFieldObject({
        parentId: pool_id,
        name: {
          type: '0x1::string::String',
          value: poolLiquiditySnapshotType,
        },
      })
      const fields = VestUtils.parsePoolLiquiditySnapshot(res)

      if (show_details) {
        const posSnapshots = await this._sdk.FullClient.getDynamicFieldsByPage(fields.snapshots.id)
        const posSnapshotIds = posSnapshots.data.map((item) => item.objectId)
        if (posSnapshotIds.length > 0) {
          const posSnapshotsData = await this._sdk.FullClient.batchGetObjects(posSnapshotIds, {
            showContent: true,
            showType: true,
          })

          const positionSnapshots: PositionSnapshot[] = []
          posSnapshotsData.forEach((item) => {
            const fields = VestUtils.parsePositionSnapshot(item)
            positionSnapshots.push(fields)
          })
          fields.position_snapshots = positionSnapshots
        }
      }

      return fields
    } catch (error) {
      return handleError(PoolErrorCode.InvalidPoolObject, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getPoolLiquiditySnapshot',
        [DETAILS_KEYS.REQUEST_PARAMS]: pool_id,
      })
    }
  }

  async getPositionSnapshot(snapshot_handle: string, pos_ids: string[]): Promise<PositionSnapshot[]> {
    const res = await this._sdk.FullClient.getDynamicFieldObjects(snapshot_handle, pos_ids, '0x2::object::ID', 'address')
    const positionSnapshots: PositionSnapshot[] = []
    res.forEach((item) => {
      try {
        const fields = VestUtils.parsePositionSnapshot(item)
        positionSnapshots.push(fields)
      } catch (error) {
        console.log('getPositionSnapshot error: ', error)
      }
    })
    return positionSnapshots
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

    const objectDataResponses = await this._sdk.FullClient.batchGetObjects(assign_pools, {
      showContent: true,
      showType: true,
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

      const pool = buildPool(suiObj)
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
   * @param {boolean} verify_pool_status Whether to verify the pool status.
   * @returns {Promise<Pool>} A promise that resolves to a Pool object.
   */
  async getPool(pool_id: string, force_refresh = true, verify_pool_status = false): Promise<Pool> {
    const cacheKey = `${pool_id}_getPoolObject`
    const cacheData = this._sdk.getCache<Pool>(cacheKey, force_refresh)
    if (cacheData !== undefined) {
      return cacheData
    }
    const object = (await this._sdk.FullClient.getObject({
      id: pool_id,
      options: {
        showType: true,
        showContent: true,
      },
    })) as SuiObjectResponse

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
    if (verify_pool_status) {
      const poolStatus = await this.getPoolStatus(pool_id)
      if (poolStatus) {
        pool.pool_status = poolStatus
      }
    }
    this._sdk.updateCache(cacheKey, pool)
    return pool
  }

  async getPoolByCoins(coins: string[], fee_rate?: number): Promise<Pool[]> {
    if (coins.length === 0) {
      return []
    }

    // 0x2::sui::SUI -> 0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI
    for (let i = 0; i < coins.length; i++) {
      if (coins[i] === '0x2::sui::SUI') {
        coins[i] = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI'
      }
    }

    let url = this._sdk.sdkOptions.stats_pools_url!
    if (!url) {
      handleMessageError(PoolErrorCode.StatsPoolsUrlNotSet, `statsPoolsUrl is not set in the sdk options.`, {
        [DETAILS_KEYS.METHOD_NAME]: 'getPoolByCoins',
      })
    }
    url += `?order_by=-fees&limit=100&has_mining=true&has_farming=true&no_incentives=true&display_all_pools=true&coin_type=${coins.join(
      ','
    )}`

    const response = await fetch(url)
    let json
    try {
      json = await response.json()
    } catch (e) {
      handleError(PoolErrorCode.FetchError, e as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getPoolByCoins',
        [DETAILS_KEYS.REQUEST_PARAMS]: url,
      })
    }
    const pools = json.data.lp_list

    const poolAddresses = []
    for (const pool of pools) {
      if (coins.includes(pool.coin_a_address) && coins.includes(pool.coin_b_address)) {
        if (fee_rate != null) {
          if (pool.object.feeRate === fee_rate) {
            poolAddresses.push(pool.address)
          }
        } else {
          poolAddresses.push(pool.address)
        }
      }
    }

    if (poolAddresses.length > 0) {
      const poolObjects = await this.getAssignPools(poolAddresses)
      return poolObjects
    }

    return []
  }

  /**
   * Create a pool of clmmpool protocol. The pool is identified by (CoinTypeA, CoinTypeB, tick_spacing).
   * @param {CreatePoolParams | CreatePoolAddLiquidityParams} params
   * @returns {Promise<Transaction>}
   */
  async createPoolPayload(params: CreatePoolAddLiquidityParams, tx?: Transaction): Promise<Transaction> {
    if (isSortedSymbols(normalizeSuiAddress(params.coin_type_a), normalizeSuiAddress(params.coin_type_b))) {
      const swap_coin_type_b = params.coin_type_b
      params.coin_type_b = params.coin_type_a
      params.coin_type_a = swap_coin_type_b
      const metadata_b = params.metadata_b
      params.metadata_b = params.metadata_a
      params.metadata_a = metadata_b
    }
    return await this.createPoolAndAddLiquidity(params, tx)
  }

  /**
   * Create pool and add liquidity row. It will call `pool_creator_v2::create_pool_v2` function.
   * This method will return the position, coin_a, coin_b. User can use these to build own transaction.
   * @param {CreatePoolAddLiquidityParams}params The parameters for the create and liquidity.
   * @returns {Promise<CreatePoolAndAddLiquidityRowResult>} A promise that resolves to the transaction payload.
   */
  async createPoolRowPayload(params: CreatePoolAddLiquidityParams, tx?: Transaction): Promise<CreatePoolAndAddLiquidityRowResult> {
    // If the coin types are not sorted, swap them and swap the metadata.
    // You can refer to the documentation for the specific sorting rules. ## How to determine coin_type_a and coin_type_b ?
    // https://cetus-1.gitbook.io/cetus-developer-docs/developer/via-sdk/features-available/create-clmm-pool
    if (isSortedSymbols(normalizeSuiAddress(params.coin_type_a), normalizeSuiAddress(params.coin_type_b))) {
      const swap_coin_type_b = params.coin_type_b
      params.coin_type_b = params.coin_type_a
      params.coin_type_a = swap_coin_type_b
      const metadata_b = params.metadata_b
      params.metadata_b = params.metadata_a
      params.metadata_a = metadata_b
    }
    return await this.createPoolAndAddLiquidityRow(params, tx)
  }

  /**
   * Gets the ClmmConfig object for the given package object ID.
   * @param {boolean} force_refresh Whether to force a refresh of the cache.
   * @returns the ClmmConfig object.
   */
  async getClmmConfigs(force_refresh = false): Promise<ClmmConfig> {
    const { package_id } = this._sdk.sdkOptions.clmm_pool
    const cacheKey = `${package_id}_getInitEvent`
    const cacheData = this._sdk.getCache<ClmmConfig>(cacheKey, force_refresh)
    if (cacheData !== undefined) {
      return cacheData
    }
    const packageObject = await this._sdk.FullClient.getObject({
      id: package_id,
      options: { showPreviousTransaction: true },
    })

    const previousTx = getObjectPreviousTransactionDigest(packageObject) as string

    const objects = (await this._sdk.FullClient.queryEventsByPage({ Transaction: previousTx })).data

    const clmmConfig: ClmmConfig = {
      pools_id: '',
      global_config_id: '',
      global_vault_id: '',
      admin_cap_id: '',
    }

    if (objects.length > 0) {
      objects.forEach((item: any) => {
        const fields = item.parsedJson as any

        if (item.type) {
          switch (extractStructTagFromType(item.type).full_address) {
            case `${package_id}::config::InitConfigEvent`:
              clmmConfig.global_config_id = fields.global_config_id
              clmmConfig.admin_cap_id = fields.admin_cap_id
              break
            case `${package_id}::factory::InitFactoryEvent`:
              clmmConfig.pools_id = fields.pools_id
              break
            case `${package_id}::rewarder::RewarderInitEvent`:
              clmmConfig.global_vault_id = fields.global_vault_id
              break
            case `${package_id}::partner::InitPartnerEvent`:
              clmmConfig.partners_id = fields.partners_id
              break
            default:
              break
          }
        }
      })
      this._sdk.updateCache(cacheKey, clmmConfig, CACHE_TIME_24H)
      return clmmConfig
    }

    return clmmConfig
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
      client = createFullClient(new SuiClient({ url: full_rpc_url }))
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
    do {
      const res = await client.queryTransactionBlocksByPage({ ChangedObject: pool_id }, { ...query, limit: 50 }, order)
      res.data.forEach((item, index) => {
        data.next_cursor = res.next_cursor
        const dataList = buildPoolTransactionInfo(item, index, sdkOptions.clmm_pool.package_id, pool_id)
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

  async calculateCreatePoolWithPrice(params: CalculateCreatePoolWithPriceParams): Promise<CalculateCreatePoolResult> {
    const { current_price, slippage, tick_spacing, add_mode_params, price_base_coin, coin_decimals_a, coin_decimals_b } = params

    const current_sqrt_price = TickMath.priceToSqrtPriceX64(
      price_base_coin === 'coin_a' ? d(current_price) : d(1).div(current_price),
      coin_decimals_a,
      coin_decimals_b
    )

    let tick_lower = 0
    let tick_upper = 0

    if (add_mode_params.is_full_range) {
      tick_lower = TickUtil.getMinIndex(tick_spacing)
      tick_upper = TickUtil.getMaxIndex(tick_spacing)
    } else {
      const { min_price, max_price } = add_mode_params
      tick_lower = TickMath.priceToInitializeTickIndex(
        price_base_coin === 'coin_a' ? d(min_price) : d(1).div(max_price),
        coin_decimals_a,
        coin_decimals_b,
        tick_spacing
      )
      tick_upper = TickMath.priceToInitializeTickIndex(
        price_base_coin === 'coin_a' ? d(max_price) : d(1).div(min_price),
        coin_decimals_a,
        coin_decimals_b,
        tick_spacing
      )
    }

    const { coin_amount, fix_amount_a } = params
    const { coin_amount_limit_a, coin_amount_limit_b, liquidity_amount, coin_amount_a, coin_amount_b } =
      ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
        tick_lower,
        tick_upper,
        new BN(coin_amount),
        fix_amount_a,
        true,
        slippage,
        current_sqrt_price
      )

    return {
      coin_amount_a,
      coin_amount_b,
      coin_amount_limit_a,
      coin_amount_limit_b,
      liquidity: liquidity_amount,
      initialize_sqrt_price: current_sqrt_price.toString(),
      tick_lower,
      tick_upper,
      fix_amount_a,
    }
  }

  /**
   * Create pool and add liquidity internal. It will call `pool_creator_v2::create_pool_v2` function in cetus integrate contract.
   * It encapsulates the original create_pool_v2 method from the Cetus CLMM and processes the additional outputs for position and coin within a single move call.
   * @param {CreatePoolAddLiquidityParams}params The parameters for the create and liquidity.
   * @returns {Promise<Transaction>} A promise that resolves to the transaction payload.
   */
  private async createPoolAndAddLiquidity(params: CreatePoolAddLiquidityParams, tx?: Transaction): Promise<Transaction> {
    tx = tx || new Transaction()
    tx.setSender(this.sdk.getSenderAddress())
    const { integrate, clmm_pool } = this.sdk.sdkOptions
    const eventConfig = getPackagerConfigs(clmm_pool)
    const globalPauseStatusObjectId = eventConfig.global_config_id
    const poolsId = eventConfig.pools_id

    const allCoinAsset = await this._sdk.FullClient.getOwnerCoinAssets(this.sdk.getSenderAddress())
    const primaryCoinAInputsR = CoinAssist.buildCoinForAmount(tx, allCoinAsset, BigInt(params.amount_a), params.coin_type_a, false, true)
    const primaryCoinBInputsR = CoinAssist.buildCoinForAmount(tx, allCoinAsset, BigInt(params.amount_b), params.coin_type_b, false, true)

    const args = [
      tx.object(globalPauseStatusObjectId),
      tx.object(poolsId),
      tx.pure.u32(params.tick_spacing),
      tx.pure.u128(params.initialize_sqrt_price),
      tx.pure.string(params.uri),
      tx.pure.u32(Number(asUintN(BigInt(params.tick_lower)).toString())),
      tx.pure.u32(Number(asUintN(BigInt(params.tick_upper)).toString())),
      primaryCoinAInputsR.target_coin,
      primaryCoinBInputsR.target_coin,
      tx.object(params.metadata_a),
      tx.object(params.metadata_b),
      tx.pure.bool(params.fix_amount_a),
      tx.object(CLOCK_ADDRESS),
    ]
    tx.moveCall({
      target: `${integrate.published_at}::pool_creator_v2::create_pool_v2`,
      typeArguments: [params.coin_type_a, params.coin_type_b],
      arguments: args,
    })
    buildTransferCoinToSender(this._sdk, tx, primaryCoinAInputsR.target_coin, params.coin_type_a)
    buildTransferCoinToSender(this._sdk, tx, primaryCoinBInputsR.target_coin, params.coin_type_b)

    return tx
  }

  /**
   * Create pool and add liquidity row. It will call `pool_creator_v2::create_pool_v2` function.
   * This method will return the position, coin_a, coin_b. User can use these to build own transaction.
   * @param {CreatePoolAddLiquidityParams}params The parameters for the create and liquidity.
   * @returns {Promise<Transaction>} A promise that resolves to the transaction payload.
   */
  private async createPoolAndAddLiquidityRow(
    params: CreatePoolAddLiquidityParams,
    tx?: Transaction
  ): Promise<CreatePoolAndAddLiquidityRowResult> {
    tx = tx || new Transaction()
    const { clmm_pool } = this.sdk.sdkOptions
    const eventConfig = getPackagerConfigs(clmm_pool)
    const globalPauseStatusObjectId = eventConfig.global_config_id
    const poolsId = eventConfig.pools_id
    const allCoinAsset = await this._sdk.FullClient.getOwnerCoinAssets(this.sdk.getSenderAddress())
    const primaryCoinAInputsR = CoinAssist.buildCoinForAmount(tx, allCoinAsset, BigInt(params.amount_a), params.coin_type_a, false, true)
    const primaryCoinBInputsR = CoinAssist.buildCoinForAmount(tx, allCoinAsset, BigInt(params.amount_b), params.coin_type_b, false, true)

    const args = [
      tx.object(globalPauseStatusObjectId),
      tx.object(poolsId),
      tx.pure.u32(params.tick_spacing),
      tx.pure.u128(params.initialize_sqrt_price),
      tx.pure.string(params.uri),
      tx.pure.u32(Number(asUintN(BigInt(params.tick_lower)).toString())),
      tx.pure.u32(Number(asUintN(BigInt(params.tick_upper)).toString())),
      primaryCoinAInputsR.target_coin,
      primaryCoinBInputsR.target_coin,
      tx.object(params.metadata_a),
      tx.object(params.metadata_b),
      tx.pure.bool(params.fix_amount_a),
      tx.object(CLOCK_ADDRESS),
    ]
    const res: TransactionObjectArgument[] = tx.moveCall({
      target: `${clmm_pool.published_at}::pool_creator::create_pool_v2`,
      typeArguments: [params.coin_type_a, params.coin_type_b],
      arguments: args,
    })

    return {
      tx,
      pos_id: res[0],
      remain_coin_a: res[1],
      remain_coin_b: res[2],
      remain_coin_type_a: params.coin_type_a,
      remain_coin_type_b: params.coin_type_b,
    }
  }

  public async createPoolWithPriceReturnPositionPayload(
    params: CreatePoolAddLiquidityWithPriceParams,
    tx?: Transaction
  ): Promise<CreatePoolAndAddLiquidityRowResult> {
    const { coin_type_a, coin_type_b, tick_spacing, uri, calculate_result } = params
    const {
      initialize_sqrt_price,
      tick_lower,
      tick_upper,
      liquidity,
      coin_amount_a,
      coin_amount_b,
      fix_amount_a,
      coin_amount_limit_a,
      coin_amount_limit_b,
    } = calculate_result

    const coinMetadataA = await this._sdk.FullClient.fetchCoinMetadata(coin_type_a)
    const coinMetadataB = await this._sdk.FullClient.fetchCoinMetadata(coin_type_b)

    if (coinMetadataA === null) {
      return handleMessageError(PoolErrorCode.FetchError, `fetch coin ${coin_type_a} metadata failed`, {
        [DETAILS_KEYS.METHOD_NAME]: 'createPoolAndAddLiquidityWithPrice',
        [DETAILS_KEYS.REQUEST_PARAMS]: params,
      })
    }

    if (coinMetadataB === null) {
      return handleMessageError(PoolErrorCode.FetchError, `fetch coin ${coin_type_b} metadata failed`, {
        [DETAILS_KEYS.METHOD_NAME]: 'createPoolAndAddLiquidityWithPrice',
        [DETAILS_KEYS.REQUEST_PARAMS]: params,
      })
    }

    let metadata_a = coinMetadataA.id!
    let metadata_b = coinMetadataB.id!

    return this.createPoolRowPayload(
      {
        tick_spacing,
        initialize_sqrt_price,
        uri: uri || '',
        coin_type_a: coin_type_a,
        coin_type_b: coin_type_b,
        amount_a: fix_amount_a ? coin_amount_a : coin_amount_limit_a,
        amount_b: fix_amount_a ? coin_amount_limit_b : coin_amount_b,
        fix_amount_a: fix_amount_a,
        tick_lower: tick_lower,
        tick_upper: tick_upper,
        metadata_a: metadata_a,
        metadata_b: metadata_b,
      },
      tx
    )
  }

  public async createPoolWithPricePayload(params: CreatePoolAddLiquidityWithPriceParams): Promise<Transaction> {
    const { coin_type_a, coin_type_b, tick_spacing, uri, calculate_result } = params
    const {
      initialize_sqrt_price,
      tick_lower,
      tick_upper,
      liquidity,
      coin_amount_a,
      coin_amount_b,
      fix_amount_a,
      coin_amount_limit_a,
      coin_amount_limit_b,
    } = calculate_result

    const coinMetadataA = await this._sdk.FullClient.fetchCoinMetadata(coin_type_a)
    const coinMetadataB = await this._sdk.FullClient.fetchCoinMetadata(coin_type_b)

    if (coinMetadataA === null) {
      return handleMessageError(PoolErrorCode.FetchError, `fetch coin ${coin_type_a} metadata failed`, {
        [DETAILS_KEYS.METHOD_NAME]: 'createPoolAndAddLiquidityWithPrice',
        [DETAILS_KEYS.REQUEST_PARAMS]: params,
      })
    }

    if (coinMetadataB === null) {
      return handleMessageError(PoolErrorCode.FetchError, `fetch coin ${coin_type_b} metadata failed`, {
        [DETAILS_KEYS.METHOD_NAME]: 'createPoolAndAddLiquidityWithPrice',
        [DETAILS_KEYS.REQUEST_PARAMS]: params,
      })
    }

    let metadata_a = coinMetadataA.id!
    let metadata_b = coinMetadataB.id!

    return this.createPoolPayload({
      tick_spacing,
      initialize_sqrt_price,
      uri: uri || '',
      coin_type_a: coin_type_a,
      coin_type_b: coin_type_b,
      amount_a: fix_amount_a ? coin_amount_a : coin_amount_limit_a,
      amount_b: fix_amount_a ? coin_amount_limit_b : coin_amount_b,
      fix_amount_a: fix_amount_a,
      tick_lower: tick_lower,
      tick_upper: tick_upper,
      metadata_a: metadata_a,
      metadata_b: metadata_b,
    })
  }

  /**
   * Fetches ticks from the exchange.
   * @param {FetchParams} params The parameters for the fetch.
   * @returns {Promise<TickData[]>} A promise that resolves to an array of tick data.
   */
  async fetchTicks(params: FetchParams): Promise<TickData[]> {
    let ticks: TickData[] = []
    let start: number[] = []
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
      start = [Number(asUintN(BigInt(data[data.length - 1].index)))]
    }
    return ticks
  }

  /**
   * Fetches ticks from the exchange using the simulation exec tx.
   * @param {GetTickParams} params The parameters for the fetch.
   * @returns {Promise<TickData[]>} A promise that resolves to an array of tick data.
   */
  private async getTicks(params: GetTickParams): Promise<TickData[]> {
    const { integrate } = this.sdk.sdkOptions
    const ticks: TickData[] = []
    const typeArguments = [params.coin_type_a, params.coin_type_b]

    const tx = new Transaction()

    const start = tx.makeMoveVec({
      elements: params.start.map((index) => tx.pure.u32(index)),
      type: 'u32',
    })

    const args = [tx.object(params.pool_id), start, tx.pure.u64(params.limit.toString())]

    tx.moveCall({
      target: `${integrate.published_at}::${ClmmFetcherModule}::fetch_ticks`,
      arguments: args,
      typeArguments,
    })

    const simulateRes = await this.sdk.FullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: normalizeSuiAddress('0x0'),
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

    simulateRes.events?.forEach((item: any) => {
      if (extractStructTagFromType(item.type).name === `FetchTicksResultEvent`) {
        item.parsedJson.ticks.forEach((tick: any) => {
          ticks.push(buildTickDataByEvent(tick))
        })
      }
    })
    return ticks
  }

  /**
   * Fetches a list of position rewards from the exchange.
   * @param {FetchParams} params The parameters for the fetch.
   * @returns {Promise<PositionReward[]>} A promise that resolves to an array of position rewards.
   */
  async fetchPoolPositionInfoList(params: FetchParams): Promise<PositionInfo[]> {
    const { integrate } = this.sdk.sdkOptions
    const allPosition: PositionInfo[] = []
    let start: SuiObjectIdType[] = []
    const limit = 512

    while (true) {
      const typeArguments = [params.coin_type_a, params.coin_type_b]

      const tx = new Transaction()

      const vecStart = tx.pure.vector(
        'id',
        start.map((id) => id)
      )

      const args = [tx.object(params.pool_id), vecStart, tx.pure.u64(limit)]

      tx.moveCall({
        target: `${integrate.published_at}::${ClmmFetcherModule}::fetch_positions`,
        arguments: args,
        typeArguments,
      })

      const simulateRes = await this.sdk.FullClient.devInspectTransactionBlock({
        transactionBlock: tx,
        sender: normalizeSuiAddress('0x0'),
      })

      if (simulateRes.error != null) {
        handleMessageError(
          PositionErrorCode.InvalidPositionRewardObject,
          `fetch position info error code: ${simulateRes.error ?? 'unknown error'}, please check config and tick object ids`,
          {
            [DETAILS_KEYS.METHOD_NAME]: 'fetchPoolPositionInfoList',
            [DETAILS_KEYS.REQUEST_PARAMS]: params,
          }
        )
      }

      const positionInfos: PositionInfo[] = []
      simulateRes?.events?.forEach((item: any) => {
        if (extractStructTagFromType(item.type).name === `FetchPositionsEvent`) {
          item.parsedJson.positions.forEach((item: any) => {
            const positionReward = buildPositionInfo(item)
            positionInfos.push(positionReward)
          })
        }
      })

      allPosition.push(...positionInfos)

      if (positionInfos.length < limit) {
        break
      } else {
        start = [positionInfos[positionInfos.length - 1].pos_object_id]
      }
    }

    return allPosition
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
      const idRes: DynamicFieldPage = await this.sdk.FullClient.getDynamicFields({
        parentId: tick_handle,
        cursor: nextCursor,
        limit,
      })
      nextCursor = idRes.nextCursor
      idRes.data.forEach((item) => {
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
    const objectDataResponses = await this.sdk.FullClient.batchGetObjects(tick_object_id, { showContent: true, showType: true })
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

      const tick = buildTickData(suiObj)
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
    const res = await this.sdk.FullClient.getObject({
      id: tick_id,
      options: { showContent: true },
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

  /**
   * Get partner ref fee amount
   * @param {string}partner Partner object id
   * @returns {Promise<CoinAsset[]>} A promise that resolves to an array of coin asset.
   */
  async getPartnerRefFeeAmount(partner: string, show_display = true): Promise<CoinAsset[]> {
    const objectDataResponses: any = await this._sdk.FullClient.batchGetObjects([partner], {
      showOwner: true,
      showContent: true,
      showDisplay: show_display,
      showType: true,
    })

    if (objectDataResponses[0].data?.content?.dataType !== 'moveObject') {
      handleMessageError(
        PartnerErrorCode.NotFoundPartnerObject,
        `get partner by object id: ${partner} error: ${objectDataResponses[0].error}`,
        {
          [DETAILS_KEYS.METHOD_NAME]: 'getPartnerRefFeeAmount',
        }
      )
    }

    const balance = (objectDataResponses[0].data.content.fields as any).balances

    const objects = await this._sdk.FullClient.getDynamicFieldsByPage(balance.fields.id.id)

    const coins: string[] = []
    objects.data.forEach((object) => {
      if (object.objectId != null) {
        coins.push(object.objectId)
      }
    })

    const refFee: CoinAsset[] = []
    const object = await this._sdk.FullClient.batchGetObjects(coins, {
      showOwner: true,
      showContent: true,
      showDisplay: show_display,
      showType: true,
    })
    object.forEach((info: any) => {
      if (info.error != null || info.data?.content?.dataType !== 'moveObject') {
        handleMessageError(
          PartnerErrorCode.InvalidPartnerRefFeeFields,
          `get coin by object id: ${info.data.objectId} error: ${info.error}`,
          {
            [DETAILS_KEYS.METHOD_NAME]: 'getPartnerRefFeeAmount',
          }
        )
      }

      const coinAsset: CoinAsset = {
        coin_type: info.data.content.fields.name,
        coin_object_id: info.data.objectId,
        balance: BigInt(info.data.content.fields.value),
      }
      refFee.push(coinAsset)
    })

    return refFee
  }

  /**
   * Claim partner ref fee.
   * @param {string} partner_cap partner cap id.
   * @param {string} partner partner id.
   * @param {string} coin_type coin type.
   * @returns {Promise<Transaction>} A promise that resolves to the transaction payload.
   */
  async claimPartnerRefFeePayload(partner_cap: string, partner: string, coin_type: string): Promise<Transaction> {
    const tx = new Transaction()
    const { clmm_pool } = this.sdk.sdkOptions
    const { global_config_id } = getPackagerConfigs(clmm_pool)
    const typeArguments = [coin_type]

    const args = [tx.object(global_config_id), tx.object(partner_cap), tx.object(partner)]

    tx.moveCall({
      target: `${clmm_pool.published_at}::${ClmmPartnerModule}::claim_ref_fee`,
      arguments: args,
      typeArguments,
    })

    return tx
  }

  async getPoolStatus(poolId: string): Promise<PoolStatus | undefined> {
    try {
      const res: any = await this._sdk.FullClient.getDynamicFieldObject({
        parentId: poolId,
        name: {
          type: '0x1::string::String',
          value: 'pool_status',
        },
      })

      const fields = getObjectFields(res)
      const status = fields.position.fields.status
      if (status) {
        return status as PoolStatus
      }
    } catch (error) {
      console.log('🚀 ~ file: poolModule.ts:1093 ~ PoolModule ~ getPoolStatus ~ error:', error)
    }
    return undefined
  }
}
