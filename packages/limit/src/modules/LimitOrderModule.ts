import type { DevInspectResults } from '@mysten/sui/jsonRpc'
import { Transaction } from '@mysten/sui/transactions'
import { normalizeSuiAddress } from '@mysten/sui/utils'
import { blake2b } from 'blakejs'
import {
  CLOCK_ADDRESS,
  CoinAssist,
  DETAILS_KEYS,
  DataPage,
  IModule,
  PaginationArgs,
  TypeNameRaw,
  composeType,
  extractStructTagFromType,
  fixCoinType,
  getPackagerConfigs,
} from '@cetusprotocol/common-sdk'
import { LimitErrorCode, handleError } from '../errors/errors'
import { CetusLimitOrderSDK } from '../sdk'
import {
  CancelOrderByOwnerParams,
  ClaimTargetCoinParams,
  LimitOrder,
  LimitOrderCoinType,
  LimitOrderConfig,
  LimitOrderToken,
  OrderLimitEvent,
  OrderPool,
  PlaceLimitOrderParams,
} from '../types/limitOrder'
import { LimitOrderUtils } from '../utils/limitOrder'
import { bcs } from '@mysten/sui/bcs'

export class LimitOrderModule implements IModule<CetusLimitOrderSDK> {
  protected _sdk: CetusLimitOrderSDK

  constructor(sdk: CetusLimitOrderSDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  /**
   * Get the token list supported by limit orders
   */
  async getLimitOrderTokenList(): Promise<LimitOrderToken[]> {
    const { limit_order } = this._sdk.sdkOptions
    const { token_list_handle } = getPackagerConfigs(limit_order)
    const { FullClient } = this._sdk
    try {
      const res = await FullClient.getDynamicFieldsByPage(token_list_handle)
      const warpIds = res.data.map((item) => item.fieldId)

      const objectRes = await FullClient.batchGetObjects(warpIds, { json: true })
      return objectRes.map((item: any) => {
        const fields = item.json
        const info: LimitOrderToken = {
          coin_type: extractStructTagFromType(fields.name.name).full_address,
          min_trade_amount: Number(fields.value),
        }

        return info
      })
    } catch (error) {
      return handleError(LimitErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getLimitOrderTokenList',
      })
    }
  }

  /**
   * Get the list of limit order pools
   * @returns
   */
  async getLimitOrderPoolList(): Promise<OrderPool[]> {
    const { limit_order } = this._sdk.sdkOptions
    const { rate_orders_indexer_handle } = getPackagerConfigs(limit_order)
    const { FullClient } = this._sdk
    try {
      const res = await FullClient.getDynamicFieldsByPage(rate_orders_indexer_handle)
      const warpIds = res.data.map((item) => item.fieldId)

      const objectRes = await FullClient.batchGetObjects(warpIds, { json: true })

      return objectRes.map((item: any) => {
        const fields = item.json.value
        const info: OrderPool = {
          pay_coin_type: extractStructTagFromType(fields.pay_coin.name).full_address,
          target_coin_type: extractStructTagFromType(fields.target_coin.name).full_address,
          indexer_id: fields.indexer_id,
          indexer_key: fields.indexer_key,
        }
        this._sdk.updateCache(`${info.pay_coin_type}_${info.target_coin_type}`, info.indexer_id)
        return info
      })
    } catch (error) {
      return handleError(LimitErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getLimitOrderPoolList',
      })
    }
  }

  async getLimitOrderPool(pay_coin_type: string, target_coin_type: string): Promise<OrderPool> {
    const { limit_order } = this._sdk.sdkOptions
    const { rate_orders_indexer_handle } = getPackagerConfigs(limit_order)
    const { FullClient } = this._sdk

    try {
      const res: any = await FullClient.getDynamicField({
        parentId: rate_orders_indexer_handle,
        name: {
          type: '0x2::object::ID',
          bcs: bcs.Address.serialize(this.buildPoolKey(fixCoinType(pay_coin_type, true), fixCoinType(target_coin_type, true))).toBytes(),
        },
      })
      const bacData = res.dynamicField?.value.bcs

      const parsed = bcs.struct('RateOrdersIndexerSimpleInfo', {
        indexer_id: bcs.Address,
        indexer_key: bcs.Address,
        pay_coin: TypeNameRaw,
        target_coin: TypeNameRaw,
      }).parse(bacData)

      const info: OrderPool = {
        pay_coin_type: fixCoinType(parsed.pay_coin.name, false),
        target_coin_type: fixCoinType(parsed.target_coin.name, false),
        indexer_id: parsed.indexer_id,
        indexer_key: parsed.indexer_key,
      }
      this._sdk.updateCache(`${info.pay_coin_type}_${info.target_coin_type}`, info.indexer_id)

      return info
    } catch (error) {
      console.log('🚀🚀🚀 ~ file: LimitOrderModule.ts:122 ~ LimitOrderModule ~ getLimitOrderPool ~ error:', error)
      return handleError(LimitErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getLimitOrderPool',
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          pay_coin_type,
          target_coin_type,
        },
      })
    }
  }

  async getPoolIndexerId(pay_coin_type: string, target_coin_type: string): Promise<string | undefined> {
    const indexer_id = this._sdk.getCache<string>(`${pay_coin_type}_${target_coin_type}`)
    try {
      if (indexer_id === undefined) {
        const info = await this.getLimitOrderPool(pay_coin_type, target_coin_type)
        if (info) {
          return info.indexer_id
        }
      }
    } catch (error) {
      handleError(LimitErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getPoolIndexerId',
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          pay_coin_type,
          target_coin_type,
        },
      })
    }
  }

  public buildGetUserIndexerHandle(owner_address: string, tx?: Transaction) {
    const { limit_order } = this._sdk.sdkOptions
    tx = tx || new Transaction()
    tx.moveCall({
      target: `${limit_order.published_at}::limit_order::get_orders_indexer_by_owner`,
      typeArguments: [],
      arguments: [tx.pure.address(owner_address), tx.object(getPackagerConfigs(limit_order).user_orders_indexer_id)],
    })
  }

  public parsedQueryUserIndexerEvent(events: any[]) {
    const valueList: any[] = events.filter((item: any) => {
      return item.eventType.includes('limit_order::QueryUserIndexerEvent')
    })
    if (valueList.length > 0) {
      // "0x533fab9a116080e2cb1c87f1832c1bf4231ab4c32318ced041e75cc28604bba9::limit_order::QueryUserIndexerEvent"
      const bcsData = valueList[0].bcs
      return bcs.struct('QueryUserIndexerEvent', {
        indexer_id: bcs.Address,
        orders_table_id: bcs.Address,
      }).parse(bcsData).orders_table_id
    }
    return undefined
  }

  /**
   * Get the list of limit orders
   * @returns
   */
  async getOwnerLimitOrderList(owner_address: string, pagination_args?: PaginationArgs): Promise<DataPage<LimitOrder>> {
    const { FullClient } = this._sdk
    const dataPage: DataPage<LimitOrder> = {
      data: [],
      has_next_page: false,
    }
    try {
      const userIndexerHandle = await this.getUserIndexerHandle(owner_address)
      if (!userIndexerHandle) {
        return dataPage
      }

      const res = await FullClient.getDynamicFieldsByPage(userIndexerHandle, pagination_args)
      dataPage.has_next_page = res.has_next_page
      dataPage.next_cursor = res.next_cursor
      const orderIds = res.data.map((item) => bcs.Address.parse(item.name.bcs))

      const objectRes = await FullClient.batchGetObjects(orderIds, { json: true })
      const data = objectRes.map((item) => LimitOrderUtils.buildLimitOrderInfo(item)).filter((info) => info !== undefined) as LimitOrder[]
      dataPage.data = data
    } catch (error) {
      console.error('Error in getOwnerLimitOrderList:', error)
      handleError(LimitErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getOwnerLimitOrderList',
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          owner_address,
          pagination_args,
        },
      })
    }
    return dataPage
  }

  async getLimitOrderConfigs(): Promise<LimitOrderConfig> {
    const { package_id } = this._sdk.sdkOptions.limit_order
    const config: LimitOrderConfig = {
      rate_orders_indexer_id: '',
      rate_orders_indexer_handle: '',
      global_config_id: '',
      token_list_handle: '',
      user_orders_indexer_id: '',
      user_orders_indexer_handle: '',
    }
    try {
      const initEventObjs = (await this._sdk.FullClient.queryEventsByPage({ MoveEventType: `${package_id}::limit_order::InitEvent` })).data
      if (initEventObjs.length > 0) {
        const fields = initEventObjs[0].parsedJson as any
        config.rate_orders_indexer_id = fields.rate_orders_indexer_id
        config.user_orders_indexer_id = fields.user_orders_indexer_id

        const orderPoolObj: any = await this._sdk.FullClient.getObject({
          objectId: config.rate_orders_indexer_id,
          include: { json: true },
        })
        config.rate_orders_indexer_handle = orderPoolObj.object.json.list.id

        const useOrderObj: any = await this._sdk.FullClient.getObject({
          objectId: config.user_orders_indexer_id,
          include: { json: true },
        })
        config.user_orders_indexer_handle = useOrderObj.object.json.indexer.id
      }
      const globalEventObjs = (await this._sdk.FullClient.queryEventsByPage({ MoveEventType: `${package_id}::config::InitFactoryEvent` }))
        .data

      if (globalEventObjs.length > 0) {
        const fields = globalEventObjs[0].parsedJson as any
        config.global_config_id = fields.global_config_id

        const globalObj: any = await this._sdk.FullClient.getObject({ objectId: config.global_config_id, include: { json: true } })
        const globalObjFields = globalObj.object.json
        config.token_list_handle = globalObjFields.token_white_list.id
      }

      return config
    } catch (error) {
      return handleError(LimitErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getLimitOrderConfigs',
      })
    }
  }

  /**
   * Get order information
   * @param order_id
   * @returns
   */
  async getLimitOrder(order_id: string): Promise<LimitOrder | undefined> {
    try {
      const res = await this._sdk.FullClient.getObject({ objectId: order_id, include: { json: true } })
      return LimitOrderUtils.buildLimitOrderInfo(res.object)
    } catch (error) {
      console.log('Error in getLimitOrder:', error)
      return handleError(LimitErrorCode.LimitOrderIdInValid, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getLimitOrder',
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          order_id,
        },
      })
    }
  }

  /**
   * Get order operation logs
   * @param order_id
   * @returns
   */
  async getLimitOrderLogs(order_id: string): Promise<OrderLimitEvent[]> {
    try {
      const res = await this._sdk.FullClient.queryTransactionBlocksByPage({ affectedAddress: order_id })
      const list: OrderLimitEvent[] = []
      res.data.forEach((item) => {
        list.push(...LimitOrderUtils.buildOrderLimitEvent(item, ['OrderPlacedEvent', 'OrderCanceledEvent', 'FlashLoanEvent']))
      })

      return list
    } catch (error) {
      console.log('Error in getLimitOrderLogs:', error)
      handleError(LimitErrorCode.LimitOrderIdInValid, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getLimitOrderLogs',
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          order_id,
        },
      })
    }
    return []
  }

  /**
   * Get the claim logs of the order
   * @param order_id
   * @returns
   */
  async getLimitOrderClaimLogs(order_id: string): Promise<OrderLimitEvent[]> {
    try {
      const res = await this._sdk.FullClient.queryTransactionBlocksByPage({ affectedObject: order_id })
      const list: OrderLimitEvent[] = []
      res.data.forEach((item) => {
        list.push(...LimitOrderUtils.buildOrderLimitEvent(item, ['ClaimTargetCoinEvent']))
      })

      return list
    } catch (error) {
      console.log('Error in getLimitOrderLogs:', error)
      handleError(LimitErrorCode.LimitOrderIdInValid, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getLimitOrderClaimLogs',
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          order_id,
        },
      })
    }
    return []
  }

  private buildRateOrdersIndexerType(params: LimitOrderCoinType) {
    const { limit_order } = this._sdk.sdkOptions
    return composeType(`${limit_order.package_id}::limit_order::RateOrdersIndexer`, [params.pay_coin_type, params.target_coin_type])
  }

  public buildPoolKey(pay_coin_type: string, target_coin_type: string) {
    const payCoinBytes = Buffer.from(pay_coin_type, 'ascii')
    const targetCoinBytes = Buffer.from(target_coin_type, 'ascii')

    const combinedBytes = Buffer.concat([payCoinBytes, targetCoinBytes])

    const hash = blake2b(combinedBytes, undefined, 32)

    return `0x${Buffer.from(hash).toString('hex')}`
  }

  /**
   * Place a limit order
   * @param pay_coin_type
   * @param target_coin_type
   * @returns
   */
  async placeLimitOrder(params: PlaceLimitOrderParams): Promise<Transaction> {
    const { limit_order } = this._sdk.sdkOptions
    const { user_orders_indexer_id, global_config_id, rate_orders_indexer_id } = getPackagerConfigs(limit_order)
    let indexerId: string | undefined
    try {
      indexerId = await this.getPoolIndexerId(params.pay_coin_type, params.target_coin_type)
    } catch (error) {
      indexerId = undefined
    }
    try {
      const tx = new Transaction()
      const payCoinObj = CoinAssist.buildCoinWithBalance(BigInt(params.pay_coin_amount), params.pay_coin_type, tx)

      tx.moveCall({
        target: `${limit_order.published_at}::limit_order::${indexerId === undefined ? 'create_indexer_and_place_limit_order' : 'place_limit_order'
          }`,
        typeArguments: [params.pay_coin_type, params.target_coin_type],
        arguments: [
          tx.object(global_config_id),
          indexerId === undefined ? tx.object(rate_orders_indexer_id) : tx.object(indexerId),
          tx.object(user_orders_indexer_id),
          payCoinObj,
          tx.pure.u128(LimitOrderUtils.priceToRate(params.price, params.pay_decimal, params.target_decimal)),
          tx.pure.u64(params.expired_ts),
          tx.object(CLOCK_ADDRESS),
        ],
      })
      return tx
    } catch (error) {
      return handleError(LimitErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'placeLimitOrder',
        [DETAILS_KEYS.REQUEST_PARAMS]: params,
      })
    }
  }

  /**
   * claim target coin
   * @param params
   * @returns
   */
  async claimTargetCoin(params: ClaimTargetCoinParams): Promise<Transaction> {
    const { limit_order } = this._sdk.sdkOptions
    const { global_config_id } = getPackagerConfigs(limit_order)
    const tx = new Transaction()

    tx.moveCall({
      target: `${limit_order.published_at}::limit_order::claim_target_coin`,
      typeArguments: [params.pay_coin_type, params.target_coin_type],
      arguments: [tx.object(global_config_id), tx.object(params.order_id)],
    })
    return tx
  }

  /**
   * Cancel a limit order
   * @param pay_coin_type
   * @param target_coin_type
   * @returns
   */
  async cancelOrdersByOwner(params: CancelOrderByOwnerParams[]): Promise<Transaction> {
    const { limit_order } = this._sdk.sdkOptions
    const { global_config_id } = getPackagerConfigs(limit_order)
    const tx = new Transaction()
    try {
      const indexerIdMap: Record<string, string> = {}
      for (let index = 0; index < params.length; index++) {
        const element = params[index]
        const indexerId = await this.getPoolIndexerId(element.pay_coin_type, element.target_coin_type)
        if (indexerId === undefined) {
          throw Error('not found indexerId')
        }
        indexerIdMap[element.order_id] = indexerId
      }

      params.forEach((item) => {
        tx.moveCall({
          target: `${limit_order.published_at}::limit_order::cancel_order_by_owner`,
          typeArguments: [item.pay_coin_type, item.target_coin_type],
          arguments: [
            tx.object(global_config_id),
            tx.object(indexerIdMap[item.order_id]),
            tx.object(item.order_id),
            tx.object(CLOCK_ADDRESS),
          ],
        })
      })

      return tx
    } catch (error) {
      return handleError(LimitErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'cancelOrdersByOwner',
        [DETAILS_KEYS.REQUEST_PARAMS]: params,
      })
    }
  }

  private async getUserIndexerHandle(owner_address: string) {
    let userIndexerHandle = this.getUserIndexerHandleByCache(owner_address)
    if (userIndexerHandle === undefined) {
      const tx = new Transaction()
      this.buildGetUserIndexerHandle(owner_address, tx)

      const res: any = await this._sdk.FullClient.sendSimulationTransaction(tx, normalizeSuiAddress(owner_address))
      userIndexerHandle = this.parsedQueryUserIndexerEvent(res.Transaction.events)
      if (userIndexerHandle) {
        this.saveUserIndexerHandleByCache(owner_address, userIndexerHandle)
      }
    }
    return userIndexerHandle
  }

  private getUserIndexerHandleByCache(owner_address: string) {
    const cacheKey = `getUserIndexerHandleByCache_${owner_address}`
    return this._sdk.getCache<string>(cacheKey)
  }

  private saveUserIndexerHandleByCache(owner_address: string, id: string) {
    const cacheKey = `getUserIndexerHandleByCache_${owner_address}`
    return this._sdk.updateCache(cacheKey, id)
  }
}
