// @ts-nocheck
import { DevInspectResults, SuiJsonRpcClient } from '@mysten/sui/jsonRpc'
import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions'
import { normalizeSuiAddress } from '@mysten/sui/utils'
import type { DataPage, PaginationArgs, SuiObjectIdType } from '@cetusprotocol/common-sdk'
import {
  asUintN,
  CLOCK_ADDRESS,
  CoinAssist,
  DETAILS_KEYS,
  extractStructTagFromType,
  getObjectFields,
  getPackagerConfigs,
  IModule,
  createFullClient,
  deriveDynamicFieldIdByType,
} from '@cetusprotocol/common-sdk'
import { handleError, handleMessageError, PoolErrorCode, PositionErrorCode } from '../errors/errors'
import type { CetusClmmV2SDK } from '../sdk'
import type {
  AddLiquidityFixCoinOptions,
  ClosePositionOptions,
  CollectFeeOptions,
  CollectFeesQuote,
  GetPositionInfoListParams,
  OpenPositionOptions,
  Position,
  PositionInfo,
  PositionTransactionInfo,
  RemoveLiquidityOptions,
} from '../types'
import { buildPosition, buildPositionInfo, buildPositionTransactionInfo } from '../utils'
/**
 * Helper class to help interact with clmm position with a position router interface.
 */
export class PositionModule implements IModule<CetusClmmV2SDK> {
  protected _sdk: CetusClmmV2SDK

  constructor(sdk: CetusClmmV2SDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  /**
   * Builds the full address of the Position type.
   * @returns The full address of the Position type.
   */
  buildPositionType() {
    const cetusClmm = this._sdk.sdkOptions.clmm_pool.package_id
    return `${cetusClmm}::position::Position`
  }

  /**
   * Gets a list of position transaction information for the given position ID.
   * @param {Object} params - The parameters for the position transaction list.
   * @param {string} params.pos_id - The ID of the position to get transactions for.
   * @param {PaginationArgs} [params.pagination_args] - The pagination arguments for the transaction list.
   * @param {string} [params.order] - The order of the transaction list.
   * @param {string} [params.full_rpc_url] - The full RPC URL for the transaction list.
   * @param {string} [params.origin_pos_id] - The origin position ID for the transaction list.
   * @returns {Promise<DataPage<PositionTransactionInfo>>} A promise that resolves to a DataPage object containing the position transaction information.
   */
  async getPositionTransactionList({
    pos_id,
    origin_pos_id,
    full_rpc_url,
    pagination_args = 'all',
    order = 'ascending',
  }: {
    pos_id: string
    origin_pos_id?: string
    full_rpc_url?: string
    pagination_args?: PaginationArgs
    order?: 'ascending' | 'descending' | null | undefined
  }): Promise<DataPage<PositionTransactionInfo>> {
    const { FullClient: fullClient } = this._sdk
    const filterIds: string[] = [pos_id]
    if (origin_pos_id) {
      filterIds.push(origin_pos_id)
    }
    let client
    if (full_rpc_url) {
      client = createFullClient(new SuiJsonRpcClient({ url: full_rpc_url, network: this._sdk.sdkOptions.env === 'testnet' ? 'testnet' : 'mainnet' }))
    } else {
      client = fullClient
    }
    const data: DataPage<PositionTransactionInfo> = {
      data: [],
      has_next_page: false,
    }
    try {
      const res = await client.queryTransactionBlocksByPage({ ChangedObject: pos_id }, pagination_args, order)

      res.data.forEach((item, index) => {
        const dataList = buildPositionTransactionInfo(item, index, filterIds)
        data.data = [...data.data, ...dataList]
      })
      data.has_next_page = res.has_next_page
      data.next_cursor = res.next_cursor
      return data
    } catch (error) {
      handleError(PoolErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getPositionTransactionList',
      })
    }

    return data
  }

  /**
   * Gets a list of positions for the given account address.
   * @param account_address The account address to get positions for.
   * @param assign_pool_ids An array of pool ID to filter the positions by.
   * @returns array of Position objects.
   */
  async getPositionList(account_address: string, assign_pool_ids: string[] = [], show_display = true): Promise<Position[]> {
    const all_position: Position[] = []

    const owner_res: any = await this._sdk.FullClient.getOwnedObjectsByPage(account_address, {
      options: { showType: true, showContent: true, showDisplay: show_display, showOwner: true },
      filter: { Package: this._sdk.sdkOptions.clmm_pool.package_id },
    })

    const has_assign_pool_ids = assign_pool_ids.length > 0
    for (const item of owner_res.data as any[]) {
      const type = extractStructTagFromType(item.data.type)

      if (type.full_address === this.buildPositionType()) {
        const position = buildPosition(item)
        const cache_key = `${position.pos_object_id}_getPositionList`
        this._sdk.updateCache(cache_key, position)
        if (has_assign_pool_ids) {
          if (assign_pool_ids.includes(position.pool)) {
            all_position.push(position)
          }
        } else {
          all_position.push(position)
        }
      }
    }

    return all_position
  }

  /**
   * Gets a position by its handle and ID. But it needs pool info, so it is not recommended to use this method.
   * if you want to get a position, you can use getPositionById method directly.
   * @param {string} position_handle The handle of the position to get.
   * @param {string} position_id The ID of the position to get.
   * @param {boolean} calculate_rewarder Whether to calculate the rewarder of the position.
   * @returns {Promise<Position>} Position object.
   */
  async getPosition(position_handle: string, position_id: string, calculate_rewarder = true, show_display = true): Promise<Position> {
    let position = await this.getSimplePosition(position_id, show_display)
    if (calculate_rewarder) {
      position = await this.updatePositionInfo(position_handle, position)
    }
    return position
  }

  /**
   * Gets a position by its ID.
   * @param {string} position_id The ID of the position to get.
   * @param {boolean} calculate_rewarder Whether to calculate the rewarder of the position.
   * @param {boolean} show_display When some testnet rpc nodes can't return object's display data, you can set this option to false to avoid returning errors. Default is true.
   * @returns {Promise<Position>} Position object.
   */
  async getPositionById(position_id: string, calculate_rewarder = false, show_display = true): Promise<Position> {
    const position = await this.getSimplePosition(position_id, show_display)
    if (calculate_rewarder) {
      const pool = await this._sdk.Pool.getPool(position.pool, false)
      const result = await this.updatePositionInfo(pool.position_manager.position_handle.id, position)
      return result
    }
    return position
  }

  /**
   * Gets a simple position for the given position ID.
   * @param {string} position_id The ID of the position to get.
   * @returns {Promise<Position>} Position object.
   */
  async getSimplePosition(position_id: string, show_display = true): Promise<Position> {
    const cache_key = `${position_id}_getPositionList`

    let position = this.getSimplePositionByCache(position_id)

    if (position === undefined) {
      const object_data_responses = await this.sdk.FullClient.getObject({
        id: position_id,
        options: { showContent: true, showType: true, showDisplay: show_display, showOwner: true },
      })
      position = buildPosition(object_data_responses)

      this._sdk.updateCache(cache_key, position)
    }
    return position
  }

  /**
   * Gets a simple position for the given position ID.
   * @param {string} position_id Position object id
   * @returns {Position | undefined} Position object
   */
  private getSimplePositionByCache(position_id: string): Position | undefined {
    const cache_key = `${position_id}_getPositionList`
    return this._sdk.getCache<Position>(cache_key)
  }

  /**
   * Gets a list of simple positions for the given position ID.
   * @param {SuiObjectIdType[]} position_ids The IDs of the positions to get.
   * @returns {Promise<Position[]>} A promise that resolves to an array of Position objects.
   */
  async getSimplePositionList(position_ids: SuiObjectIdType[], show_display = true): Promise<Position[]> {
    const position_list: Position[] = []
    const not_found_ids: SuiObjectIdType[] = []

    position_ids.forEach((id) => {
      const position = this.getSimplePositionByCache(id)
      if (position) {
        position_list.push(position)
      } else {
        not_found_ids.push(id)
      }
    })

    if (not_found_ids.length > 0) {
      const object_data_responses = await this._sdk.FullClient.batchGetObjects(not_found_ids, {
        showOwner: true,
        showContent: true,
        showDisplay: show_display,
        showType: true,
      })

      object_data_responses.forEach((info) => {
        if (info.error == null) {
          const position = buildPosition(info)
          position_list.push(position)
          const cache_key = `${position.pos_object_id}_getPositionList`
          this._sdk.updateCache(cache_key, position)
        }
      })
    }

    return position_list
  }

  /**
   * Updates the position info
   * @param {string} position_handle Position handle
   * @param {Position} position Position object
   * @returns {Promise<Position>} A promise that resolves to an array of Position objects.
   */
  public async updatePositionInfo(position_handle: string, position: Position): Promise<Position> {
    const position_reward = await this.getPositionInfo(position_handle, position.pos_object_id)
    return {
      ...position,
      ...position_reward,
    }
  }

  /**
   * Gets the position info for the given position handle and position object ID.
   * @param {string} position_handle The handle of the position.
   * @param {string} position_id The ID of the position object.
   * @returns {Promise<PositionInfo>} PositionInfo object.
   */
  async getPositionInfo(position_handle: string, position_id: string): Promise<PositionInfo> {
    try {
      const dynamic_field_object = await this._sdk.FullClient.getDynamicFieldObject({
        parentId: position_handle,
        name: {
          type: '0x2::object::ID',
          value: position_id,
        },
      })

      const object_fields = getObjectFields(dynamic_field_object.data as any) as any
      const fields = object_fields.value.fields.value
      const position_info = buildPositionInfo(fields)
      return position_info
    } catch (error) {
      return handleError(PositionErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getPositionInfo',
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          position_handle,
          position_id,
        },
      })
    }
  }

  async getPositionInfoList(options: GetPositionInfoListParams[]): Promise<PositionInfo[]> {
    try {
      const position_info_list: PositionInfo[] = []
      const warpIds: string[] = []
      options.forEach(async (option) => {
        const { position_handle, position_ids } = option
        position_ids.forEach((value) => {
          const dynamic_field_id = deriveDynamicFieldIdByType(position_handle, value, '0x2::object::ID', 'address')
          warpIds.push(dynamic_field_id)
        })
      })

      if (warpIds.length === 0) {
        return []
      }
      const res = await this._sdk.FullClient.batchGetObjects(warpIds, {
        showContent: true,
        showType: true,
        showOwner: true,
      })

      res.forEach((item) => {
        try {
          const object_fields = getObjectFields(item.data as any) as any
          const fields = object_fields.value.fields.value
          const position_info = buildPositionInfo(fields)
          position_info_list.push(position_info)
        } catch (error) {
          console.log('getPositionInfoList error', error)
        }
      })
      return position_info_list
    } catch (error) {
      return handleError(PositionErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getPositionInfoList',
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          options,
        },
      })
    }
  }



  public async fetchPosFeeAmount(options: CollectFeeOptions[], tx?: Transaction): Promise<Record<string, CollectFeesQuote>> {
    tx = tx ? tx : new Transaction()

    for (const option of options) {
      this.collectFee(option, tx)
    }

    const simulateRes = await this.sdk.FullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: normalizeSuiAddress('0x0'),
    })

    if (simulateRes.error != null) {
      handleMessageError(
        PoolErrorCode.InvalidPoolObject,
        `fetch position fee error code: ${simulateRes.error ?? 'unknown error'}, please check config and position and pool object ids`,
        {
          [DETAILS_KEYS.METHOD_NAME]: 'fetchPosFeeAmount',
        }
      )
    }

    const parsedPosFeeData = this.parsedPosFeeData(simulateRes)

    return parsedPosFeeData
  }
  parsedPosFeeData(simulate_res: DevInspectResults): Record<string, CollectFeesQuote> {
    const feeData: Record<string, CollectFeesQuote> = {}
    const feeValueData: any[] = simulate_res.events?.filter((item: any) => {
      return item.type.includes('pool::CollectFeeEvent')
    })

    for (let i = 0; i < feeValueData.length; i += 1) {
      const { parsedJson } = feeValueData[i]
      const posObj = {
        position_id: parsedJson.position,
        fee_owned_a: parsedJson.amount_a,
        fee_owned_b: parsedJson.amount_b,
        pool_id: parsedJson.pool,
      }
      feeData[parsedJson.position] = posObj
    }

    return feeData
  }


  addLiquidityFixCoin(
    option: AddLiquidityFixCoinOptions,
    tx: Transaction,
    input_coin_a?: TransactionObjectArgument,
    input_coin_b?: TransactionObjectArgument
  ) {
    console.log('addLiquidityFixCoin:', option)
    const { pool_id, coin_type_a, coin_type_b, amount_a, amount_b, fix_amount_a, position } = option
    const { clmm_pool } = this.sdk.sdkOptions
    const { global_config_id, versioned_id } = getPackagerConfigs(clmm_pool)

    let pos_id: TransactionObjectArgument | string

    if ("position_id" in position) {
      const { position_id, collect_fee, rewarder_coin_types } = position
      pos_id = position_id
      if (collect_fee) {
        this.collectFee({
          pool_id: pool_id as string,
          position_id: position_id as string,
          coin_type_a,
          coin_type_b,
          recalculate: false,
        }, tx)
      }
      if (rewarder_coin_types.length > 0) {
        this.sdk.Rewarder.collectRewarder({
          pool_id: pool_id as string,
          position_id: position_id as string,
          coin_type_a,
          coin_type_b,
          rewarder_coin_types,
          recalculate: false,
        }, tx)
      }

    } else {
      const { tick_lower, tick_upper } = position
      pos_id = this.openPosition({
        pool_id: pool_id as string,
        coin_type_a,
        coin_type_b,
        tick_lower,
        tick_upper,
      }, tx)

    }

    const coin_a = input_coin_a ? input_coin_a : CoinAssist.buildCoinWithBalance(BigInt(amount_a), coin_type_a, tx)
    const coin_b = input_coin_b ? input_coin_b : CoinAssist.buildCoinWithBalance(BigInt(amount_b), coin_type_b, tx)

    tx.moveCall({
      target: `${clmm_pool.published_at}::pool::add_liquidity_fix_coin`,
      typeArguments: [coin_type_a, coin_type_b],
      arguments: [
        typeof pool_id === 'string' ? tx.object(pool_id) : pool_id,
        typeof pos_id === 'string' ? tx.object(pos_id) : pos_id,
        tx.pure.u64(fix_amount_a ? amount_a : amount_b),
        tx.pure.bool(fix_amount_a),
        coin_a,
        coin_b,
        tx.object(global_config_id),
        tx.object(versioned_id),
        tx.object(CLOCK_ADDRESS),
      ],
    })

    tx.transferObjects([coin_a, coin_b], this.sdk.getSenderAddress())

    if (typeof pos_id !== 'string') {
      tx.transferObjects([pos_id], this.sdk.getSenderAddress())
    }
  }


  checkCoinThreshold(coin_type: string, coin: TransactionObjectArgument, amount: string, tx: Transaction) {
    const { router } = this.sdk.sdkOptions
    tx.moveCall({
      target: `${router.published_at}::utils::check_coin_threshold`,
      typeArguments: [coin_type],
      arguments: [coin, tx.pure.u64(amount)],
    })
  }


  removeLiquidity(option: RemoveLiquidityOptions, tx: Transaction): undefined | { coin_a: TransactionObjectArgument; coin_b: TransactionObjectArgument } {
    const { clmm_pool } = this.sdk.sdkOptions
    const { close_position, pool_id, position_id, coin_type_a, coin_type_b, collect_fee, delta_liquidity, min_amount_a, min_amount_b, is_return_coins, rewarder_coin_types } = option

    const { global_config_id, versioned_id } = getPackagerConfigs(clmm_pool)


    const [balanceA, balanceB] = tx.moveCall({
      target: `${clmm_pool.published_at}::pool::remove_liquidity`,
      typeArguments: [coin_type_a, coin_type_b],
      arguments: [
        tx.object(pool_id),
        tx.object(position_id),
        tx.pure.u128(delta_liquidity),
        tx.pure.u64(min_amount_a),
        tx.pure.u64(min_amount_b),
        tx.object(global_config_id),
        tx.object(versioned_id),
        tx.object(CLOCK_ADDRESS),
      ],
    })


    const receiveCoinA = CoinAssist.fromBalance(balanceA, coin_type_a, tx)
    const receiveCoinB = CoinAssist.fromBalance(balanceB, coin_type_b, tx)

    this.checkCoinThreshold(coin_type_a, receiveCoinA, min_amount_a, tx)
    this.checkCoinThreshold(coin_type_b, receiveCoinB, min_amount_b, tx)

    if (rewarder_coin_types.length > 0) {
      this.sdk.Rewarder.collectRewarder({
        pool_id: pool_id as string,
        position_id: position_id as string,
        coin_type_a,
        coin_type_b,
        rewarder_coin_types,
        recalculate: false,
      }, tx)
    }

    if (collect_fee) {
      const { fee_a, fee_b } = this.collectFeeReturnCoins({
        pool_id,
        position_id,
        coin_type_a,
        coin_type_b,
        recalculate: false,
      }, tx)

      tx.mergeCoins(receiveCoinA, [fee_a])
      tx.mergeCoins(receiveCoinB, [fee_b])
    }


    if (close_position) {
      this.closePosition({
        pool_id,
        position_id,
        coin_type_a,
        coin_type_b,
      }, tx)
    }


    if (is_return_coins) {
      return {
        coin_a: receiveCoinA,
        coin_b: receiveCoinB,
      }
    }

    tx.transferObjects([receiveCoinA, receiveCoinB], this.sdk.getSenderAddress())

  }

  closePosition(option: ClosePositionOptions, tx: Transaction) {
    const { clmm_pool } = this.sdk.sdkOptions
    const { pool_id, position_id, coin_type_a, coin_type_b } = option
    const { global_config_id, versioned_id } = getPackagerConfigs(clmm_pool)

    const typeArguments = [coin_type_a, coin_type_b]

    tx.moveCall({
      target: `${clmm_pool.published_at}::pool::close_position`,
      typeArguments,
      arguments: [
        tx.object(pool_id),
        tx.object(position_id),
        tx.object(global_config_id),
        tx.object(versioned_id),
      ],
    })

    return tx
  }

  openPosition(option: OpenPositionOptions, tx: Transaction) {
    const { pool_id, coin_type_a, coin_type_b, tick_lower, tick_upper } = option
    const { clmm_pool } = this.sdk.sdkOptions
    const { global_config_id, versioned_id } = getPackagerConfigs(clmm_pool)

    const typeArguments = [coin_type_a, coin_type_b]
    const tick_lower_u = asUintN(BigInt(tick_lower)).toString()
    const tick_upper_u = asUintN(BigInt(tick_upper)).toString()
    const args = [
      tx.object(pool_id),
      tx.pure.u32(Number(tick_lower_u)),
      tx.pure.u32(Number(tick_upper_u)),
      tx.object(global_config_id),
      tx.object(versioned_id),
      tx.object(CLOCK_ADDRESS),
    ]

    const pos_id = tx.moveCall({
      target: `${clmm_pool.published_at}::pool::open_position`,
      typeArguments,
      arguments: args,
    })


    return pos_id
  }




  collectFeeReturnCoins(
    option: CollectFeeOptions,
    tx: Transaction,
  ) {
    const { pool_id, position_id, coin_type_a, coin_type_b, recalculate } = option
    const { clmm_pool } = this.sdk.sdkOptions

    const { global_config_id, versioned_id } = getPackagerConfigs(clmm_pool)
    const [fee_a, fee_b] = tx.moveCall({
      target: `${clmm_pool.published_at}::pool::collect_fee`,
      typeArguments: [coin_type_a, coin_type_b],
      arguments: [
        tx.object(pool_id),
        tx.object(position_id),
        tx.pure.bool(recalculate),
        tx.object(global_config_id),
        tx.object(versioned_id),
      ],
    })
    return {
      fee_a: CoinAssist.fromBalance(fee_a, coin_type_a, tx),
      fee_b: CoinAssist.fromBalance(fee_b, coin_type_b, tx),
    }
  }

  collectFee(
    option: CollectFeeOptions,
    tx: Transaction,
    receive_fee_a_id?: string,
    receive_fee_b_id?: string,
  ) {

    const { fee_a, fee_b } = this.collectFeeReturnCoins(option, tx)

    if (receive_fee_a_id) {
      tx.mergeCoins(receive_fee_a_id, [fee_a])
    } else {
      tx.transferObjects([fee_a], this.sdk.getSenderAddress())
    }

    if (receive_fee_b_id) {
      tx.mergeCoins(receive_fee_b_id, [fee_b])
    } else {
      tx.transferObjects([fee_b], this.sdk.getSenderAddress())
    }

  }
}
