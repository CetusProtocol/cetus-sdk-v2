import { CLOCK_ADDRESS, d, getPackagerConfigs, SUI_SYSTEM_STATE_OBJECT_ID } from '@cetusprotocol/common-sdk'
import { bcs } from '@mysten/sui/bcs'
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions'
import { CetusMarginTradingSDK } from '../sdk'
import type {
  TsplAddTargetOptions,
  TsplCancelOrderOptions,
  TsplClaimSettlementOptions,
  TsplClaimSettlementResult,
  TsplOrder,
  TsplOrderCap,
  TsplPositionBorrowOptions,
  TsplPositionClaimRewardsOptions,
  TsplPositionCompoundDebtOptions,
  TsplPositionDepositOptions,
  TsplPositionRepayOptions,
  TsplPositionWithdrawOptions,
  TsplReclaimCapFromCompletedOrderOptions,
  TsplRemoveTargetOptions,
  TsplTarget,
  TsplUpdateTargetOptions,
} from '../types'
import { wrapTsplOrder } from '../utils'

export class TsplModules {
  protected _sdk: CetusMarginTradingSDK

  constructor(sdk: CetusMarginTradingSDK) {
    this._sdk = sdk
  }

  private get config() {
    return this._sdk.sdkOptions.tspl
  }

  private get versionedId() {
    return getPackagerConfigs(this.config).versioned_id
  }

  private target(method: string) {
    return `${this.config.published_at}::router::${method}`
  }

  private tradingConfig() {
    const { global_config_id, versioned_id } = getPackagerConfigs(this._sdk.sdkOptions.margin_trading)
    return {
      globalConfigId: global_config_id,
      versionedId: versioned_id,
    }
  }

  private lendingMarketConfig() {
    const { lending_market_id, lending_market_type } = getPackagerConfigs(this._sdk.sdkOptions.suilend)
    return {
      lendingMarketId: lending_market_id,
      lendingMarketType: lending_market_type,
    }
  }

  private orderPositionArgs(tx: Transaction, orderId: string, orderCapId: string) {
    const { globalConfigId, versionedId: tradingVersionedId } = this.tradingConfig()
    const { lendingMarketId } = this.lendingMarketConfig()
    return [
      tx.object(this.versionedId),
      tx.object(orderId),
      tx.object(orderCapId),
      tx.object(globalConfigId),
      tx.object(lendingMarketId),
      tradingVersionedId,
    ] as const
  }

  private u128Price18(tx: Transaction, price: string) {
    return tx.pure.u128(
      d(price)
        .mul(10 ** 18)
        .toFixed(0)
    )
  }

  private u64CloseRatioBps(tx: Transaction, close_ratio_bps: string) {
    return tx.pure.u64(d(close_ratio_bps).mul(10000).toFixed(0))
  }

  private u64SlippageBps(tx: Transaction, slippage_bps: string) {
    return tx.pure.u64(d(slippage_bps).toFixed(0))
  }

  public appendTpslLevel(
    tx: Transaction,
    kind: 'tp' | 'sl',
    target: TsplTarget,
    typeArguments: [string, string, string],
    orderId: TransactionObjectArgument | string,
    orderCapId: TransactionObjectArgument | string
  ) {
    const { trigger_price, slippage_bps, close_ratio_bps, target_is_base, id } = target
    const orderArgs = [
      tx.object(this.versionedId),
      typeof orderId === 'string' ? tx.object(orderId) : orderId,
      typeof orderCapId === 'string' ? tx.object(orderCapId) : orderCapId,
    ] as const

    if (id) {
      tx.moveCall({
        target: this.target('update_tpsl_level'),
        typeArguments,
        arguments: [
          ...orderArgs,
          tx.pure.u64(id),
          this.u128Price18(tx, trigger_price),
          this.u64SlippageBps(tx, slippage_bps),
          this.u64CloseRatioBps(tx, close_ratio_bps),
          tx.pure.bool(target_is_base),
          tx.object(CLOCK_ADDRESS),
        ],
      })
    } else {
      const addTarget = kind === 'tp' ? 'add_tp_level' : 'add_sl_level'
      tx.moveCall({
        target: this.target(addTarget),
        typeArguments,
        arguments: [
          ...orderArgs,
          this.u128Price18(tx, trigger_price),
          this.u64SlippageBps(tx, slippage_bps),
          this.u64CloseRatioBps(tx, close_ratio_bps),
          tx.pure.bool(target_is_base),
          tx.object(CLOCK_ADDRESS),
        ],
      })
    }
  }

  async getOrderBookId(market_id: string): Promise<string | undefined> {
    const cacheKey = `getOrderBookId_${market_id}`
    const cache = this._sdk.getCache<string>(cacheKey)
    if (cache) {
      return cache
    }
    const order_book_registry_handle = getPackagerConfigs(this.config).order_book_registry_handle
    const res: any = await this._sdk.FullClient.getDynamicField({
      parentId: order_book_registry_handle,
      name: {
        type: '0x2::object::ID',
        bcs: bcs.Address.serialize(market_id).toBytes(),
      },
    })

    const order_book_id = bcs.Address.parse(res.dynamicField.value.bcs)
    if (order_book_id) {
      this._sdk.updateCache(cacheKey, order_book_id)
    }
    return order_book_id
  }

  async getTsplOrderCap(wallet_address = this._sdk.getSenderAddress()): Promise<TsplOrderCap[]> {
    const orderCaps: TsplOrderCap[] = []
    try {
      const res = await this._sdk.FullClient.getOwnedObjectsByPage(wallet_address, `${this.config.package_id}::order::OrderCap`)

      res.data.forEach((obj: any) => {
        const fields = obj.json
        orderCaps.push({
          id: fields.id?.id || fields.id,
          order_id: fields.order_id,
          position_id: fields.position_id,
        })
      })
    } catch (error) {
      console.log('🚀🚀🚀 ~ tsplModules.ts:82 ~ TsplModules ~ error:', error)
    }

    return orderCaps
  }

  async getTsplOrderList(orderCaps: TsplOrderCap[]): Promise<TsplOrder[]> {
    const orders: TsplOrder[] = []
    try {
      const orderIds = orderCaps.map((cap) => cap.order_id)
      if (orderIds.length > 0) {
        const orderRes = await this._sdk.FullClient.batchGetObjects(orderIds, {
          json: true,
        })

        orderRes.forEach((obj: any, index: number) => {
          const fields = obj.json
          const order = wrapTsplOrder(fields)
          order.order_cap = orderCaps[index].id
          if ((order.status === 2 && order.settlements.size > 0) || order.status !== 2) {
            orders.push(order)
          }
        })
      }
    } catch (error) {
      console.log('🚀🚀🚀 ~ tsplModules.ts:82 ~ TsplModules ~ error:', error)
    }

    return orders
  }

  async getTsplOrder(orderCap: TsplOrderCap): Promise<TsplOrder> {
    try {
      const orderRes: any = await this._sdk.FullClient.getObject({
        objectId: orderCap.order_id,
        include: {
          json: true,
        },
      })
      const fields = orderRes.object.json
      const order = wrapTsplOrder(fields)
      order.order_cap = orderCap.id
      return order
    } catch (error) {
      console.log('🚀🚀🚀 ~ tsplModules.ts:82 ~ TsplModules ~ error:', error)
    }

    throw new Error(`Order id ${orderCap.order_id} not found`)
  }

  createTpslOrder(options: TsplAddTargetOptions, tx: Transaction) {
    const { order_book_id, position_cap_id, tp_target, sl_target, base_coin_type, quote_coin_type, is_long, entry_price } = options
    if (!tp_target && !sl_target) {
      throw new Error('tp_target or sl_target is required')
    }
    const { lending_market_type } = getPackagerConfigs(this._sdk.sdkOptions.suilend)
    const typeArguments = [lending_market_type, base_coin_type, quote_coin_type] as [string, string, string]
    let orderId: TransactionObjectArgument | string
    let orderCapId: TransactionObjectArgument | string
    const orderRes = tx.moveCall({
      target: this.target('create_order'),
      typeArguments,
      arguments: [
        tx.object(this.versionedId),
        tx.object(order_book_id),
        typeof position_cap_id === 'string' ? tx.object(position_cap_id) : position_cap_id,
        tx.pure.bool(is_long),
        this.u128Price18(tx, entry_price),
        tx.object(CLOCK_ADDRESS),
      ],
    })
    orderId = orderRes[0]
    orderCapId = orderRes[1]

    if (tp_target) {
      this.appendTpslLevel(tx, 'tp', tp_target, typeArguments, orderId, orderCapId)
    }
    if (sl_target) {
      this.appendTpslLevel(tx, 'sl', sl_target, typeArguments, orderId, orderCapId)
    }

    tx.moveCall({
      target: this.target('share_order'),
      typeArguments,
      arguments: [tx.object(this.versionedId), tx.object(order_book_id), orderId as TransactionObjectArgument],
    })

    tx.transferObjects([orderCapId], this._sdk.getSenderAddress())
    return tx
  }

  updateTpslOrder(options: TsplUpdateTargetOptions, tx: Transaction) {
    const { order_id, order_cap_id, target, base_coin_type, quote_coin_type } = options
    const { lending_market_type } = getPackagerConfigs(this._sdk.sdkOptions.suilend)
    const typeArguments = [lending_market_type, base_coin_type, quote_coin_type] as [string, string, string]

    if (target.id === undefined) {
      throw new Error('target.id is required')
    }

    this.appendTpslLevel(tx, 'tp', target, typeArguments, order_id, order_cap_id)

    return tx
  }

  cancelOrder(options: TsplCancelOrderOptions, tx: Transaction) {
    const { order_id, order_cap_id, base_coin_type, quote_coin_type, order_book_id } = options
    const { lending_market_type } = getPackagerConfigs(this._sdk.sdkOptions.suilend)
    tx.moveCall({
      target: this.target('cancel_order'),
      typeArguments: [lending_market_type, base_coin_type, quote_coin_type],
      arguments: [tx.object(this.versionedId), tx.object(order_book_id), tx.object(order_id), tx.object(order_cap_id)],
    })
    return tx
  }

  closeOrder(options: TsplCancelOrderOptions, tx: Transaction) {
    const { order_id, order_cap_id, base_coin_type, quote_coin_type, order_book_id } = options
    const { lending_market_type } = getPackagerConfigs(this._sdk.sdkOptions.suilend)
    tx.moveCall({
      target: this.target('close_order'),
      typeArguments: [lending_market_type, base_coin_type, quote_coin_type],
      arguments: [tx.object(this.versionedId), tx.object(order_book_id), tx.object(order_id), tx.object(order_cap_id)],
    })
    return tx
  }

  cancelOrderAndReturnCap(options: TsplCancelOrderOptions, tx: Transaction) {
    const { order_id, order_cap_id, base_coin_type, quote_coin_type, order_book_id } = options
    const { lending_market_type } = getPackagerConfigs(this._sdk.sdkOptions.suilend)
    return tx.moveCall({
      target: this.target('cancel_order_and_return_cap'),
      typeArguments: [lending_market_type, base_coin_type, quote_coin_type],
      arguments: [tx.object(this.versionedId), tx.object(order_book_id), tx.object(order_id), tx.object(order_cap_id)],
    })
  }

  removeTarget(options: TsplRemoveTargetOptions, tx: Transaction) {
    const { order_id, order_cap_id, target_id, base_coin_type, quote_coin_type } = options
    const { lending_market_type } = getPackagerConfigs(this._sdk.sdkOptions.suilend)
    tx.moveCall({
      target: this.target('remove_tpsl_level'),
      typeArguments: [lending_market_type, base_coin_type, quote_coin_type],
      arguments: [
        tx.object(this.versionedId),
        tx.object(order_id),
        tx.object(order_cap_id),
        tx.pure.u64(target_id),
        tx.object(CLOCK_ADDRESS),
      ],
    })
    return tx
  }

  async claimSettlement(options: TsplClaimSettlementOptions, tx: Transaction): Promise<TsplClaimSettlementResult> {
    const {
      order_id,
      order_cap_id,
      reward_coin_types,
      position_id,
      is_long,
      order_book_id,
      base_coin_type,
      quote_coin_type,
      transfer_coin_to_sender = true,
    } = options
    const baseCoin = tx.moveCall({
      target: this.target('claim_settlement'),
      typeArguments: [base_coin_type],
      arguments: [tx.object(this.versionedId), tx.object(order_id), tx.object(order_cap_id)],
    })

    const quoteCoin = tx.moveCall({
      target: this.target('claim_settlement'),
      typeArguments: [quote_coin_type],
      arguments: [tx.object(this.versionedId), tx.object(order_id), tx.object(order_cap_id)],
    })

    if (transfer_coin_to_sender) {
      tx.transferObjects([baseCoin], this._sdk.getSenderAddress())
      tx.transferObjects([quoteCoin], this._sdk.getSenderAddress())
    }

    const closeResult = await this._sdk.PositionModules.positionClose(
      {
        position_id: position_id,
        is_quote: is_long ? false : true,
        slippage: 0.01,
        leverage: 1,
        swap_clmm_pool: '',
        transfer_coins_to_sender: transfer_coin_to_sender,
        reward_coin_types,
      },
      tx
    )

    this.closeOrder(
      {
        order_id: order_id,
        order_cap_id: order_cap_id,
        base_coin_type: base_coin_type,
        quote_coin_type: quote_coin_type,
        order_book_id: order_book_id,
      },
      tx
    )

    if (transfer_coin_to_sender) {
      return tx
    }

    if (closeResult instanceof Transaction) {
      throw new Error('claimSettlement: expected positionClose coin buckets when transfer_coin_to_sender is false')
    }

    const { base_coin: closeBase, quote_coin: closeQuote, reward_coins: closeRewardCoins = [] } = closeResult
    if (closeBase) tx.mergeCoins(baseCoin, [closeBase])
    if (closeQuote) tx.mergeCoins(quoteCoin, [closeQuote])

    const rewardBuckets = new Map<string, TransactionObjectArgument>()
    const collectReward = (coin: TransactionObjectArgument, coin_type: string) => {
      if (coin_type === base_coin_type) {
        tx.mergeCoins(baseCoin, [coin])
        return
      }
      if (coin_type === quote_coin_type) {
        tx.mergeCoins(quoteCoin, [coin])
        return
      }
      const existing = rewardBuckets.get(coin_type)
      if (existing) tx.mergeCoins(existing, [coin])
      else rewardBuckets.set(coin_type, coin)
    }
    closeRewardCoins.forEach(({ coin, coin_type }) => collectReward(coin, coin_type))

    const reward_coins = [...rewardBuckets.entries()].map(([coin_type, coin]) => ({ coin, coin_type }))
    return { tx, base_coin: baseCoin, quote_coin: quoteCoin, reward_coins }
  }

  reclaimCapFromCompletedOrderAndReturnCap(options: TsplReclaimCapFromCompletedOrderOptions, tx: Transaction) {
    const { order_id, order_cap_id, base_coin_type, quote_coin_type } = options
    const { lending_market_type } = getPackagerConfigs(this._sdk.sdkOptions.suilend)
    return tx.moveCall({
      target: this.target('reclaim_cap_from_completed_order_and_return_cap'),
      typeArguments: [lending_market_type, base_coin_type, quote_coin_type],
      arguments: [tx.object(this.versionedId), tx.object(order_id), tx.object(order_cap_id)],
    })
  }

  deposit(options: TsplPositionDepositOptions, tx: Transaction) {
    const { order_id, order_cap_id, market_id, deposit_coin, deposit_coin_type, deposit_reserve_array_index } = options
    const { lendingMarketType } = this.lendingMarketConfig()
    const [versioned, order, orderCap, tradingConfig, lendingMarket, tradingVersionedId] = this.orderPositionArgs(
      tx,
      order_id,
      order_cap_id
    )
    tx.moveCall({
      target: this.target('deposit'),
      typeArguments: [lendingMarketType, deposit_coin_type],
      arguments: [
        versioned,
        order,
        orderCap,
        tradingConfig,
        lendingMarket,
        tx.object(market_id),
        deposit_coin,
        tx.pure.u64(deposit_reserve_array_index),
        tx.object(CLOCK_ADDRESS),
        tx.object(tradingVersionedId),
      ],
    })
    return tx
  }

  borrow(options: TsplPositionBorrowOptions, tx: Transaction) {
    const { order_id, order_cap_id, market_id, borrow_coin_type, reserve_array_index, amount } = options
    const { lendingMarketType } = this.lendingMarketConfig()
    const [versioned, order, orderCap, tradingConfig, lendingMarket, tradingVersionedId] = this.orderPositionArgs(
      tx,
      order_id,
      order_cap_id
    )
    return tx.moveCall({
      target: this.target('borrow'),
      typeArguments: [lendingMarketType, borrow_coin_type],
      arguments: [
        versioned,
        order,
        orderCap,
        tradingConfig,
        lendingMarket,
        tx.object(market_id),
        tx.pure.u64(reserve_array_index),
        tx.pure.u64(amount),
        tx.object(SUI_SYSTEM_STATE_OBJECT_ID),
        tx.object(CLOCK_ADDRESS),
        tx.object(tradingVersionedId),
      ],
    })
  }

  repay(options: TsplPositionRepayOptions, tx: Transaction) {
    const { order_id, order_cap_id, market_id, repay_coin, repay_coin_type, repay_reserve_array_index } = options
    const { lendingMarketType } = this.lendingMarketConfig()
    const [versioned, order, orderCap, tradingConfig, lendingMarket, tradingVersionedId] = this.orderPositionArgs(
      tx,
      order_id,
      order_cap_id
    )
    tx.moveCall({
      target: this.target('repay'),
      typeArguments: [lendingMarketType, repay_coin_type],
      arguments: [
        versioned,
        order,
        orderCap,
        tradingConfig,
        lendingMarket,
        tx.object(market_id),
        repay_coin,
        tx.pure.u64(repay_reserve_array_index),
        tx.object(CLOCK_ADDRESS),
        tx.object(tradingVersionedId),
      ],
    })
    return tx
  }

  withdraw(options: TsplPositionWithdrawOptions, tx: Transaction) {
    const { order_id, order_cap_id, market_id, rate_limiter_exemption, withdraw_coin_type, withdraw_reserve_array_index, amount } = options
    const { lendingMarketType } = this.lendingMarketConfig()
    const { package_id } = this._sdk.sdkOptions.suilend
    const [versioned, order, orderCap, tradingConfig, lendingMarket, tradingVersionedId] = this.orderPositionArgs(
      tx,
      order_id,
      order_cap_id
    )
    const exemption =
      rate_limiter_exemption ??
      tx.moveCall({
        target: `0x1::option::none`,
        typeArguments: [`${package_id}::lending_market::RateLimiterExemption<${lendingMarketType}, ${withdraw_coin_type}>`],
        arguments: [],
      })

    return tx.moveCall({
      target: this.target('withdraw'),
      typeArguments: [lendingMarketType, withdraw_coin_type],
      arguments: [
        versioned,
        order,
        orderCap,
        tradingConfig,
        lendingMarket,
        tx.object(market_id),
        exemption,
        tx.pure.u64(amount),
        tx.pure.u64(withdraw_reserve_array_index),
        tx.object(SUI_SYSTEM_STATE_OBJECT_ID),
        tx.object(CLOCK_ADDRESS),
        tx.object(tradingVersionedId),
      ],
    })
  }

  claimRewards(options: TsplPositionClaimRewardsOptions, tx: Transaction) {
    const { order_id, order_cap_id, market_id, reward_coin_type, reserve_id, reward_index, is_deposit_reward } = options
    const { lendingMarketType } = this.lendingMarketConfig()
    const [versioned, order, orderCap, tradingConfig, lendingMarket, tradingVersionedId] = this.orderPositionArgs(
      tx,
      order_id,
      order_cap_id
    )
    return tx.moveCall({
      target: this.target('claim_rewards'),
      typeArguments: [lendingMarketType, reward_coin_type],
      arguments: [
        versioned,
        order,
        orderCap,
        tradingConfig,
        lendingMarket,
        tx.object(market_id),
        tx.pure.u64(reserve_id),
        tx.pure.u64(reward_index),
        tx.pure.bool(is_deposit_reward),
        tx.object(CLOCK_ADDRESS),
        tx.object(tradingVersionedId),
      ],
    })
  }

  compoundDebt(options: TsplPositionCompoundDebtOptions, tx: Transaction) {
    const { order_id, order_cap_id, market_id, borrow_reserve_array_index, borrow_index } = options
    const { lendingMarketType, lendingMarketId } = this.lendingMarketConfig()
    return tx.moveCall({
      target: this.target('compound_debt'),
      typeArguments: [lendingMarketType],
      arguments: [
        tx.object(this.versionedId),
        tx.object(order_id),
        tx.object(order_cap_id),
        tx.object(lendingMarketId),
        tx.object(market_id),
        tx.pure.u64(borrow_reserve_array_index),
        tx.pure.u64(borrow_index),
      ],
    })
  }
}
