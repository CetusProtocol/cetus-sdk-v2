import type { TransactionObjectArgument } from '@mysten/sui/transactions'
import { Transaction } from '@mysten/sui/transactions'
import type { DataPage, SuiAddressType } from '@cetusprotocol/common-sdk'
import {
  CLOCK_ADDRESS,
  CoinAssist,
  DETAILS_KEYS,
  extractStructTagFromType,
  fixCoinType,
  getPackagerConfigs,
  IModule,
  TableIDBoolRaw,
  TypeNameRaw,
} from '@cetusprotocol/common-sdk'
import { DcaErrorCode, handleError } from '../errors/errors'
import { CetusDcaSDK } from '../sdk'
import type {
  CloseDcaOrderParams,
  DcaCoinWhiteList,
  DcaConfigs,
  DcaOrder,
  DcaOrderTx,
  OpenDcaOrderParams,
  WithdrawDcaParams,
} from '../types/dcaType'
import { DcaUtils } from '../utils/dca'
import { bcs } from '@mysten/sui/bcs'




/**
 * Helper class to help interact with farm pools with a router interface.
 */
export class DcaModule implements IModule<CetusDcaSDK> {
  protected _sdk: CetusDcaSDK

  constructor(sdk: CetusDcaSDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  // create dca order
  dcaOpenOrderPayload(params: OpenDcaOrderParams): Transaction {
    try {
      const { dca } = this._sdk.sdkOptions
      const { global_config_id, indexer_id } = getPackagerConfigs(dca)
      const tx = new Transaction()
      const inCoinObj = CoinAssist.buildCoinWithBalance(BigInt(params.in_coin_amount), params.in_coin_type, tx)

      tx.moveCall({
        target: `${dca.published_at}::order::open_order`,
        typeArguments: [params.in_coin_type, params.out_coin_type],
        arguments: [
          tx.object(global_config_id),
          inCoinObj,
          tx.pure.u64(params.cycle_frequency),
          tx.pure.u64(params.cycle_count),
          tx.pure.u64(params.per_cycle_min_out_amount),
          tx.pure.u64(params.per_cycle_max_out_amount),
          tx.pure.u64(params.per_cycle_in_amount_limit),
          tx.pure.u64(params.fee_rate),
          tx.pure.u64(params.timestamp),
          tx.pure.string(params.signature),
          tx.object(CLOCK_ADDRESS),
          tx.object(indexer_id),
        ],
      })
      return tx
    } catch (error) {
      return handleError(DcaErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'dcaOpenOrderPayload',
        [DETAILS_KEYS.REQUEST_PARAMS]: params,
      })
    }
  }

  // close dca order
  dcaCloseOrderPayload(params: Array<CloseDcaOrderParams>): Transaction {
    const { dca } = this._sdk.sdkOptions
    const { global_config_id, indexer_id } = getPackagerConfigs(dca)
    const tx = new Transaction()
    params.forEach((order: CloseDcaOrderParams) => {
      const outCoin = tx.moveCall({
        target: `${dca.published_at}::order::cancle_order`,
        typeArguments: [order.in_coin_type, order.out_coin_type],
        arguments: [tx.object(global_config_id), tx.object(order.order_id), tx.object(indexer_id), tx.object(CLOCK_ADDRESS)],
      })
      tx.transferObjects([outCoin[0], outCoin[1]], tx.pure.address(this._sdk.getSenderAddress()))
    })

    return tx
  }

  // query dca orders by wallet address
  async getDcaOrders(wallet_address: string): Promise<DataPage<DcaOrder>> {
    const dataPage: DataPage<DcaOrder> = {
      data: [],
      has_next_page: false,
    }
    try {
      const { dca } = this._sdk.sdkOptions
      const { user_indexer_id } = getPackagerConfigs(dca)
      let dca_table_id
      const cache_dca_table_id = this._sdk.getCache<string>(`${wallet_address}_dca_table_id`)
      if (cache_dca_table_id) {
        dca_table_id = cache_dca_table_id
      } else {
        const dca_table: any = await this._sdk.FullClient.getDynamicField({
          parentId: user_indexer_id,
          name: {
            type: 'address',
            bcs: bcs.Address.serialize(wallet_address).toBytes(),
          },
        })
        const parsed = TableIDBoolRaw.parse(dca_table.dynamicField.value.bcs)
        dca_table_id = parsed.id
        this._sdk.updateCache(`${wallet_address}_dca_table_id`, dca_table_id)
      }
      let nextCursor: string | null = null
      const limit = 50
      const tableIdList: any = []
      while (true) {
        const tableRes: any = await this._sdk.FullClient.listDynamicFields({
          parentId: dca_table_id,
          cursor: nextCursor,
          limit,
        })
        tableRes.dynamicFields.forEach((item: any) => {
          tableIdList.push(bcs.Address.parse(item.name.bcs))
        })
        nextCursor = tableRes.cursor
        if (nextCursor === null || tableRes.dynamicFields.length < limit) {
          break
        }
      }
      const dcaOrderList = []
      const res = await this._sdk.FullClient.batchGetObjects(tableIdList, { json: true })
      for (let i = 0; i < res.length; i++) {
        const dcaOrderObject: any = res[i]
        const type = extractStructTagFromType(dcaOrderObject.type)
        const in_coin_type: SuiAddressType = type.type_arguments[0]
        const out_coin_type: SuiAddressType = type.type_arguments[1]
        dcaOrderList.push({
          in_coin_type,
          out_coin_type,
          ...dcaOrderObject.json,
          id: dcaOrderObject.objectId,
          version: dcaOrderObject.version,
        })
      }
      dataPage.data = dcaOrderList
      return dataPage
    } catch (error) {
      return handleError(DcaErrorCode.InvalidWalletAddress, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getDcaOrders',
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          wallet_address,
        },
      })
    }
  }

  // get withdraw dca order payload
  async withdrawPayload(params: WithdrawDcaParams) {
    const { dca } = this._sdk.sdkOptions
    const { global_config_id } = getPackagerConfigs(dca)
    const tx = new Transaction()
    const outCoin: TransactionObjectArgument[] = tx.moveCall({
      target: `${dca.published_at}::order::withdraw`,
      typeArguments: [params.in_coin_type, params.out_coin_type],
      arguments: [tx.object(global_config_id), tx.object(params.order_id), tx.object(CLOCK_ADDRESS)],
    })
    tx.transferObjects([outCoin[0]], tx.pure.address(this._sdk.getSenderAddress()))
    return tx
  }
  // get withdraw all dca order payload
  async withdrawAll(params: WithdrawDcaParams[]) {
    const { dca } = this._sdk.sdkOptions
    const { global_config_id } = getPackagerConfigs(dca)
    const tx = new Transaction()
    for (let i = 0; i < params.length; i++) {
      const outCoin: TransactionObjectArgument[] = tx.moveCall({
        target: `${dca.published_at}::order::withdraw`,
        typeArguments: [params[i].in_coin_type, params[i].out_coin_type],
        arguments: [tx.object(global_config_id), tx.object(params[i].order_id), tx.object(CLOCK_ADDRESS)],
      })
      tx.transferObjects([outCoin[0]], tx.pure.address(this._sdk.getSenderAddress()))
    }
    return tx
  }

  // query dca order make deal history
  async getDcaOrdersMakeDeal(order_id: string) {
    const historyResult: string[] | undefined = this._sdk.getCache(`${order_id}_tx`)
    const result: string[] = []
    let nextCursor: string | null = null
    const limit = 50
    try {
      while (true) {
        const dcaOrderTxRes: any = await this._sdk.FullClient.queryTransactionBlocksByPage({ affectedAddress: order_id }, { limit: 50 })
        dcaOrderTxRes.data.forEach((element: DcaOrderTx) => {
          result.push(element.digest)
        })
        nextCursor = dcaOrderTxRes.nextCursor
        if (nextCursor === null || dcaOrderTxRes.data.length < limit) {
          break
        }
      }
      this._sdk.updateCache(`${order_id}_tx`, result)
      if (historyResult && historyResult.length === result.length) {
        return this._sdk.getCache(`${order_id}_history_list`)
      }
      const dcaOrderEvents: any = await this._sdk.FullClient._jsonRpcClient!.multiGetTransactionBlocks({
        digests: result,
        options: {
          showInput: true,
          showEffects: true,
          showEvents: true,
        },
      })
      const list: any = []
      dcaOrderEvents.forEach((item: any) => {
        list.push(...DcaUtils.buildOrderHistoryList(item, ['MakeDealEvent']))
      })
      this._sdk.updateCache(`${order_id}_history_list`, list)
      return list
    } catch (error) {
      return handleError(DcaErrorCode.InvalidOrderId, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getDcaOrdersMakeDeal',
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          order_id,
        },
      })
    }
  }

  // Query DCA token whitelist
  // whitelist_mode = 0 close whitelist mode
  // whitelist_mode = 1 open in_coin only
  // whitelist_mode = 2 open out_coin only
  // whitelist_mode = 3 open in_coin and out_coin
  async getDcaCoinWhiteList(whitelist_mode: number): Promise<DcaCoinWhiteList> {
    const { in_coin_whitelist_id, out_coin_whitelist_id } = getPackagerConfigs(this._sdk.sdkOptions.dca)
    const inCoinList: SuiAddressType[] = []
    const outCoinList: SuiAddressType[] = []
    try {
      if (whitelist_mode === 1 || whitelist_mode === 3) {
        let nextCursor: string | null = null
        const limit = 50
        while (true) {
          const inCoinTableRes: any = await this._sdk.FullClient.getDynamicFieldsByPage(in_coin_whitelist_id, {
            cursor: nextCursor,
            limit,
          })
          inCoinTableRes.data.forEach((item: any) => {
            inCoinList.push(fixCoinType(TypeNameRaw.parse(item.name.bcs).name, false))
          })
          nextCursor = inCoinTableRes.nextCursor
          if (nextCursor === null || inCoinTableRes.data.length < limit) {
            break
          }
        }
      }
      if (whitelist_mode === 2 || whitelist_mode === 3) {
        let nextCursor: string | null = null
        const limit = 50
        while (true) {
          const outCoinTableRes: any = await this._sdk.FullClient.getDynamicFieldsByPage(out_coin_whitelist_id, {
            cursor: nextCursor,
            limit,
          })
          outCoinTableRes.data.forEach((item: any) => {
            outCoinList.push(fixCoinType(TypeNameRaw.parse(item.name.bcs).name, false))
          })
          nextCursor = outCoinTableRes.nextCursor
          if (nextCursor === null || outCoinTableRes.data.length < limit) {
            break
          }
        }
      }
      return {
        in_coin_list: inCoinList,
        out_coin_list: outCoinList,
      }
    } catch (error) {
      return handleError(DcaErrorCode.InvalidMode, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getDcaCoinWhiteList',
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          whitelist_mode,
        },
      })
    }
  }

  async getDcaGlobalConfig() {
    const { global_config_id } = getPackagerConfigs(this._sdk.sdkOptions.dca)
    try {
      const globalConfigObject: any = await this._sdk.FullClient.getObject({
        objectId: global_config_id,
        include: { json: true },
      })
      const globalConfig = DcaUtils.buildDcaGlobalConfig(globalConfigObject.object.json)
      return globalConfig
    } catch (error) {
      handleError(DcaErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getDcaGlobalConfig',
      })
    }
  }

  async getDcaConfigs() {
    const { package_id } = this._sdk.sdkOptions.dca
    const config: DcaConfigs = {
      admin_cap_id: '',
      global_config_id: '',
      indexer_id: '',
      user_indexer_id: '',
      in_coin_whitelist_id: '',
      out_coin_whitelist_id: '',
    }
    try {
      const configEvent = (await this._sdk.FullClient.queryEventsByPage({ MoveEventType: `${package_id}::config::InitEvent` })).data
      const orderEvent = (await this._sdk.FullClient.queryEventsByPage({ MoveEventType: `${package_id}::order::InitEvent` })).data

      if (configEvent && configEvent.length > 0) {
        const { parsedJson } = configEvent[0] as { parsedJson: any }
        config.admin_cap_id = parsedJson.admin_cap_id
        config.global_config_id = parsedJson.global_config_id
      }
      if (orderEvent && orderEvent.length > 0) {
        const { parsedJson } = orderEvent[0] as { parsedJson: any }
        config.indexer_id = parsedJson.indexer_id
        const user_indexer_object: any = await this._sdk.FullClient.getObject({
          objectId: parsedJson.indexer_id,
          include: { json: true },
        })
        config.user_indexer_id = user_indexer_object.object?.json.user_orders.id
      }
      if (config.global_config_id) {
        const global_config_object: any = await this._sdk.FullClient.getObject({
          objectId: config.global_config_id,
          include: { json: true },
        })
        config.in_coin_whitelist_id = global_config_object.object.json.in_coin_whitelist.id
        config.out_coin_whitelist_id = global_config_object.object.json.out_coin_whitelist.id
      }
      return config
    } catch (error) {
      handleError(DcaErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getDcaConfigs',
      })
    }
  }
}
