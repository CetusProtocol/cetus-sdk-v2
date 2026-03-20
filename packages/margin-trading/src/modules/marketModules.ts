import { CACHE_TIME_5MIN, d, getPackagerConfigs } from '@cetusprotocol/common-sdk'
import { CetusMarginTradingSDK } from '../sdk'
import {
  CreateMarketParams,
  MarginTradingConfigs,
  Market,
  MarketSuilendInfo,
  UpdateMarketFeeRateParams,
  UpdateMarketMaxLeverageParams,
} from '../types'
import { Transaction } from '@mysten/sui/transactions'
import { wrapMarketInfo } from '../utils'
import { getFilteredRewards, getStakingYieldAprPercent, getTotalAprPercent, Side } from '@suilend/sdk'
import { handleError, MarginTradingErrorCode } from '../errors/errors'

export class MarketModules {
  protected _sdk: CetusMarginTradingSDK

  constructor(sdk: CetusMarginTradingSDK) {
    this._sdk = sdk
  }

  createMarket = async (params: CreateMarketParams) => {
    const { package_id } = this._sdk.sdkOptions.margin_trading
    const { versioned_id, admin_cap_id, markets, global_config_id } = getPackagerConfigs(this._sdk.sdkOptions.margin_trading)
    const tx = new Transaction()
    tx.moveCall({
      target: `${package_id}::market::create_market`,
      arguments: [
        tx.object(admin_cap_id),
        tx.object(global_config_id),
        tx.object(markets),
        tx.pure.u64(params.open_fee_rate),
        tx.pure.u64(params.close_fee_rate),
        tx.object(versioned_id),
      ],
      typeArguments: [params.base_token, params.quote_token],
    })
    return tx
  }

  updateMarketFeeRate = async (params: UpdateMarketFeeRateParams) => {
    const { package_id } = this._sdk.sdkOptions.margin_trading
    const { versioned_id, admin_cap_id } = getPackagerConfigs(this._sdk.sdkOptions.margin_trading)
    const { market_id, open_fee_rate, close_fee_rate } = params
    const tx = new Transaction()
    tx.moveCall({
      target: `${package_id}::market::set_fee_rate`,
      arguments: [
        tx.object(admin_cap_id),
        tx.object(market_id),
        tx.pure.u64(open_fee_rate),
        tx.pure.u64(close_fee_rate),
        tx.object(versioned_id),
      ],
      typeArguments: [],
    })
    return tx
  }

  claimMarketFees = async (market_id: string, txb?: Transaction) => {
    const { package_id } = this._sdk.sdkOptions.margin_trading
    const { versioned_id, admin_cap_id } = getPackagerConfigs(this._sdk.sdkOptions.margin_trading)
    const tx = txb || new Transaction()
    const { base_token, quote_token } = await this._sdk.MarketModules.getMarketInfo(market_id)
    tx.moveCall({
      target: `${package_id}::market::claim_fees`,
      arguments: [tx.object(admin_cap_id), tx.object(market_id), tx.object(versioned_id)],
      typeArguments: [base_token, quote_token],
    })
    return tx
  }

  claimAllMarketFees = async (market_ids: string[]) => {
    const tx = new Transaction()
    for (let i = 0; i < market_ids.length; i++) {
      const market_id = market_ids[i]
      this.claimMarketFees(market_id, tx)
    }
    return tx
  }

  /**
   * Get margin trading contract config information
   */
  getMarginTradingConfig = async (): Promise<MarginTradingConfigs> => {
    const { package_id } = this._sdk.sdkOptions.margin_trading
    try {
      const initVersionedEvent: any = await this._sdk.FullClient.queryEventsByPage({ MoveEventType: `${package_id}::versioned::InitEvent` })
      const initAdminCapEvent: any = await this._sdk.FullClient.queryEventsByPage({ MoveEventType: `${package_id}::admin_cap::InitEvent` })
      const initGlobalConfigEvent: any = await this._sdk.FullClient.queryEventsByPage({ MoveEventType: `${package_id}::config::InitEvent` })
      const initMarketEvent: any = await this._sdk.FullClient.queryEventsByPage({ MoveEventType: `${package_id}::market::InitEvent` })
      const markets = initMarketEvent.data[0].parsedJson.markets_id
      const marketsObject: any = await this._sdk.FullClient.getObject({ id: markets, options: { showContent: true } })
      const marketsTableId = marketsObject.data.content.fields.list.fields.id.id
      return {
        versioned_id: initVersionedEvent.data[0].parsedJson.versioned_id,
        admin_cap_id: initAdminCapEvent.data[0].parsedJson.admin_cap_id,
        global_config_id: initGlobalConfigEvent.data[0].parsedJson.global_config_id,
        markets,
        markets_table_id: marketsTableId,
      }
    } catch (error) {
      handleError(MarginTradingErrorCode.FetchError, error as Error)
      return {
        versioned_id: '',
        admin_cap_id: '',
        global_config_id: '',
        markets_table_id: '',
        markets: '',
      }
    }
  }

  /**
   * Get margin trading market list
   */
  getMarketList = async (force_refresh = false): Promise<Market[]> => {
    const cacheKey = 'margin_trading_markets_list'

    // Try to get data from cache
    const cachedData = this._sdk.getCache<any[]>(cacheKey, force_refresh)
    if (cachedData) {
      return cachedData
    }

    const { package_id } = this._sdk.sdkOptions.margin_trading
    const marketList: Market[] = []
    try {
      const moveEventType = `${package_id}::market::CreateMarketEvent`
      const objects = await this._sdk.FullClient.queryEventsByPage({ MoveEventType: moveEventType })
      const warpIds = objects.data.map((object) => (object.parsedJson as any).market_id)
      if (warpIds.length > 0) {
        const res = await this._sdk.FullClient.batchGetObjects(warpIds, { showContent: true, showType: true })
        res.forEach((item) => {
          const marketInfo = wrapMarketInfo(item)
          const cacheKey = `margin_trading_market_info_${marketInfo.market_id}`
          this._sdk.updateCache(cacheKey, marketInfo)
          marketList.push(marketInfo)
        })
        return marketList
      } else {
        handleError(MarginTradingErrorCode.MarketNotFound, 'Market not found')
        return []
      }
    } catch (error) {
      handleError(MarginTradingErrorCode.FetchError, error as Error)
      return []
    }
  }

  /**
   * Get margin trading market information
   */
  getMarketInfo = async (market_id: string, force_refresh = false): Promise<Market> => {
    const cacheKey = `margin_trading_market_info_${market_id}`
    const cachedData = this._sdk.getCache<any>(cacheKey, force_refresh)
    if (cachedData) {
      return cachedData
    }
    try {
      const result = await this._sdk.FullClient.getObject({
        id: market_id,
        options: {
          showContent: true,
        },
      })
      const marketInfo = wrapMarketInfo(result)
      this._sdk.updateCache(cacheKey, marketInfo, CACHE_TIME_5MIN)
      return marketInfo
    } catch (error) {
      handleError(MarginTradingErrorCode.FetchError, error as Error)
      return {} as Market
    }
  }

  /** Get margin trading market Suilend information */
  getMarketSuilendInfo = async (market_id: string): Promise<MarketSuilendInfo> => {
    try {
      const { base_token, quote_token } = await this.getMarketInfo(market_id)
      const { lending_market_id } = getPackagerConfigs(this._sdk.sdkOptions.suilend)
      const lendingMarketData = await this._sdk.SuiLendModule.getLendingMarketData(true)
      const { allLendingMarketData, lstStatsMap, sdeUsdAprPercent, eThirdAprPercent, eEarnAprPercent } = lendingMarketData
      const { base_reserve_map_info, quote_reserve_map_info } = await this._sdk.SuiLendModule.getSuiLendReserveInfo(
        base_token,
        quote_token,
        allLendingMarketData
      )
      console.log('🚀🚀🚀 ~ marketModules.ts:188 ~ MarketModules ~ base_reserve_map_info:', base_reserve_map_info)
      const obligations = await this._sdk.SuiLendModule.getInitializeObligations(lendingMarketData, true)

      const baseRewards = obligations[lending_market_id].rewardMap[base_token]
      const quoteRewards = obligations[lending_market_id].rewardMap[quote_token]

      const {
        depositedAmountUsd: baseDepositedAmountUsd,
        borrowedAmountUsd: baseBorrowedAmountUsd,
        depositAprPercent: baseDepositAprPercent,
        borrowAprPercent: baseBorrowAprPercent,
        depositedAmount: baseDepositedAmount,
        borrowedAmount: baseBorrowedAmount,
      } = base_reserve_map_info
      const { depositLimit: baseDepositLimit, borrowLimit: baseBorrowLimit } = base_reserve_map_info.config
      const {
        depositedAmountUsd: quoteDepositedAmountUsd,
        borrowedAmountUsd: quoteBorrowedAmountUsd,
        depositAprPercent: quoteDepositAprPercent,
        borrowAprPercent: quoteBorrowAprPercent,
        depositedAmount: quoteDepositedAmount,
        borrowedAmount: quoteBorrowedAmount,
      } = quote_reserve_map_info
      const { depositLimit: quoteDepositLimit, borrowLimit: quoteBorrowLimit } = quote_reserve_map_info.config
      const baseTotalDepositAprPercent = getTotalAprPercent(
        Side.DEPOSIT,
        baseDepositAprPercent,
        getFilteredRewards(baseRewards.deposit),
        getStakingYieldAprPercent(Side.DEPOSIT, base_token, lstStatsMap, sdeUsdAprPercent, eThirdAprPercent)
      )
      const baseTotalBorrowAprPercent = getTotalAprPercent(Side.BORROW, baseBorrowAprPercent, getFilteredRewards(baseRewards.borrow))

      const quoteTotalDepositAprPercent = getTotalAprPercent(
        Side.DEPOSIT,
        quoteDepositAprPercent,
        getFilteredRewards(quoteRewards.deposit),
        getStakingYieldAprPercent(Side.DEPOSIT, base_token, lstStatsMap, sdeUsdAprPercent, eThirdAprPercent)
      )
      const quoteTotalBorrowAprPercent = getTotalAprPercent(Side.BORROW, quoteBorrowAprPercent, getFilteredRewards(quoteRewards.borrow))

      const longLiquidity = d(quoteDepositedAmountUsd.toString()).sub(quoteBorrowedAmountUsd.toString()).toString()
      const shortLiquidity = d(baseDepositedAmountUsd.toString()).sub(baseBorrowedAmountUsd.toString()).toString()

      const baseTokenAvailableDepositAmount = d(baseDepositLimit.toString()).sub(d(baseDepositedAmount.toString())).toString()
      const baseTokenAvailableBorrowAmount = d(baseBorrowLimit.toString()).sub(d(baseBorrowedAmount.toString())).toString()

      const quoteTokenAvailableDepositAmount = d(quoteDepositLimit.toString()).sub(d(quoteDepositedAmount.toString())).toString()
      const quoteTokenAvailableBorrowAmount = d(quoteBorrowLimit.toString()).sub(d(quoteBorrowedAmount.toString())).toString()

      return {
        long_liquidity: longLiquidity,
        short_liquidity: shortLiquidity,
        base_total_deposit_apr_percent: baseTotalDepositAprPercent.toString(),
        base_total_borrow_apr_percent: baseTotalBorrowAprPercent.toString(),
        quote_total_deposit_apr_percent: quoteTotalDepositAprPercent.toString(),
        quote_total_borrow_apr_percent: quoteTotalBorrowAprPercent.toString(),
        base_token_available_deposit_amount: baseTokenAvailableDepositAmount,
        base_token_available_borrow_amount: baseTokenAvailableBorrowAmount,
        quote_token_available_deposit_amount: quoteTokenAvailableDepositAmount,
        quote_token_available_borrow_amount: quoteTokenAvailableBorrowAmount,
        base_deposit_rewards: getFilteredRewards(baseRewards.deposit),
        quote_deposit_rewards: getFilteredRewards(quoteRewards.deposit),
        base_borrow_rewards: getFilteredRewards(baseRewards.borrow),
        quote_borrow_rewards: getFilteredRewards(quoteRewards.borrow),
        base_deposit_apr_percent: baseDepositAprPercent.toString(),
        base_borrow_apr_percent: baseBorrowAprPercent.toString(),
        quote_deposit_apr_percent: quoteDepositAprPercent.toString(),
        quote_borrow_apr_percent: quoteBorrowAprPercent.toString(),
        obligations: obligations[lending_market_id],
        base_reserve_map_info,
        quote_reserve_map_info,
      }
    } catch (error) {
      handleError(MarginTradingErrorCode.FetchError, error as Error)
      return {} as MarketSuilendInfo
    }
  }
}
