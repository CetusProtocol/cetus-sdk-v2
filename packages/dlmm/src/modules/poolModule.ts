import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions'
import {
  asUintN,
  buildSuiGrpcClient,
  buildSuiJsonRpcClient,
  CLOCK_ADDRESS,
  CoinAssist,
  createFullClient,
  d,
  DataPage,
  deriveDynamicFieldIdByType,
  DETAILS_KEYS,
  fixCoinType,
  getPackagerConfigs,
  IModule,
  isSortedSymbols,
  PageQuery,
  PaginationArgs,
} from '@cetusprotocol/common-sdk'
import { DlmmErrorCode, handleError } from '../errors/errors'
import {
  BinUtils,
  buildPoolKey,
  NodeIDPoolSimpleInfo,
  parseBinInfo,
  parseBinInfoList,
  parseDlmmBasePool,
  parseDlmmPool,
  parsePoolTransactionInfo,
  SkipListNodeBinGroupRefRaw,
} from '../utils'
import { CetusDlmmSDK } from '../sdk'
import {
  BinAmount,
  BinLiquidityInfo,
  CalculateAddLiquidityOption,
  CreatePoolAndAddOption,
  CreatePoolAndAddWithPriceOption,
  CreatePoolOption,
  DlmmBasePool,
  DlmmConfigs,
  DlmmPool,
  FeeRate,
  GetBinInfoOption,
  GetBinInfoResult,
  GetPoolBinInfoOption,
  GetTotalFeeRateOption,
  OpenAndAddLiquidityOption,
  PoolTransactionInfo,
} from '../types/dlmm'
import { MAX_BIN_PER_POSITION } from '../types/constants'
import { SuiGrpcClient } from '@mysten/sui/grpc'
import { normalizeSuiAddress } from '@mysten/sui/utils'
import { bcs } from '@mysten/sui/bcs'
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc'

export class PoolModule implements IModule<CetusDlmmSDK> {
  protected _sdk: CetusDlmmSDK

  constructor(sdk: CetusDlmmSDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  async getPoolAddress(coin_type_a: string, coin_type_b: string, bin_step: number, base_factor: number): Promise<string | undefined> {
    try {
      const poolKey = buildPoolKey(coin_type_a, coin_type_b, bin_step, base_factor)
      const { dlmm_pool } = this._sdk.sdkOptions
      const { pools_id } = getPackagerConfigs(dlmm_pool)
      const res: any = await this._sdk.FullClient.getDynamicField({
        parentId: pools_id,
        name: {
          type: '0x2::object::ID',
          bcs: bcs.Address.serialize(poolKey).toBytes(),
        },
      })
      const poolSimpleInfo = NodeIDPoolSimpleInfo.parse(res.dynamicField.value.bcs)
      return poolSimpleInfo.value.pool_id
    } catch (error) {
      return handleError(DlmmErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getPoolAddress',
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          coin_type_a,
          coin_type_b,
          bin_step,
          base_factor,
        },
      })
    }

    return undefined
  }

  /**
   * Get the list of DLMM base pools
   * @param pagination_args - The pagination arguments
   * @returns The list of DLMM base pools
   */
  async getBasePoolList(pagination_args: PaginationArgs = 'all', force_refresh = false): Promise<DataPage<DlmmBasePool>> {
    const { dlmm_pool } = this._sdk.sdkOptions
    const dataPage: DataPage<DlmmBasePool> = {
      data: [],
      has_next_page: false,
    }

    const queryAll = pagination_args === 'all'
    const cacheAllKey = `${dlmm_pool.package_id}_getBasePoolList`
    if (queryAll) {
      const cacheDate = this._sdk.getCache<DlmmBasePool[]>(cacheAllKey, force_refresh)
      if (cacheDate && cacheDate.length > 0) {
        dataPage.data.push(...cacheDate)
        return dataPage
      }
    }

    try {
      const moveEventType = `${dlmm_pool.package_id}::registry::CreatePoolEvent`
      const res = await this._sdk.FullClient.queryEventsByPage({ MoveEventType: moveEventType }, pagination_args)
      dataPage.has_next_page = res.has_next_page
      dataPage.next_cursor = res.next_cursor
      res.data.forEach((object) => {
        const pool = parseDlmmBasePool(object)
        dataPage.data.push(pool)
      })

      if (queryAll) {
        this._sdk.updateCache(`${dlmm_pool.package_id}_getPoolImmutables`, dataPage.data)
      }
    } catch (error) {
      return handleError(DlmmErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getBasePoolList',
      })
    }

    return dataPage
  }

  /**
   * Get the list of DLMM pools
   * @param pagination_args - The pagination arguments
   * @returns The list of DLMM pools
   */
  async getPools(pagination_args: PaginationArgs = 'all', force_refresh = false): Promise<DataPage<DlmmPool>> {
    const dataPage: DataPage<DlmmPool> = {
      data: [],
      has_next_page: false,
    }

    const basePoolPage = await this.getBasePoolList(pagination_args, force_refresh)
    if (basePoolPage.data.length === 0) {
      return dataPage
    }

    try {
      const res = await this._sdk.FullClient.batchGetObjects(
        basePoolPage.data.map((item) => item.id),
        {
          json: true,
        }
      )
      dataPage.has_next_page = basePoolPage.has_next_page
      dataPage.next_cursor = basePoolPage.next_cursor
      for (const suiObj of res) {
        const pool = parseDlmmPool(suiObj)
        const cacheKey = `${pool.id}_getDlmmPool`
        this._sdk.updateCache(cacheKey, pool)
        dataPage.data.push(pool)
      }
    } catch (error) {
      return handleError(DlmmErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getPools',
      })
    }

    return dataPage
  }

  /**
   * Get the bin info by bin id
   * @param bin_manager_handle - The bin manager handle
   * @param bin_id - The bin id
   * @param bin_step - The bin step
   * @param force_refresh - Whether to force a refresh of the cache
   * @returns The bin info
   */
  async getBinInfo(bin_manager_handle: string, bin_id: number, bin_step: number, force_refresh = true): Promise<BinAmount> {
    try {
      const cacheKey = `${bin_manager_handle}_getBinInfo_${bin_id}`
      const cacheData = this._sdk.getCache<BinAmount>(cacheKey, force_refresh)
      if (cacheData !== undefined) {
        return cacheData
      }

      const score = BinUtils.binScore(bin_id)
      const [groupIndex, offsetInGroup] = BinUtils.resolveBinPosition(score)

      const res: any = await this._sdk.FullClient.getDynamicField({
        parentId: bin_manager_handle,
        name: { type: 'u64', bcs: bcs.u64().serialize(groupIndex).toBytes() },
      })
      const binGroupRef = SkipListNodeBinGroupRefRaw.parse(res.dynamicField.value.bcs)
      const fields = binGroupRef.value.group.bins[offsetInGroup]
      const bin_info = parseBinInfo(fields)
      this._sdk.updateCache(cacheKey, bin_info)
      return bin_info
    } catch (error) {
      return {
        bin_id,
        amount_a: '0',
        amount_b: '0',
        liquidity: '0',
        price_per_lamport: BinUtils.getPricePerLamportFromBinId(bin_id, bin_step),
      }
    }
  }

  async getBinInfoList(options: GetBinInfoOption[]): Promise<GetBinInfoResult[]> {
    const bin_info_list: GetBinInfoResult[] = []
    const warpOptions = options.map((option) => {
      const { bin_manager_handle, bin_id, bin_step } = option
      const score = BinUtils.binScore(bin_id)
      const [groupIndex, offsetInGroup] = BinUtils.resolveBinPosition(score)
      const dynamic_field_id = deriveDynamicFieldIdByType(bin_manager_handle, groupIndex, 'u64', 'u64')
      return {
        groupIndex,
        offsetInGroup,
        bin_id,
        bin_step,
        bin_manager_handle,
        dynamic_field_id,
      }
    })

    const res = await this._sdk.FullClient.batchGetObjects(
      warpOptions.map((option) => option.dynamic_field_id),
      {
        json: true,
      }
    )

    res.forEach((item: any, index: number) => {
      const { offsetInGroup, bin_manager_handle, bin_step, bin_id } = warpOptions[index]
      try {
        const fields = item.json
        const binFields = fields.value.value.group.bins[offsetInGroup]
        const bin_info = parseBinInfo(binFields)
        bin_info_list.push({
          ...bin_info,
          bin_manager_handle: bin_manager_handle,
          bin_step: bin_step,
        })
      } catch (error) {
        bin_info_list.push({
          bin_id,
          amount_a: '0',
          amount_b: '0',
          liquidity: '0',
          price_per_lamport: BinUtils.getPricePerLamportFromBinId(bin_id, bin_step),
          bin_manager_handle: bin_manager_handle,
          bin_step: bin_step,
        })
      }
    })

    return bin_info_list
  }

  async getTotalFeeRate(option: GetTotalFeeRateOption): Promise<FeeRate> {
    const { dlmm_pool } = this._sdk.sdkOptions
    const { pool_id, coin_type_a, coin_type_b } = option
    const tx: Transaction = new Transaction()
    tx.moveCall({
      target: `${dlmm_pool.published_at}::pool::get_total_fee_rate`,
      arguments: [tx.object(pool_id)],
      typeArguments: [coin_type_a, coin_type_b],
    })
    const res: any = await this._sdk.FullClient.sendSimulationTransaction(tx, normalizeSuiAddress('0x0'))
    const bcsFeeRate = bcs.struct('FeeRate', {
      base_fee_rate: bcs.u64(),
      var_fee_rate: bcs.u64(),
      total_fee_rate: bcs.u64(),
    })

    const feeRate = bcsFeeRate.parse(res.commandResults[0].returnValues[0].bcs)

    return feeRate
  }

  async getPoolBinInfo(option: GetPoolBinInfoOption): Promise<BinAmount[]> {
    const { dlmm_pool } = this._sdk.sdkOptions
    const { pool_id, coin_type_a, coin_type_b } = option
    const limit = 900
    const bin_infos: BinAmount[] = []
    let start_bin_id: number | undefined = undefined
    let hasNext = true
    while (hasNext) {
      const tx: Transaction = new Transaction()
      let start_bin
      if (start_bin_id !== undefined) {
        start_bin = tx.moveCall({
          target: `0x1::option::some`,
          arguments: [tx.pure.u32(Number(asUintN(BigInt(start_bin_id))))],
          typeArguments: ['u32'],
        })
      } else {
        start_bin = tx.moveCall({
          target: `0x1::option::none`,
          typeArguments: ['u32'],
        })
      }
      try {
        tx.moveCall({
          target: `${dlmm_pool.published_at}::pool::fetch_bins`,
          arguments: [tx.object(pool_id), start_bin, tx.pure.u64(limit)],
          typeArguments: [coin_type_a, coin_type_b],
        })
        const res: any = await this._sdk.FullClient.sendSimulationTransaction(tx, normalizeSuiAddress('0x0'))
        const list = parseBinInfoList(res.commandResults[1].returnValues[0].bcs)
        bin_infos.push(...list)
        start_bin_id = list.length > 0 ? list[list.length - 1].bin_id + 1 : undefined
        hasNext = list.length === limit
      } catch (error) {
        hasNext = false
      }

    }

    return bin_infos.sort((a, b) => a.bin_id - b.bin_id)
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
      client = createFullClient(buildSuiGrpcClient(full_rpc_url, this._sdk.sdkOptions.env!), fullClient._graphQLClient, this._sdk.sdkOptions.env, buildSuiJsonRpcClient(full_rpc_url, this._sdk.sdkOptions.env!))
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
      const res = await client.queryTransactionBlocksByPage(
        { affectedObject: pool_id },
        { ...query, limit: 50 },
        order
      )
      res.data.forEach((item, index) => {
        const dataList = parsePoolTransactionInfo(item as any, index, sdkOptions.dlmm_pool.package_id, pool_id)
        data.data = [...data.data, ...dataList]
      })
      data.has_next_page = res.has_next_page
      data.next_cursor = res.next_cursor
      query.cursor = res.next_cursor
    } while (data.data.length < user_limit && data.has_next_page)

    if (data.data.length > user_limit) {
      data.data = data.data.slice(0, user_limit)
      data.has_next_page = true
    }

    return data
  }

  /**
   * Get the bin info by range (TODO:  need to optimize this method)
   * @param bin_manager_handle - The bin manager handle
   * @param lower_bin_id - The lower bin id
   * @param upper_bin_id - The upper bin id
   * @param bin_step - The bin step
   * @returns The bin info by range
   */
  async getRangeBinInfo(bin_manager_handle: string, lower_bin_id: number, upper_bin_id: number, bin_step: number): Promise<BinAmount[]> {
    const bin_infos: BinAmount[] = []
    for (let bin_id = lower_bin_id; bin_id <= upper_bin_id; bin_id++) {
      const bin_info = await Promise.all([this.getBinInfo(bin_manager_handle, bin_id, bin_step)])
      bin_infos.push(...bin_info)
    }
    return bin_infos
  }

  /**
   * Get the list of DLMM pools by assign pool ids
   * @param assign_pool_ids - The assign pool ids
   * @returns The list of DLMM pools
   */
  async getAssignPoolList(assign_pool_ids: string[]): Promise<DlmmPool[]> {
    if (assign_pool_ids.length === 0) {
      return []
    }

    const allPool: DlmmPool[] = []

    try {
      const res = await this._sdk.FullClient.batchGetObjects(assign_pool_ids, {
        json: true,
      })
      for (const suiObj of res) {
        const pool = parseDlmmPool(suiObj)
        const cacheKey = `${pool.id}_getDlmmPool`
        this._sdk.updateCache(cacheKey, pool)
        allPool.push(pool)
      }
    } catch (error) {
      return handleError(DlmmErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getAssignPoolList',
      })
    }

    return allPool
  }

  /**
   * Get a DLMM pool by its object ID.
   * @param {string} pool_id The object ID of the pool to get.
   * @param {true} force_refresh Whether to force a refresh of the cache.
   * @returns {Promise<DlmmPool>} A promise that resolves to a DlmmPool object.
   */
  async getPool(pool_id: string, force_refresh = true): Promise<DlmmPool> {
    try {
      const cacheKey = `${pool_id}_getDlmmPool`
      const cacheData = this._sdk.getCache<DlmmPool>(cacheKey, force_refresh)
      if (cacheData !== undefined) {
        return cacheData
      }
      const suiObj = await this._sdk.FullClient.getObject({
        objectId: pool_id,
        include: {
          json: true,
        },
      })
      const pool = parseDlmmPool(suiObj.object)
      this._sdk.updateCache(cacheKey, pool)
      return pool
    } catch (error) {
      return handleError(DlmmErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getPool',
        [DETAILS_KEYS.REQUEST_PARAMS]: pool_id,
      })
    }
  }

  /**
   * Create a pool and add liquidity with a given price
   * @param option - The option for creating a pool and adding liquidity with a given price
   * @returns The transaction for creating a pool and adding liquidity with a given price
   */
  async createPoolAndAddWithPricePayload(option: CreatePoolAndAddWithPriceOption): Promise<Transaction> {
    const {
      bin_step,
      url,
      coin_type_a,
      coin_type_b,
      bin_infos,
      price_base_coin,
      price,
      lower_price,
      upper_price,
      decimals_a,
      decimals_b,
      strategy_type,
      use_bin_infos,
      base_factor,
      pool_id,
    } = option

    let lower_bin_id
    let upper_bin_id
    let active_id
    let new_bin_infos: BinLiquidityInfo = bin_infos

    const is_coin_a_base = price_base_coin === 'coin_a'

    if (is_coin_a_base) {
      lower_bin_id = BinUtils.getBinIdFromPrice(lower_price, bin_step, false, decimals_a, decimals_b)
      upper_bin_id = BinUtils.getBinIdFromPrice(upper_price, bin_step, true, decimals_a, decimals_b)
      active_id = BinUtils.getBinIdFromPrice(price, bin_step, true, decimals_a, decimals_b)
    } else {
      lower_bin_id = BinUtils.getBinIdFromPrice(d(1).div(upper_price).toString(), bin_step, false, decimals_a, decimals_b)
      upper_bin_id = BinUtils.getBinIdFromPrice(d(1).div(lower_price).toString(), bin_step, true, decimals_a, decimals_b)
      active_id = BinUtils.getBinIdFromPrice(d(1).div(price).toString(), bin_step, false, decimals_a, decimals_b)

      const calculateOption: CalculateAddLiquidityOption = {
        pool_id,
        amount_a: bin_infos.amount_b,
        amount_b: bin_infos.amount_a,
        active_id,
        bin_step,
        lower_bin_id,
        upper_bin_id,
        active_bin_of_pool: undefined,
        strategy_type: option.strategy_type,
      }

      new_bin_infos = await this.sdk.Position.calculateAddLiquidityInfo(calculateOption)
    }

    const createPoolAndAddOption: CreatePoolAndAddOption = {
      bin_step,
      url,
      coin_type_a,
      coin_type_b,
      bin_infos: new_bin_infos,
      lower_bin_id,
      upper_bin_id,
      active_id,
      strategy_type,
      use_bin_infos,
      base_factor,
    }

    return this.createPoolAndAddLiquidityPayload(createPoolAndAddOption)
  }

  /**
   * Create a pool
   * @param option - The option for creating a pool
   * @param tx - The transaction object
   * @returns The transaction object
   */
  createPoolPayload(option: CreatePoolOption, tx: Transaction): TransactionObjectArgument {
    const { dlmm_pool } = this._sdk.sdkOptions
    const { bin_step, base_factor, url, coin_type_a, coin_type_b, active_id } = option
    tx = tx || new Transaction()

    const { registry_id, global_config_id, versioned_id } = getPackagerConfigs(dlmm_pool)

    const [cert, pool_id] = tx.moveCall({
      target: `${dlmm_pool.published_at}::registry::create_pool_v3`,
      arguments: [
        tx.object(registry_id),
        tx.pure.u16(bin_step),
        tx.pure.u16(base_factor),
        tx.pure.u32(Number(asUintN(BigInt(active_id)))),
        tx.pure.string(url || ''),
        tx.object(global_config_id),
        tx.object(versioned_id),
        tx.object(CLOCK_ADDRESS),
      ],
      typeArguments: [coin_type_a, coin_type_b],
    })

    tx.moveCall({
      target: `${dlmm_pool.published_at}::registry::destroy_receipt`,
      arguments: [tx.object(cert), pool_id, tx.object(versioned_id)],
      typeArguments: [coin_type_a, coin_type_b],
    })

    return pool_id
  }

  /**
   * Create a pool and add liquidity
   * @param option - The option for creating a pool and adding liquidity
   * @returns The transaction for creating a pool and adding liquidity
   */
  createPoolAndAddLiquidityPayload(option: CreatePoolAndAddOption): Transaction {
    const {
      bin_step,
      base_factor,
      url,
      active_id,
      coin_type_a,
      coin_type_b,
      bin_infos,
      lower_bin_id,
      upper_bin_id,
      strategy_type,
      use_bin_infos,
    } = option

    const tx = new Transaction()

    if (isSortedSymbols(fixCoinType(coin_type_a, false), fixCoinType(coin_type_b, false))) {
      handleError(DlmmErrorCode.InvalidCoinTypeSequence, new Error('invalid coin type sequence'), {
        [DETAILS_KEYS.METHOD_NAME]: 'createPoolAndAddLiquidityPayload',
        [DETAILS_KEYS.REQUEST_PARAMS]: option,
      })
    }

    const width = upper_bin_id - lower_bin_id + 1
    if (width > MAX_BIN_PER_POSITION) {
      handleError(DlmmErrorCode.InvalidBinWidth, new Error('Width is too large'), {
        [DETAILS_KEYS.METHOD_NAME]: 'openPosition',
        [DETAILS_KEYS.REQUEST_PARAMS]: option,
      })
    }

    console.log('🚀 ~ createPoolAndAddLiquidityPayload ~ option:', {
      ...option,
      width,
    })

    // create pool
    const pool_id = this.createPoolPayload(
      {
        active_id,
        bin_step,
        base_factor,
        coin_type_a,
        coin_type_b,
      },
      tx
    )

    // add liquidity
    const addOption: OpenAndAddLiquidityOption = {
      pool_id,
      bin_infos,
      coin_type_a,
      coin_type_b,
      lower_bin_id,
      upper_bin_id,
      active_id,
      strategy_type,
      use_bin_infos,
      max_price_slippage: 0,
      bin_step,
    }
    this.sdk.Position.addLiquidityPayload(addOption, tx)

    return tx
  }
}
