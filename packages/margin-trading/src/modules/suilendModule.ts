import type { CetusMarginTradingSDK } from '../sdk'
import { SuilendClient } from '@suilend/sdk/client'
import {
  initializeSuilend,
  initializeSuilendRewards,
  initializeObligations,
  formatRewards,
  Side,
  getFilteredRewards,
  getStakingYieldAprPercent,
  getDedupedPerDayRewards,
  getDedupedAprRewards,
  getTotalAprPercent,
  getNetAprPercent,
  PerDayRewardSummary,
  AprRewardSummary,
  LST_DECIMALS,
} from '@suilend/sdk'
import { AllAppData, Price } from '../types'
import BigNumber from 'bignumber.js'
import { calculateBorrowAprPercent, calculateDepositAprPercent, getPriceWithFormattedDecimals } from '../utils/suiLend'
import { d, getPackagerConfigs, PythPriceModule, removeHexPrefix } from '@cetusprotocol/common-sdk'
import { Transaction } from '@mysten/sui/transactions'
import { Reserve } from '@suilend/sdk/_generated/suilend/reserve/structs'
import { SUI_DECIMALS, toHex } from '@mysten/sui/utils'
import Decimal from 'decimal.js'
import { SuiLendCoinAprResult } from '../types'
import { handleError, MarginTradingErrorCode } from '../errors/errors'

export class SuiLendModule {
  private sdk: CetusMarginTradingSDK

  // Cache variables
  lendingMarketCache?: AllAppData
  obligationsCache?: Record<string, any>

  // Add suilendClient cache
  private suilendClientCache?: Record<string, SuilendClient>

  private pythPriceModule: PythPriceModule

  constructor(sdk: CetusMarginTradingSDK) {
    this.sdk = sdk
    this.pythPriceModule = new PythPriceModule(this.sdk.FullClient, {
      pyth_package_id: "0x04e20ddf36af412a4096f9014f4a565af9e812db9a05cc40254846cf6ed0ad91",
      pyth_published_at: "0x04e20ddf36af412a4096f9014f4a565af9e812db9a05cc40254846cf6ed0ad91",
      pyth_state_id: "0x1f9310238ee9298fb703c3419030b35b22bb1cc37113e3bb5007c99aec79e5b8",
      wormhole_state_id: "0xaeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c",
      hermes_service_urls: [],
    })
  }

  /**
   * Get or initialize SuilendClient
   * @param lending_market_id Lending market ID
   * @param lending_market_type Lending market type
   */
  async getSuilendClient(lending_market_id: string, lending_market_type: string): Promise<SuilendClient> {
    const cacheKey = `${lending_market_id}_${lending_market_type}`

    if (!this.suilendClientCache) {
      this.suilendClientCache = {}
    }

    if (!this.suilendClientCache[cacheKey]) {
      this.suilendClientCache[cacheKey] = await SuilendClient.initialize(lending_market_id, lending_market_type, this.sdk.FullClient, true)
    }

    return this.suilendClientCache[cacheKey]
  }

  /**
   * Get lending market data (cached)
   * @param force_refresh Whether to force refresh
   */
  async getLendingMarketData(force_refresh = true): Promise<AllAppData> {
    const cacheKey = 'lendingMarketData'
    const cachedData = this.sdk.getCache<AllAppData>(cacheKey, force_refresh)
    if (cachedData) {
      return cachedData
    }

    const lendingMarkets = getPackagerConfigs(this.sdk.sdkOptions?.suilend)?.lending_market || []
    console.log('🚀🚀🚀 ~ suilendModule.ts:67 ~ SuiLendModule ~ getLendingMarketData ~ lendingMarkets:', lendingMarkets)

    if (!lendingMarkets.length) {
      console.warn('⚠️ No lending markets configured.')
      return {} as AllAppData
    }

    try {
      const [allLendingMarketData,
        lstStatsMap,
        sdeUsdAprPercent,
        eThirdAprPercent,
        eEarnAprPercent,
      ] = await Promise.all([
        (async () => {
          const allLendingMarketData: AllAppData['allLendingMarketData'] = Object.fromEntries(
            await Promise.all(
              lendingMarkets.map(async (LENDING_MARKET) => {
                // Use cached SuilendClient
                const suilendClient = await this.getSuilendClient(LENDING_MARKET.id, LENDING_MARKET.type)

                const {
                  lendingMarket,
                  coinMetadataMap,

                  refreshedRawReserves,
                  reserveMap,
                  reserveCoinTypes,
                  reserveCoinMetadataMap,

                  rewardCoinTypes,
                  activeRewardCoinTypes,
                  rewardCoinMetadataMap,
                } = await initializeSuilend(this.sdk.FullClient, suilendClient)

                const { rewardPriceMap } = await initializeSuilendRewards(reserveMap, activeRewardCoinTypes)

                return [
                  LENDING_MARKET.id,
                  {
                    suilendClient,
                    lendingMarket,
                    coinMetadataMap,
                    refreshedRawReserves,
                    reserveMap,
                    reserveCoinTypes,
                    reserveCoinMetadataMap,
                    rewardPriceMap,
                    rewardCoinTypes,
                    activeRewardCoinTypes,
                    rewardCoinMetadataMap,
                  },
                ]
              })
            )
          )
          return allLendingMarketData
        })(),
        (async () => {
          try {
            const res = await fetch(`${this.sdk.sdkOptions?.suilend?.config?.api_url}/springsui/lst-info`)
            const json: Record<
              string,
              {
                LIQUID_STAKING_INFO: any;
                liquidStakingInfo: any;
                weightHook: any;
                apy: string;
              }
            > = await res.json()
            if ((res as any)?.statusCode === 500) throw new Error('Failed to fetch SpringSui LSTs')

            return Object.fromEntries(
              Object.entries(json).map(
                ([
                  coinType,
                  { LIQUID_STAKING_INFO, liquidStakingInfo, weightHook, apy },
                ]) => {
                  // Staking info
                  const totalSuiSupply = new BigNumber(
                    liquidStakingInfo.storage.totalSuiSupply.toString(),
                  ).div(10 ** SUI_DECIMALS);
                  const totalLstSupply = new BigNumber(
                    liquidStakingInfo.lstTreasuryCap.totalSupply.value.toString(),
                  ).div(10 ** LST_DECIMALS);

                  const lstToSuiExchangeRate = !totalLstSupply.eq(0)
                    ? totalSuiSupply.div(totalLstSupply)
                    : new BigNumber(1);

                  return [
                    coinType,
                    {
                      lstToSuiExchangeRate,
                      aprPercent: new BigNumber(apy),
                    },
                  ];
                },
              ),
            );
          } catch (err) {
            console.error(err)
            return {}
          }
        })(),
        (async () => {
          return undefined; // Deprecated
          // try {
          //   const url = `${API_URL}/elixir/apy`;
          //   const res = await fetch(url);
          //   const json: {
          //     data: {
          //       apy: number;
          //     };
          //   } = await res.json();

          //   return new BigNumber(json.data.apy);
          // } catch (err) {
          //   console.error(err);
          //   return undefined;
          // }
        })(),
        (async () => {
          try {
            const url = `${this.sdk.sdkOptions?.suilend?.config?.api_url}/ember/apy`;
            const res = await fetch(url);
            const json: {
              data: {
                apy: number;
              };
            } = await res.json();

            return new BigNumber(json.data.apy).times(100);
          } catch (err) {
            console.error(err);
            return undefined;
          }
        })(),
        (async () => {
          try {
            // const url = `${API_URL}/ember/apy`;
            // const res = await fetch(url);
            // const json: {
            //   data: {
            //     apy: number;
            //   };
            // } = await res.json();

            // return new BigNumber(json.data.apy).times(100);
            return new BigNumber(13.6472884);
          } catch (err) {
            console.error(err);
            return undefined;
          }
        })(),
        // Pyth price identifier -> symbol map (won't throw on error)


      ])

      const data = {
        allLendingMarketData,
        lstStatsMap,
        sdeUsdAprPercent,
        eThirdAprPercent,
        eEarnAprPercent,
      }

      // Store in cache
      this.sdk.updateCache(cacheKey, data, 30 * 1000)

      return data
    } catch (error) {
      console.log('🚀 getLendingMarketData error:', error)
      throw error
    }
  }

  /**
   * Get obligations data (cached)
   * @param all_app_data Lending market data (optional)
   * @param force_refresh Whether to force refresh
   */
  async getInitializeObligations(all_app_data?: AllAppData, force_refresh = false): Promise<any> {
    if (!force_refresh && this.obligationsCache) {
      return this.obligationsCache
    }

    if (!all_app_data) {
      all_app_data = await this.getLendingMarketData(false)
    }

    const result: Record<string, any> = {}
    for (const appData of Object.values(all_app_data.allLendingMarketData)) {
      const { obligationOwnerCaps, obligations } = await initializeObligations(
        this.sdk.FullClient,
        appData.suilendClient,
        appData.refreshedRawReserves,
        appData.reserveMap,
        this.sdk.senderAddress
      )

      if (obligations.length > 0) {
        console.log(
          '🚀🚀🚀 ~ suilendModule.ts:181 ~ SuiLendModule ~ getInitializeObligations ~ obligations:',
          obligations[0].original.allowedBorrowValueUsd.value.toString()
        )
      }

      const rewardMap = formatRewards(
        appData.reserveMap,
        appData.rewardCoinMetadataMap,
        appData.rewardPriceMap as Record<string, BigNumber | undefined>,
        obligations
      )

      result[appData.lendingMarket.id] = {
        obligationOwnerCaps,
        obligations,
        rewardMap,
      }
    }

    // Store in cache
    this.obligationsCache = result

    return this.obligationsCache
  }

  getCoinAprByAmount = async (coin_type: string, amount: Decimal, side: Side): Promise<SuiLendCoinAprResult> => {
    const changeAmount = new BigNumber(amount.toString())
    const lendingMarketData = await this.getLendingMarketData(false)
    const { allLendingMarketData, lstStatsMap, sdeUsdAprPercent, eThirdAprPercent, eEarnAprPercent } = lendingMarketData
    await this.getInitializeObligations(lendingMarketData, true)
    if (!allLendingMarketData || !lstStatsMap) {
      throw new Error('lendingMarketCache is not initialized')
    }

    const list: any = Object.values(allLendingMarketData ?? {})[0]
    const reserve = list.lendingMarket.reserves.find((r: any) => r.coinType === coin_type)
    if (!reserve) {
      throw new Error('reserve not found')
    }
    const currentUserData = this.obligationsCache?.[list.lendingMarket.id]
    const rewards = currentUserData.rewardMap[reserve.token.coinType]?.[side] ?? []

    const filteredRewards = getFilteredRewards(rewards)

    const stakingYieldAprPercent = getStakingYieldAprPercent(side, reserve.coinType, lstStatsMap, sdeUsdAprPercent, eThirdAprPercent)

    const aprPercent = side === Side.DEPOSIT ? reserve.depositAprPercent : reserve.borrowAprPercent
    let newAprPercent: BigNumber | undefined = aprPercent

    let rewardsAprMultiplier = new BigNumber(1)
    let isRewardsAprMultiplierValid = true

    const showChange = side !== undefined && changeAmount !== undefined && changeAmount.gt(0)
    if (showChange) {
      const newReserve = {
        ...reserve,
        depositedAmount:
          side === Side.DEPOSIT
            ? BigNumber.max(reserve.depositedAmount.plus(side === Side.DEPOSIT ? changeAmount : changeAmount.negated()), 0)
            : reserve.depositedAmount,
        borrowedAmount:
          side === Side.BORROW
            ? BigNumber.max(reserve.borrowedAmount.plus(side === Side.BORROW ? changeAmount : changeAmount.negated()), 0)
            : reserve.borrowedAmount,
      }
      newAprPercent = side === Side.DEPOSIT ? calculateDepositAprPercent(newReserve) : calculateBorrowAprPercent(newReserve)

      const totalAmount = side === Side.DEPOSIT ? reserve.depositedAmount : reserve.borrowedAmount
      const newTotalAmount = side === Side.DEPOSIT ? newReserve.depositedAmount : newReserve.borrowedAmount

      // Assumes LM rewards are distributed proportionally to the reserve size
      rewardsAprMultiplier = newTotalAmount.eq(0) ? new BigNumber(-1) : totalAmount.div(newTotalAmount)
      isRewardsAprMultiplierValid = !rewardsAprMultiplier.eq(-1)
    }

    // Per day rewards
    const perDayRewards = getDedupedPerDayRewards(filteredRewards)
    const newPerDayRewards = perDayRewards.map((r) => ({
      ...r,
      stats: {
        ...r.stats,
        perDay: isRewardsAprMultiplierValid ? r.stats.perDay.times(rewardsAprMultiplier) : undefined,
      },
    })) as PerDayRewardSummary[]

    // APR rewards
    const aprRewards = getDedupedAprRewards(filteredRewards)
    const newAprRewards = aprRewards.map((r) => ({
      ...r,
      stats: {
        ...r.stats,
        aprPercent: isRewardsAprMultiplierValid ? r.stats.aprPercent.times(rewardsAprMultiplier) : undefined,
      },
    })) as AprRewardSummary[]

    // Total APR
    const totalAprPercent = getTotalAprPercent(side, aprPercent, filteredRewards, stakingYieldAprPercent)
    const newTotalAprPercent =
      newAprPercent === undefined || newAprRewards.some((reward) => reward.stats.aprPercent === undefined)
        ? undefined
        : getTotalAprPercent(side, newAprPercent, newAprRewards, stakingYieldAprPercent)
    console.log('🚀🚀🚀 ~ suilendModule.ts:315 ~ SuiLendModule ~ newTotalAprPercent:', newTotalAprPercent?.toString())

    return {
      new_total_apr_percent: newTotalAprPercent?.toString(),
      total_apr_percent: totalAprPercent.toString(),
    }
  }

  /**
   * Get user lending data
   * @param obligation_id Obligation ID (optional)
   * @param force_refresh Whether to force refresh
   */
  async getSuiLendUserData(obligation_id: string, force_refresh = false) {
    const lendingMarketData = await this.getLendingMarketData(false)
    const { allLendingMarketData, lstStatsMap, sdeUsdAprPercent, eThirdAprPercent, eEarnAprPercent } = lendingMarketData
    const obligations = await this.getInitializeObligations(lendingMarketData, false)
    const { lending_market_id } = getPackagerConfigs(this.sdk.sdkOptions?.suilend)

    const userData = obligations[lending_market_id]
    if (!userData) {
      throw new Error(`No user data found for lending market: ${lending_market_id}`)
    }
    const obligation = userData.obligations.find((o: any) => o.id === obligation_id)
    if (!obligation) {
      throw new Error(`Obligation not found: ${obligation_id}`)
    }

    const netAprPercent = getNetAprPercent(obligation, userData.rewardMap, lstStatsMap ?? {}, sdeUsdAprPercent, eThirdAprPercent)

    return {
      obligation,
      netAprPercent,
      deposits: obligation.deposits,
      borrowedAmount: obligation.borrowedAmount,
      depositedAmount: obligation.depositedAmount,
      netValueUsd: obligation.netValueUsd,
      rewardMap: userData.rewardMap,
    }
  }

  // Update contract oracle price
  refreshReservePrice = async (tx: Transaction, price_object_id: string, reserve_array_index: bigint) => {
    const { lending_market_id, lending_market_type } = getPackagerConfigs(this.sdk.sdkOptions?.suilend)
    const cacheKey = `${lending_market_id}_${lending_market_type}`
    if (!this.suilendClientCache) {
      throw new Error('suilendClientCache is not initialized')
    }
    const priceInfoObjectId = await this.pythPriceModule.getPriceFeedObjectId(price_object_id)

    this.suilendClientCache[cacheKey].refreshReservePrices(tx, priceInfoObjectId as string, reserve_array_index)
  }

  // Get oracle price
  getLatestPriceFeeds = async (reserves: Reserve<string>[], force_refresh = false) => {
    const { lending_market_id, lending_market_type } = getPackagerConfigs(this.sdk.sdkOptions?.suilend)

    const priceMap: Record<string, Price> = {}
    const notFindList = []
    reserves.forEach((item) => {
      const data = this.sdk.getCache<Price>(`getLatestPrice_${item.coinType.name}`, force_refresh)
      if (data && this.priceCheck(data, 60)) {
        priceMap[item.coinType.name] = data
      } else {
        notFindList.push(item.coinType.name)
      }
    })
    if (notFindList.length == 0) {
      return priceMap
    }

    const cacheKey = `${lending_market_id}_${lending_market_type}`
    if (!this.suilendClientCache) {
      throw new Error('suilendClient is not initialized')
    }
    const priceIdentifiers = Array.from(
      new Set(
        reserves.map((r) =>
          r?.priceIdentifier?.bytes ? toHex(new Uint8Array(r.priceIdentifier.bytes)) : removeHexPrefix(r.priceIdentifier.toString())
        )
      )
    )
    const priceUpdateData = await this.pythPriceModule.getLatestPriceFeeds(priceIdentifiers as string[])

    priceUpdateData?.parsed?.forEach((priceFeed, index) => {

      if (priceFeed) {
        const { price, expo, publish_time } = priceFeed.price
        // Adjust the price based on the exponent (decimals)
        const realPrice = d(price)
          .mul(d(10).pow(d(expo)))
          .toString()
        const info: any = reserves[index]
        const data: Price = {
          coin_type: info.coinType.name || info.coinType,
          price: realPrice,
          oracle_price: 0n,
          last_update_time: publish_time,
        }
        // Calculate the formatted oracle price and update the map
        data.oracle_price = getPriceWithFormattedDecimals(BigInt(price), BigInt(expo))
        priceMap[info.coinType.name || info.coinType] = data
        this.sdk.updateCache(`getLatestPrice_${data.coin_type}`, data)
      }
    })
    return priceMap
  }

  getLatestPriceFeedsByCoinTypes = async (coin_types: string[], force_refresh = false) => {
    try {
      const { lending_market_id } = getPackagerConfigs(this.sdk.sdkOptions?.suilend)
      const { allLendingMarketData } = await this.getLendingMarketData(false)
      const reservesInfo: Reserve<string>[] = []
      coin_types.forEach((coinType) => {
        const reserve: any = allLendingMarketData[lending_market_id].reserveMap[coinType]
        reservesInfo.push(reserve)
      })
      const priceMap = await this.getLatestPriceFeeds(reservesInfo, force_refresh)
      return priceMap
    } catch (error) {
      handleError(MarginTradingErrorCode.FetchError, error as Error)
      return undefined
    }
  }

  priceCheck(price: Price, age = 60) {
    const currentTime = Math.floor(Date.now() / 1000)
    if (Math.abs(currentTime - price.last_update_time) > age) {
      return undefined
    }

    return price
  }

  // Get suiLend reserve information
  getSuiLendReserveInfo = async (
    base_token: string,
    quote_token: string,
    all_lending_market_data?: AllAppData['allLendingMarketData'],
    other_token?: string[]
  ) => {
    const { lending_market_id } = getPackagerConfigs(this.sdk.sdkOptions?.suilend)

    // If no data is passed, fetch it (using cache)
    if (!all_lending_market_data) {
      const data = await this.getLendingMarketData(false)
      all_lending_market_data = data.allLendingMarketData
    }

    const baseReserve = all_lending_market_data[lending_market_id].reserveMap[base_token]
    const quoteReserve = all_lending_market_data[lending_market_id].reserveMap[quote_token]
    const refreshedBaseRawReserves = all_lending_market_data[lending_market_id].refreshedRawReserves.filter((r: any) => {
      return r.coinType.name == removeHexPrefix(base_token)
    })
    const refreshedQuoteRawReserves = all_lending_market_data[lending_market_id].refreshedRawReserves.filter((r: any) => {
      return r.coinType.name == removeHexPrefix(quote_token)
    })
    const baseReserveMapInfo = all_lending_market_data[lending_market_id].reserveMap[base_token]
    const quoteReserveMapInfo = all_lending_market_data[lending_market_id].reserveMap[quote_token]

    let refreshedOtherRawReserves: Reserve<string>[] = []
    if (other_token) {
      other_token.forEach((token) => {
        const reserve = all_lending_market_data[lending_market_id].refreshedRawReserves.filter((r: any) => {
          return r.coinType.name == removeHexPrefix(token)
        })
        refreshedOtherRawReserves.push(...reserve)
      })
    }

    return {
      base_reserve_array_index: baseReserve.arrayIndex.toString(),
      quote_reserve_array_index: quoteReserve.arrayIndex.toString(),
      reserve: [refreshedBaseRawReserves[0], refreshedQuoteRawReserves[0], ...refreshedOtherRawReserves],
      base_reserve_map_info: baseReserveMapInfo,
      quote_reserve_map_info: quoteReserveMapInfo,
    }
  }

  refreshReservePrices = async (tx: Transaction, reserve: Reserve<string>[]) => {
    for (let i = 0; i < reserve.length; i++) {
      const priceObjectId = toHex(new Uint8Array(reserve[i].priceIdentifier.bytes))
      await this.refreshReservePrice(tx, priceObjectId, BigInt(reserve[i].arrayIndex))
    }
  }

  refreshReservePricesV2 = async (tx: Transaction, reserve: Reserve<string>[]) => {
    for (let i = 0; i < reserve.length; i++) {
      const priceObjectId = reserve[i].priceIdentifier.toString()
      await this.refreshReservePrice(tx, priceObjectId, BigInt(reserve[i].arrayIndex))
    }
  }
}
