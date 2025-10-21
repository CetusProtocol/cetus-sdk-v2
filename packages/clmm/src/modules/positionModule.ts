import { DevInspectResults, SuiClient } from '@mysten/sui/client'
import type { TransactionObjectArgument } from '@mysten/sui/transactions'
import { Transaction } from '@mysten/sui/transactions'
import { isValidSuiObjectId, normalizeSuiAddress } from '@mysten/sui/utils'
import BN from 'bn.js'
import type { BuildCoinResult, DataPage, PaginationArgs, SuiObjectIdType } from '@cetusprotocol/common-sdk'
import {
  asUintN,
  ClmmPoolUtil,
  CLOCK_ADDRESS,
  CoinAssist,
  d,
  DETAILS_KEYS,
  extractStructTagFromType,
  getObjectFields,
  getPackagerConfigs,
  IModule,
  FullClient,
  TickMath,
  TickUtil,
  createFullClient,
  deriveDynamicFieldIdByType,
} from '@cetusprotocol/common-sdk'
import Decimal from 'decimal.js'
import { handleError, handleMessageError, PoolErrorCode, PositionErrorCode } from '../errors/errors'
import type { CetusClmmSDK } from '../sdk'
import type {
  AddLiquidityFixTokenParams,
  AddLiquidityParams,
  AddLiquidityWithPriceRangeParams,
  CalculateAddLiquidityFixCoinWithPriceParams,
  CalculateAddLiquidityResult,
  CalculateAddLiquidityWithPriceParams,
  ClosePositionParams,
  CollectFeeParams,
  CollectFeesQuote,
  FetchPosFeeParams,
  GetPositionInfoListParams,
  OpenPositionParams,
  OpenPositionWithPriceParams,
  Position,
  PositionInfo,
  PositionTransactionInfo,
  RemoveLiquidityParams,
} from '../types'
import {
  ClmmFetcherModule,
  ClmmIntegratePoolModule,
  ClmmIntegratePoolV2Module,
  ClmmIntegratePoolV3Module,
  ClmmIntegrateRouterModule,
} from '../types/sui'
import { buildPosition, buildPositionInfo, buildPositionTransactionInfo } from '../utils'
import { findAdjustCoin, PositionUtils } from '../utils/positionUtils'
/**
 * Helper class to help interact with clmm position with a position router interface.
 */
export class PositionModule implements IModule<CetusClmmSDK> {
  protected _sdk: CetusClmmSDK

  constructor(sdk: CetusClmmSDK) {
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
      client = createFullClient(new SuiClient({ url: full_rpc_url }))
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
  async getPositionById(position_id: string, calculate_rewarder = true, show_display = true): Promise<Position> {
    const position = await this.getSimplePosition(position_id, show_display)
    if (calculate_rewarder) {
      const pool = await this._sdk.Pool.getPool(position.pool, false)
      const result = await this.updatePositionInfo(pool.position_manager.positions_handle, position)
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

  public buildFetchPosFee(params: FetchPosFeeParams, tx: Transaction) {
    const { clmm_pool, integrate } = this.sdk.sdkOptions
    const typeArguments = [params.coin_type_a, params.coin_type_b]
    const args = [tx.object(getPackagerConfigs(clmm_pool).global_config_id), tx.object(params.pool_id), tx.pure.address(params.position_id)]
    tx.moveCall({
      target: `${integrate.published_at}::${ClmmFetcherModule}::fetch_position_fees`,
      arguments: args,
      typeArguments,
    })
  }

  parsedPosFeeData(simulate_res: DevInspectResults) {
    const feeData: Record<string, { position_id: string; fee_owned_a: string; fee_owned_b: string }> = {}
    const feeValueData: any[] = simulate_res.events?.filter((item: any) => {
      return item.type.includes('fetcher_script::FetchPositionFeesEvent')
    })

    for (let i = 0; i < feeValueData.length; i += 1) {
      const { parsedJson } = feeValueData[i]
      const posObj = {
        position_id: parsedJson.position_id,
        fee_owned_a: parsedJson.fee_owned_a,
        fee_owned_b: parsedJson.fee_owned_b,
      }
      feeData[parsedJson.position_id] = posObj
    }

    return feeData
  }

  /**
   * Fetches the Position fee amount for a given list of addresses.
   * @param {FetchPosFeeParams[]} params  An array of FetchPosFeeParams objects containing the target addresses and their corresponding amounts.
   * @returns {Promise<CollectFeesQuote[]>} A Promise that resolves with the fetched position fee amount for the specified addresses.
   */
  public async fetchPosFeeAmount(params: FetchPosFeeParams[]): Promise<CollectFeesQuote[]> {
    const { clmm_pool, integrate } = this.sdk.sdkOptions
    const tx = new Transaction()

    for (const paramItem of params) {
      this.buildFetchPosFee(paramItem, tx)
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

    const result: CollectFeesQuote[] = []
    const parsedPosFeeData = this.parsedPosFeeData(simulateRes)
    for (let i = 0; i < params.length; i += 1) {
      const posFeeData = parsedPosFeeData[params[i].position_id]
      if (posFeeData) {
        const posFeeResult: CollectFeesQuote = {
          fee_owned_a: posFeeData.fee_owned_a,
          fee_owned_b: posFeeData.fee_owned_b,
          position_id: params[i].position_id,
        }
        result.push(posFeeResult)
      }
    }

    return result
  }

  /**
   * Fetches the Position fee amount for a given list of addresses.
   * @param position_ids An array of position object id.
   * @returns {Promise<Record<string, CollectFeesQuote>>} A Promise that resolves with the fetched position fee amount for the specified position object ids.
   */
  async batchFetchPositionFees(position_ids: string[]): Promise<Record<string, CollectFeesQuote>> {
    const pos_fee_params_list: FetchPosFeeParams[] = []
    for (const id of position_ids) {
      const position = await this._sdk.Position.getPositionById(id, false)
      const pool = await this._sdk.Pool.getPool(position.pool, false)
      pos_fee_params_list.push({
        pool_id: pool.id,
        position_id: position.pos_object_id,
        coin_type_a: pool.coin_type_a,
        coin_type_b: pool.coin_type_b,
      })
    }

    const positionMap: Record<string, CollectFeesQuote> = {}

    if (pos_fee_params_list.length > 0) {
      const result: CollectFeesQuote[] = await this.fetchPosFeeAmount(pos_fee_params_list)
      for (const pos_rewarder_info of result) {
        positionMap[pos_rewarder_info.position_id] = pos_rewarder_info
      }
      return positionMap
    }
    return positionMap
  }

  /**
   * create add liquidity transaction payload with fix token
   * @param {AddLiquidityFixTokenParams} params
   * @param gas_estimate_arg : When the fix input amount is SUI, gasEstimateArg can control whether to recalculate the number of SUI to prevent insufficient gas.
   * If this parameter is not passed, gas estimation is not performed
   * @returns {Promise<TransactionBlock>}
   */
  async createAddLiquidityFixTokenPayload(
    params: AddLiquidityFixTokenParams,
    gas_estimate_arg?: {
      slippage: number
      cur_sqrt_price: BN
    },
    tx?: Transaction,
    input_coin_a?: TransactionObjectArgument,
    input_coin_b?: TransactionObjectArgument
  ): Promise<Transaction> {
    const all_coin_asset = await this._sdk.FullClient.getOwnerCoinAssets(this.sdk.getSenderAddress())

    if (gas_estimate_arg) {
      const { is_adjust_coin_a, is_adjust_coin_b } = findAdjustCoin(params)
      params = params as AddLiquidityFixTokenParams
      if ((params.fix_amount_a && is_adjust_coin_a) || (!params.fix_amount_a && is_adjust_coin_b)) {
        tx = await PositionUtils.buildAddLiquidityFixTokenForGas(
          this._sdk,
          all_coin_asset,
          params,
          gas_estimate_arg,
          tx,
          input_coin_a,
          input_coin_b
        )
        return tx
      }
    }

    return PositionUtils.buildAddLiquidityFixToken(this._sdk, all_coin_asset, params, tx, input_coin_a, input_coin_b)
  }

  /**
   * create add liquidity transaction payload
   * @param {AddLiquidityParams} params
   * @returns {Promise<TransactionBlock>}
   */
  async createAddLiquidityPayload(
    params: AddLiquidityParams,
    tx?: Transaction,
    input_coin_a?: TransactionObjectArgument,
    input_coin_b?: TransactionObjectArgument
  ): Promise<Transaction> {
    const { integrate, clmm_pool } = this._sdk.sdkOptions

    const tick_lower = asUintN(BigInt(params.tick_lower)).toString()
    const tick_upper = asUintN(BigInt(params.tick_upper)).toString()

    const typeArguments = [params.coin_type_a, params.coin_type_b]

    tx = tx || new Transaction()

    const needOpenPosition = !isValidSuiObjectId(params.pos_id)
    const max_amount_a = BigInt(params.max_amount_a)
    const max_amount_b = BigInt(params.max_amount_b)

    let primary_coin_a_inputs: BuildCoinResult
    let primary_coin_b_inputs: BuildCoinResult
    if (input_coin_a == null || input_coin_b == null) {
      const all_coin_asset = await this._sdk.FullClient.getOwnerCoinAssets(this.sdk.getSenderAddress())
      primary_coin_a_inputs = CoinAssist.buildCoinForAmount(tx, all_coin_asset, max_amount_a, params.coin_type_a, false, true)
      primary_coin_b_inputs = CoinAssist.buildCoinForAmount(tx, all_coin_asset, max_amount_b, params.coin_type_b, false, true)
    } else {
      primary_coin_a_inputs = {
        target_coin: input_coin_a,
        remain_coins: [],
        is_mint_zero_coin: false,
        target_coin_amount: '0',
        selected_coins: [],
      }
      primary_coin_b_inputs = {
        target_coin: input_coin_b,
        remain_coins: [],
        is_mint_zero_coin: false,
        target_coin_amount: '0',
        selected_coins: [],
      }
    }

    if (needOpenPosition) {
      tx.moveCall({
        target: `${integrate.published_at}::${ClmmIntegratePoolV2Module}::open_position_with_liquidity`,
        typeArguments,
        arguments: [
          tx.object(getPackagerConfigs(clmm_pool).global_config_id),
          tx.object(params.pool_id),
          tx.pure.u32(Number(tick_lower)),
          tx.pure.u32(Number(tick_upper)),
          primary_coin_a_inputs.target_coin,
          primary_coin_b_inputs.target_coin,
          tx.pure.u64(params.max_amount_a),
          tx.pure.u64(params.max_amount_b),
          tx.pure.u128(params.delta_liquidity),
          tx.object(CLOCK_ADDRESS),
        ],
      })
    } else {
      const all_coin_asset = await this._sdk.FullClient.getOwnerCoinAssets(this._sdk.getSenderAddress())
      tx = PositionUtils.createCollectRewarderAndFeeParams(
        this._sdk,
        tx,
        params,
        all_coin_asset,
        primary_coin_a_inputs.remain_coins,
        primary_coin_b_inputs.remain_coins
      )
      tx.moveCall({
        target: `${integrate.published_at}::${ClmmIntegratePoolV2Module}::add_liquidity`,
        typeArguments,
        arguments: [
          tx.object(getPackagerConfigs(clmm_pool).global_config_id),
          tx.object(params.pool_id),
          tx.object(params.pos_id),
          primary_coin_a_inputs.target_coin,
          primary_coin_b_inputs.target_coin,
          tx.pure.u64(params.max_amount_a),
          tx.pure.u64(params.max_amount_b),
          tx.pure.u128(params.delta_liquidity),
          tx.object(CLOCK_ADDRESS),
        ],
      })
    }
    return tx
  }

  /**
   * Remove liquidity from a position.
   * @param {RemoveLiquidityParams} params
   * @returns {TransactionBlock}
   */
  async removeLiquidityPayload(params: RemoveLiquidityParams, tx?: Transaction): Promise<Transaction> {
    const { clmm_pool, integrate } = this.sdk.sdkOptions

    tx = tx || new Transaction()

    const typeArguments = [params.coin_type_a, params.coin_type_b]

    const allCoinAsset = await this._sdk.FullClient.getOwnerCoinAssets(this.sdk.getSenderAddress())

    tx = PositionUtils.createCollectRewarderAndFeeParams(this._sdk, tx, params, allCoinAsset)

    const args = [
      tx.object(getPackagerConfigs(clmm_pool).global_config_id),
      tx.object(params.pool_id),
      tx.object(params.pos_id),
      tx.pure.u128(params.delta_liquidity),
      tx.object(CLOCK_ADDRESS),
    ]

    const [balanceA, balanceB] = tx.moveCall({
      target: `${clmm_pool.published_at}::pool::remove_liquidity`,
      typeArguments,
      arguments: args,
    })

    const receiveCoinA = CoinAssist.fromBalance(balanceA, params.coin_type_a, tx)
    const receiveCoinB = CoinAssist.fromBalance(balanceB, params.coin_type_b, tx)

    tx.moveCall({
      target: `${integrate.published_at}::${ClmmIntegrateRouterModule}::check_coin_threshold`,
      typeArguments: [params.coin_type_a],
      arguments: [receiveCoinA, tx.pure.u64(params.min_amount_a)],
    })

    tx.moveCall({
      target: `${integrate.published_at}::${ClmmIntegrateRouterModule}::check_coin_threshold`,
      typeArguments: [params.coin_type_b],
      arguments: [receiveCoinB, tx.pure.u64(params.min_amount_b)],
    })

    tx.transferObjects([receiveCoinA, receiveCoinB], this.sdk.getSenderAddress())

    return tx
  }

  /**
   * Close position and remove all liquidity and collect_reward
   * @param {ClosePositionParams} params
   * @returns {TransactionBlock}
   */
  async closePositionPayload(params: ClosePositionParams, tx?: Transaction): Promise<Transaction> {
    const { clmm_pool, integrate } = this.sdk.sdkOptions

    tx = tx || new Transaction()

    const typeArguments = [params.coin_type_a, params.coin_type_b]

    const allCoinAsset = await this._sdk.FullClient.getOwnerCoinAssets(this.sdk.getSenderAddress())

    tx = PositionUtils.createCollectRewarderAndFeeParams(this._sdk, tx, params, allCoinAsset)

    tx.moveCall({
      target: `${integrate.published_at}::${ClmmIntegratePoolModule}::close_position`,
      typeArguments,
      arguments: [
        tx.object(getPackagerConfigs(clmm_pool).global_config_id),
        tx.object(params.pool_id),
        tx.object(params.pos_id),
        tx.pure.u64(params.min_amount_a),
        tx.pure.u64(params.min_amount_b),
        tx.object(CLOCK_ADDRESS),
      ],
    })

    return tx
  }

  /**
   * Open position in clmmpool.
   * @param {OpenPositionParams} params
   * @returns {TransactionBlock}
   */
  openPositionPayload(params: OpenPositionParams, tx?: Transaction): Transaction {
    const { clmm_pool, integrate } = this.sdk.sdkOptions
    tx = tx || new Transaction()

    const typeArguments = [params.coin_type_a, params.coin_type_b]
    const tick_lower = asUintN(BigInt(params.tick_lower)).toString()
    const tick_upper = asUintN(BigInt(params.tick_upper)).toString()
    const args = [
      tx.object(getPackagerConfigs(clmm_pool).global_config_id),
      tx.object(params.pool_id),
      tx.pure.u32(Number(tick_lower)),
      tx.pure.u32(Number(tick_upper)),
    ]

    tx.moveCall({
      target: `${integrate.published_at}::${ClmmIntegratePoolModule}::open_position`,
      typeArguments,
      arguments: args,
    })

    return tx
  }

  /**
   * Open position with price range in clmmpool.
   * @param {OpenPositionWithPriceParams} params
   * @returns {TransactionBlock}
   */
  async openPositionWithPricePayload(params: OpenPositionWithPriceParams, tx?: Transaction): Promise<Transaction> {
    const { pool_id } = params
    const { clmm_pool, integrate } = this.sdk.sdkOptions
    tx = tx || new Transaction()

    const pool = await this.sdk.Pool.getPool(pool_id, false)
    const tick_spacing = Number(pool.tick_spacing)

    let tick_lower = 0
    let tick_upper = 0

    if (params.is_full_range) {
      tick_lower = TickUtil.getMinIndex(tick_spacing)
      tick_upper = TickUtil.getMaxIndex(tick_spacing)
    } else {
      const { price_base_coin, min_price, max_price } = params
      tick_lower = TickMath.priceToInitializeTickIndex(
        price_base_coin === 'coin_a' ? d(min_price) : d(1).div(max_price),
        params.coin_decimals_a,
        params.coin_decimals_b,
        tick_spacing
      )
      tick_upper = TickMath.priceToInitializeTickIndex(
        price_base_coin === 'coin_a' ? d(max_price) : d(1).div(min_price),
        params.coin_decimals_a,
        params.coin_decimals_b,
        tick_spacing
      )
    }

    const typeArguments = [pool.coin_type_a, pool.coin_type_b]
    const args = [
      tx.object(getPackagerConfigs(clmm_pool).global_config_id),
      tx.object(params.pool_id),
      tx.pure.u32(Number(asUintN(BigInt(tick_lower)))),
      tx.pure.u32(Number(asUintN(BigInt(tick_upper)))),
    ]

    tx.moveCall({
      target: `${integrate.published_at}::${ClmmIntegratePoolModule}::open_position`,
      typeArguments,
      arguments: args,
    })

    return tx
  }

  /**
   * Collect LP fee from Position.
   * @param {CollectFeeParams} params
   * @param {TransactionBlock} tx
   * @returns {TransactionBlock}
   */
  async collectFeePayload(
    params: CollectFeeParams,
    tx?: Transaction,
    input_coin_a?: TransactionObjectArgument,
    input_coin_b?: TransactionObjectArgument
  ): Promise<Transaction> {
    tx = tx || new Transaction()

    const coin_a = input_coin_a || CoinAssist.buildCoinWithBalance(BigInt(0), params.coin_type_a, tx)
    const coin_b = input_coin_b || CoinAssist.buildCoinWithBalance(BigInt(0), params.coin_type_b, tx)

    this.createCollectFeePayload(params, tx, coin_a, coin_b)
    return tx
  }

  createCollectFeePayload(
    params: CollectFeeParams,
    tx: Transaction,
    primary_coin_a_input: TransactionObjectArgument,
    primary_coin_b_input: TransactionObjectArgument
  ) {
    const { clmm_pool, integrate } = this.sdk.sdkOptions
    const typeArguments = [params.coin_type_a, params.coin_type_b]
    const args = [
      tx.object(getPackagerConfigs(clmm_pool).global_config_id),
      tx.object(params.pool_id),
      tx.object(params.pos_id),
      primary_coin_a_input,
      primary_coin_b_input,
    ]

    tx.moveCall({
      target: `${integrate.published_at}::${ClmmIntegratePoolV2Module}::collect_fee`,
      typeArguments,
      arguments: args,
    })
    return tx
  }

  /**
   * Calculate the result of add liquidity with price.
   * @param {CalculateAddLiquidityWithPriceParams} params
   * @returns {Promise<CalculateAddLiquidityResult>}
   */
  async calculateAddLiquidityResultWithPrice(
    params: CalculateAddLiquidityWithPriceParams | CalculateAddLiquidityFixCoinWithPriceParams
  ): Promise<CalculateAddLiquidityResult> {
    const { pool_id, slippage, refresh_pool_price, add_mode_params } = params

    const pool = await this.sdk.Pool.getPool(pool_id, refresh_pool_price)
    const tick_spacing = Number(pool.tick_spacing)

    let tick_lower = 0
    let tick_upper = 0

    if (add_mode_params.is_full_range) {
      tick_lower = TickUtil.getMinIndex(tick_spacing)
      tick_upper = TickUtil.getMaxIndex(tick_spacing)
    } else {
      const { price_base_coin, min_price, max_price } = add_mode_params
      tick_lower = TickMath.priceToInitializeTickIndex(
        price_base_coin === 'coin_a' ? d(min_price) : d(1).div(max_price),
        add_mode_params.coin_decimals_a,
        add_mode_params.coin_decimals_b,
        tick_spacing
      )
      tick_upper = TickMath.priceToInitializeTickIndex(
        price_base_coin === 'coin_a' ? d(max_price) : d(1).div(min_price),
        add_mode_params.coin_decimals_a,
        add_mode_params.coin_decimals_b,
        tick_spacing
      )
    }

    if ('liquidity' in params) {
      const { liquidity } = params

      const lower_sqrt_price = TickMath.tickIndexToSqrtPriceX64(tick_lower)
      const upper_sqrt_price = TickMath.tickIndexToSqrtPriceX64(tick_upper)

      const { coin_amount_a, coin_amount_b } = ClmmPoolUtil.getCoinAmountFromLiquidity(
        new BN(liquidity),
        new BN(pool.current_sqrt_price),
        lower_sqrt_price,
        upper_sqrt_price,
        false
      )

      const coin_amount_limit_a = d(coin_amount_a)
        .mul(1 + slippage)
        .toFixed(0, Decimal.ROUND_UP)

      const coin_amount_limit_b = d(coin_amount_b)
        .mul(1 + slippage)
        .toFixed(0, Decimal.ROUND_UP)

      return { coin_amount_a, coin_amount_b, coin_amount_limit_a, coin_amount_limit_b, liquidity, tick_lower, tick_upper }
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
        new BN(pool.current_sqrt_price)
      )

    return {
      coin_amount_a,
      coin_amount_b,
      coin_amount_limit_a,
      coin_amount_limit_b,
      liquidity: liquidity_amount,
      tick_lower,
      tick_upper,
      fix_amount_a,
    }
  }

  /**
   * Add liquidity with price range.
   * @param {AddLiquidityWithPriceRangeParams} params
   * @param {TransactionBlock} tx
   * @returns {TransactionBlock}
   */
  async addLiquidityWithPricePayload(
    params: AddLiquidityWithPriceRangeParams,
    tx?: Transaction,
    input_coin_a?: TransactionObjectArgument,
    input_coin_b?: TransactionObjectArgument
  ): Promise<Transaction> {
    const { pool_id, calculate_result } = params
    const { coin_amount_limit_a, coin_amount_limit_b, liquidity, tick_lower, tick_upper } = calculate_result
    tx = tx || new Transaction()
    const pool = await this.sdk.Pool.getPool(pool_id, false)

    await this.createAddLiquidityPayload(
      {
        delta_liquidity: liquidity,
        max_amount_a: coin_amount_limit_a,
        max_amount_b: coin_amount_limit_b,
        tick_lower: tick_lower,
        tick_upper: tick_upper,
        collect_fee: false,
        rewarder_coin_types: [],
        coin_type_a: pool.coin_type_a,
        coin_type_b: pool.coin_type_b,
        pool_id: pool_id,
        pos_id: '',
      },
      tx,
      input_coin_a,
      input_coin_b
    )

    return tx
  }

  /**
   * Add liquidity with price range.
   * @param {AddLiquidityWithPriceRangeParams} params
   * @param {TransactionBlock} tx
   * @returns {TransactionBlock}
   */
  async createAddLiquidityFixCoinWithPricePayload(
    params: AddLiquidityWithPriceRangeParams,
    tx?: Transaction,
    input_coin_a?: TransactionObjectArgument,
    input_coin_b?: TransactionObjectArgument
  ): Promise<Transaction> {
    const { pool_id, calculate_result } = params
    const { coin_amount_limit_a, coin_amount_limit_b, liquidity, tick_lower, tick_upper, fix_amount_a, coin_amount_a, coin_amount_b } =
      calculate_result
    if (fix_amount_a === undefined) {
      throw handleMessageError(PositionErrorCode.InvalidParams, 'fix_amount_a is undefined', {
        [DETAILS_KEYS.METHOD_NAME]: 'addLiquidityFixCoinCoinWithPricePayload',
        [DETAILS_KEYS.REQUEST_PARAMS]: params,
      })
    }
    tx = tx || new Transaction()
    const pool = await this.sdk.Pool.getPool(pool_id, false)

    await this.createAddLiquidityFixTokenPayload(
      {
        amount_a: fix_amount_a ? coin_amount_a : coin_amount_limit_a,
        amount_b: fix_amount_a ? coin_amount_limit_b : coin_amount_b,
        slippage: 0,
        fix_amount_a,
        is_open: true,
        tick_lower: tick_lower,
        tick_upper: tick_upper,
        collect_fee: false,
        rewarder_coin_types: [],
        coin_type_a: pool.coin_type_a,
        coin_type_b: pool.coin_type_b,
        pool_id: pool_id,
        pos_id: '',
      },
      undefined,
      tx,
      input_coin_a,
      input_coin_b
    )

    return tx
  }

  createCollectFeeNoSendPayload(
    params: CollectFeeParams,
    tx: Transaction,
    primary_coin_a_input: TransactionObjectArgument,
    primary_coin_b_input: TransactionObjectArgument
  ) {
    const { clmm_pool, integrate } = this.sdk.sdkOptions
    const typeArguments = [params.coin_type_a, params.coin_type_b]
    const args = [
      tx.object(getPackagerConfigs(clmm_pool).global_config_id),
      tx.object(params.pool_id),
      tx.object(params.pos_id),
      primary_coin_a_input,
      primary_coin_b_input,
    ]

    tx.moveCall({
      target: `${integrate.published_at}::${ClmmIntegratePoolV3Module}::collect_fee`,
      typeArguments,
      arguments: args,
    })
    return tx
  }
}
