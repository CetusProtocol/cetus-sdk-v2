import {
  BaseError,
  CACHE_TIME_24H,
  CLOCK_ADDRESS,
  CoinAssist,
  d,
  DETAILS_KEYS,
  fromDecimalsAmount,
  getObjectFields,
  getPackagerConfigs,
  removeHexPrefix,
  SUI_SYSTEM_STATE_OBJECT_ID,
  U64_MAX,
} from '@cetusprotocol/common-sdk'
import { CetusMarginTradingSDK } from '../sdk'
import BigNumber from 'bignumber.js'
import {
  BorrowAssetParams,
  CalculateCompoundDebtParams,
  CalculatePositionDepositParams,
  CalculatePositionLeverageParams,
  CalculatePositionRepayParams,
  CalculatePositionWithdrawParams,
  CreateLeveragePositionParams,
  CreateMarginTradingContextParams,
  OpenPositionParams,
  Position,
  PositionCloseWithCoinParams,
  PositionDepositParams,
  PositionManageLeverageParams,
  PositionManageSizeDepositParams,
  PositionManageSizeWithdrawParams,
  PositionRepayParams,
  positionTopUpCTokenParams,
  positionWithdrawCTokenParams,
  RepayParams,
  WithdrawAssetParams,
} from '../types'
import { Transaction, TransactionObjectArgument, TransactionResult } from '@mysten/sui/transactions'
import { bcs } from '@mysten/sui/bcs'
import { v4 as uuidv4 } from 'uuid'
import { mergePositionData, wrapPosition } from '../utils'
import Decimal from 'decimal.js'
import { compoundDebt } from '@suilend/sdk'
import { handleError, MarginTradingErrorCode } from '../errors/errors'
import { is } from 'valibot'
import { calcIncrementalLeverage } from '../utils/suiLend'

export class PositionModules {
  protected _sdk: CetusMarginTradingSDK

  constructor(sdk: CetusMarginTradingSDK) {
    this._sdk = sdk
  }

  /**
   * Get leverage position list
   */
  getPositionList = async (wallet_address = this._sdk.getSenderAddress(), force_refresh = false): Promise<Position[]> => {
    const { lending_market_id, lending_market_type } = getPackagerConfigs(this._sdk.sdkOptions.suilend)
    try {
      // Define mapping cache key
      const mappingCacheKey = `cap_to_position_mapping_${wallet_address}`

      // Try to get mapping relationship from cache
      let capIdToPositionIdMap = this._sdk.getCache<Map<string, string>>(mappingCacheKey, force_refresh)

      const ownerRes = await this._sdk.FullClient.getOwnedObjectsByPage(wallet_address, {
        options: { showType: true, showContent: true, showOwner: true },
        filter: {
          MatchAny: [
            {
              StructType: `${this._sdk.sdkOptions.margin_trading.package_id}::position::PositionCap`,
            },
          ],
        },
      })

      console.log('🚀🚀🚀 ~ positionModules.ts:42 ~ PositionModules ~ ownerRes.data.length:', ownerRes.data.length)
      if (ownerRes.data.length === 0) {
        handleError(MarginTradingErrorCode.PositionNotFound, 'Position not found')
        return []
      }

      const suiLendClient = await this._sdk.SuiLendModule.getSuilendClient(lending_market_id, lending_market_type)
      console.log('🚀🚀🚀 ~ positionModules.ts:48 ~ PositionModules ~ suiLendClient:', suiLendClient)
      const lendingMarketData = await this._sdk.SuiLendModule.getLendingMarketData()
      const { allLendingMarketData, lstStatsMap, sdeUsdAprPercent, eThirdAprPercent, eEarnAprPercent } = lendingMarketData
      console.log('🚀🚀🚀 ~ positionModules.ts:50 ~ PositionModules ~ allLendingMarketData:', allLendingMarketData)
      const reserveMap: any = allLendingMarketData[lending_market_id].reserveMap

      // Rebuild mapping if cache doesn't exist or needs refresh
      if (!capIdToPositionIdMap) {
        capIdToPositionIdMap = new Map<string, string>()
      }

      const positionIdList: string[] = []

      for (let i = 0; i < ownerRes.data.length; i++) {
        const fields = getObjectFields(ownerRes.data[i])
        if (fields.position_id) {
          positionIdList.push(fields.position_id)
        }
        if (fields.id.id) {
          // Store the mapping relationship between capId and positionId
          capIdToPositionIdMap.set(fields.id.id, fields.position_id)
        }
      }

      // Store mapping relationship in cache with 24h expiration time
      await this._sdk.updateCache(mappingCacheKey, capIdToPositionIdMap as any, CACHE_TIME_24H)

      const positionRes = await this._sdk.FullClient.batchGetObjects(positionIdList, { showContent: true })
      console.log('🚀🚀🚀 ~ positionModules.ts:73 ~ PositionModules ~ positionRes:', positionRes)
      const obligations = await this._sdk.SuiLendModule.getInitializeObligations(lendingMarketData, true)
      console.log('🚀🚀🚀 ~ positionModules.ts:75 ~ PositionModules ~ obligations:', obligations)
      const positionList = []

      for (let i = 0; i < positionRes.length; i++) {
        const positionId = positionIdList[i]
        // Use mapping in memory directly instead of reading from cache
        let positionCapId = ''
        for (const [capId, pid] of capIdToPositionIdMap.entries()) {
          if (pid === positionId) {
            positionCapId = capId
            break
          }
        }

        const position = wrapPosition(positionRes[i], positionCapId)
        const rawObligation = await suiLendClient.getObligation(position.obligation_owner_cap)
        const mergeData = mergePositionData(
          position,
          rawObligation,
          reserveMap || {},
          lstStatsMap || {},
          sdeUsdAprPercent,
          eThirdAprPercent,
          eEarnAprPercent,
          obligations[lending_market_id].rewardMap
        )
        const claimableRewards = this.getObligationRewardsInfo(rawObligation, Object.values(reserveMap))
        positionList.push({
          ...mergeData,
          claimable_rewards: claimableRewards,
        })
      }
      return positionList
    } catch (error) {
      handleError(MarginTradingErrorCode.FetchError, error as Error)
      return []
    }
  }

  /**
   * Get leverage position details
   */
  getPositionInfo = async (position_id: string, wallet_address = this._sdk.getSenderAddress(), force_refresh = true): Promise<Position> => {
    // Define mapping cache key
    const mappingCacheKey = `cap_to_position_mapping_${wallet_address}`

    // Try to get mapping relationship from cache
    let capIdToPositionIdMap = this._sdk.getCache<Map<string, string>>(mappingCacheKey, force_refresh)

    // If cache doesn't exist or needs refresh, rebuild mapping
    if (!capIdToPositionIdMap) {
      capIdToPositionIdMap = new Map<string, string>()
    }

    // Get capId from mapping by positionId
    let positionCapId = this.getCapIdByPositionId(position_id, wallet_address) || ''

    if (!positionCapId) {
      const ownerRes = await this._sdk.FullClient.getOwnedObjectsByPage(wallet_address, {
        options: { showType: true, showContent: true, showOwner: true },
        filter: {
          MatchAny: [
            {
              StructType: `${this._sdk.sdkOptions.margin_trading.package_id}::position::PositionCap`,
            },
          ],
        },
      })
      for (let i = 0; i < ownerRes.data.length; i++) {
        const fields = getObjectFields(ownerRes.data[i])
        if (fields.id.id) {
          capIdToPositionIdMap.set(fields.id.id, fields.position_id)
        }
        if (fields.position_id === position_id) {
          positionCapId = fields.id.id
        }
      }
    }
    const positionRes = await this._sdk.FullClient.batchGetObjects([position_id], { showContent: true })
    const position = wrapPosition(positionRes[0], positionCapId || '')
    const { lending_market_id, lending_market_type } = getPackagerConfigs(this._sdk.sdkOptions.suilend)
    const suiLendClient = await this._sdk.SuiLendModule.getSuilendClient(lending_market_id, lending_market_type)
    const lendingMarketData = await this._sdk.SuiLendModule.getLendingMarketData()
    const { allLendingMarketData, lstStatsMap, sdeUsdAprPercent, eThirdAprPercent, eEarnAprPercent } = lendingMarketData
    const reserveMap: any = allLendingMarketData[lending_market_id].reserveMap
    const obligations = await this._sdk.SuiLendModule.getInitializeObligations(lendingMarketData, true)
    const rawObligation = await suiLendClient.getObligation(position.obligation_owner_cap)
    const claimableRewards = this.getObligationRewardsInfo(rawObligation, Object.values(reserveMap))
    const mergeData = mergePositionData(
      position,
      rawObligation,
      reserveMap || {},
      lstStatsMap || {},
      sdeUsdAprPercent,
      eThirdAprPercent,
      eEarnAprPercent,
      obligations[lending_market_id].rewardMap
    )
    const result = {
      ...mergeData,
      claimable_rewards: claimableRewards,
    }

    return result
  }

  private getObligationRewardsInfo(obligationData: any, reserves: any[]) {
    const claimableRewards: any[] = []
    const WAD = new BigNumber(10).pow(18)
    const poolRewardInfoMap: Record<
      string,
      {
        coinType: string
        mintDecimals: number
        isActive: boolean
        reserveType: 'deposit' | 'borrow'
        reserveCoinType: string
        reserveArrayIndex: string
        rewardIndex: string
        globalCumulativePerShare: BigNumber // 全局累积每份奖励
        reserve: any
      }
    > = {}

    const nowMs = Date.now()

    for (const reserve of reserves) {
      const reserveCoinType = reserve.coinType
      const reserveArrayIndex = reserve.arrayIndex.toString()

      // Deposits pool rewards
      const depositsPoolRewards = reserve.depositsPoolRewardManager.poolRewards || []
      for (const pr of depositsPoolRewards) {
        if (!pr) continue
        const id = pr.id
        const coinType = pr.coinType
        const startTimeMs = parseInt(pr.startTimeMs)
        const endTimeMs = parseInt(pr.endTimeMs)
        const isActive = nowMs >= startTimeMs && nowMs < endTimeMs
        const mintDecimals = pr.mintDecimals
        // 获取全局累积每份奖励
        const globalCumulative = BigNumber(pr.cumulativeRewardsPerShare).times(10 ** mintDecimals)
        poolRewardInfoMap[id] = {
          coinType,
          mintDecimals,
          isActive,
          reserveType: 'deposit',
          reserveArrayIndex,
          reserveCoinType,
          globalCumulativePerShare: globalCumulative,
          rewardIndex: pr.rewardIndex,
          reserve,
        }
      }

      // Borrows pool rewards
      const borrowsPoolRewards = reserve.borrowsPoolRewardManager.poolRewards || []
      for (const pr of borrowsPoolRewards) {
        if (!pr) continue
        const id = pr.id
        const coinType = pr.coinType
        const startTimeMs = parseInt(pr.startTimeMs)
        const endTimeMs = parseInt(pr.endTimeMs)
        const isActive = nowMs >= startTimeMs && nowMs < endTimeMs
        const mintDecimals = pr.mintDecimals
        // 获取全局累积每份奖励
        const globalCumulative = BigNumber(pr.cumulativeRewardsPerShare).times(10 ** mintDecimals)
        poolRewardInfoMap[id] = {
          coinType,
          mintDecimals,
          isActive,
          reserveType: 'borrow',
          reserveCoinType,
          reserveArrayIndex,
          rewardIndex: pr.rewardIndex,
          globalCumulativePerShare: globalCumulative,
          reserve,
        }
      }
    }

    const userRewardManagers = obligationData.userRewardManagers
    for (const urm of userRewardManagers) {
      for (let i = 0; i < urm.rewards.length; i++) {
        const reward = urm.rewards[i]
        if (!reward) continue
        const rewardInfo = poolRewardInfoMap[reward.poolRewardId]
        if (!rewardInfo) continue

        // 计算待领取奖励 = share × (global_cumulative - user_cumulative)
        const globalCumulativePerShare = rewardInfo.globalCumulativePerShare
        const userCumulativePerShare = new BigNumber(reward.cumulativeRewardsPerShare.value.toString()).div(WAD)
        const pendingRewards = new BigNumber(urm.share).times(globalCumulativePerShare.minus(userCumulativePerShare))

        // 实际可领取 = 已记录奖励 + 待领取奖励
        const earnedRewards = new BigNumber(reward.earnedRewards.value).div(WAD)
        const actualClaimable = new BigNumber(earnedRewards).plus(pendingRewards)

        const price = rewardInfo.reserve.price
        const earnedRewardsFormatted = actualClaimable.div(10 ** rewardInfo.mintDecimals)

        const earnedRewardsUsd = price ? earnedRewardsFormatted.times(price).toFixed(12) : 0

        if (d(earnedRewardsUsd).gt(0)) {
          claimableRewards.push({
            poolRewardId: reward.poolRewardId,
            coinType: rewardInfo.coinType,
            earnedRewards: actualClaimable.toString(),
            earnedRewardsUsd,
            earnedRewardsFormatted: earnedRewardsFormatted.toFixed(12),
            isActive: rewardInfo.isActive,
            reserveType: rewardInfo.reserveType,
            reserveCoinType: rewardInfo.reserveCoinType,
            reserveArrayIndex: rewardInfo.reserveArrayIndex,
            rewardIndex: rewardInfo.rewardIndex,
            rewardInfo,
          })
        }
      }
    }

    return claimableRewards
  }

  /**
   * Get capId from mapping by positionId
   * @param position_id Position ID
   * @param wallet_address Wallet address
   * @returns capId or undefined
   */
  private getCapIdByPositionId = (position_id: string, wallet_address = this._sdk.getSenderAddress()): string => {
    const mappingCacheKey = `cap_to_position_mapping_${wallet_address}`
    const capIdToPositionIdMap = this._sdk.getCache<Map<string, string>>(mappingCacheKey, false)

    if (!capIdToPositionIdMap) {
      return ''
    }

    // Find the corresponding capId through positionId
    for (const [capId, pid] of capIdToPositionIdMap.entries()) {
      if (pid === position_id) {
        return capId
      }
    }

    return ''
  }

  /**
   * Create leverage position
   */
  private createLeveragePosition(params: CreateLeveragePositionParams) {
    const { lending_market_id, lending_market_type } = getPackagerConfigs(this._sdk.sdkOptions.suilend)
    const { global_config_id, versioned_id } = getPackagerConfigs(this._sdk.sdkOptions.margin_trading)
    const leverageConfig = this._sdk.sdkOptions.margin_trading
    const { leverage, market_id, base_token, quote_token, is_long, init_deposit_amount, tx, init_coin_type } = params
    const position_cap = tx.moveCall({
      target: `${leverageConfig.published_at}::router::open_position`,
      arguments: [
        tx.object(global_config_id),
        tx.object(market_id),
        tx.object(lending_market_id),
        tx.pure.u64(d(leverage).mul(10000).toString()),
        tx.object(CLOCK_ADDRESS),
        tx.object(versioned_id),
      ],
      typeArguments: [lending_market_type, is_long ? base_token : quote_token],
    })

    return position_cap
  }

  /**
   * Deposit asset to leverage position
   */
  private async depositToLeveragePosition(params: PositionDepositParams, tx: Transaction) {
    const { margin_trading: marginTradingConfig } = this._sdk.sdkOptions
    const { lending_market_type, lending_market_id } = getPackagerConfigs(this._sdk.sdkOptions.suilend)
    const {
      is_long,
      market_id,
      position_cap_id,
      position_cap,
      deposit_reserve_array_index,
      input_coin,
      base_token,
      quote_token,
    } = params
    const { global_config_id, versioned_id } = getPackagerConfigs(this._sdk.sdkOptions.margin_trading)

    tx.moveCall({
      target: `${marginTradingConfig.published_at}::router::deposit`,
      typeArguments: [lending_market_type, is_long ? base_token : quote_token],
      arguments: [
        tx.object(global_config_id),
        tx.object(lending_market_id),
        tx.object(market_id),
        position_cap_id ? tx.object(position_cap_id) : position_cap,
        input_coin,
        tx.pure.u64(deposit_reserve_array_index),
        tx.object(CLOCK_ADDRESS),
        tx.object(versioned_id),
      ],
    })
    return tx
  }

  /**
   * Repay
   */
  public repay = (params: RepayParams) => {
    const { margin_trading: marginTradingConfig } = this._sdk.sdkOptions
    const { lending_market_id, lending_market_type } = getPackagerConfigs(this._sdk.sdkOptions.suilend)
    const { global_config_id, versioned_id } = getPackagerConfigs(this._sdk.sdkOptions.margin_trading)
    const {
      txb,
      repay_amount,
      repay_coin_type,
      repay_coin,
      repay_reserve_array_index,
      market_id,
      position_cap_id,
    } = params
    const tx = txb || new Transaction()
    const coin = repay_coin ? repay_coin : CoinAssist.buildCoinWithBalance(BigInt(repay_amount.toString()), repay_coin_type, tx)
    tx.moveCall({
      target: `${marginTradingConfig.published_at}::router::repay`,
      typeArguments: [lending_market_type, repay_coin_type],
      arguments: [
        tx.object(global_config_id),
        tx.object(lending_market_id),
        tx.object(market_id),
        tx.object(position_cap_id),
        coin,
        tx.pure.u64(repay_reserve_array_index.toString()),
        tx.object(CLOCK_ADDRESS),
        tx.object(versioned_id),
      ],
    })
  }

  /**
   * Withdraw asset (unified handling for SUI and non-SUI)
   */
  public withdrawAsset = (params: WithdrawAssetParams, tx: Transaction) => {
    const { margin_trading: marginTradingConfig } = this._sdk.sdkOptions
    const { lending_market_id, lending_market_type } = getPackagerConfigs(this._sdk.sdkOptions.suilend)
    const { global_config_id, versioned_id } = getPackagerConfigs(this._sdk.sdkOptions.margin_trading)
    const { package_id } = this._sdk.sdkOptions.suilend
    const { market_id, withdraw_amount, withdraw_reserve_array_index, withdraw_coin_type, position_cap_id } = params

    // Construct RateLimiterExemption
    const [exemption] = tx.moveCall({
      target: `0x1::option::none`,
      typeArguments: [`${package_id}::lending_market::RateLimiterExemption<${lending_market_type}, ${withdraw_coin_type}>`],
      arguments: [],
    })

    return tx.moveCall({
      target: `${marginTradingConfig.published_at}::router::withdraw`,
      typeArguments: [lending_market_type, withdraw_coin_type],
      arguments: [
        tx.object(global_config_id),
        tx.object(lending_market_id),
        tx.object(market_id),
        tx.object(position_cap_id),
        tx.object(exemption),
        tx.pure.u64(withdraw_amount),
        tx.pure.u64(withdraw_reserve_array_index),
        tx.object(SUI_SYSTEM_STATE_OBJECT_ID),
        tx.object(CLOCK_ADDRESS),
        tx.object(versioned_id),
      ],
    })
  }

  /**
   * Borrow asset (unified handling for SUI and non-SUI)
   */
  public borrowAsset = (params: BorrowAssetParams, tx: Transaction) => {
    const {
      reserve_array_index,
      borrow_amount,
      base_token,
      quote_token,
      lending_market_id,
      is_long,
      market_id,
      position_cap_id,
      position_cap,
    } = params
    const { margin_trading: marginTradingConfig } = this._sdk.sdkOptions
    const { lending_market_type } = getPackagerConfigs(this._sdk.sdkOptions.suilend)
    const { global_config_id, versioned_id } = getPackagerConfigs(this._sdk.sdkOptions.margin_trading)

    // Borrow  asset
    return tx.moveCall({
      target: `${marginTradingConfig.published_at}::router::borrow`,
      typeArguments: [lending_market_type, is_long ? quote_token : base_token],
      arguments: [
        tx.object(global_config_id),
        tx.object(lending_market_id),
        tx.object(market_id),
        position_cap_id ? tx.object(position_cap_id) : position_cap,
        tx.pure.u64(reserve_array_index),
        tx.pure.u64(borrow_amount.toString()),
        tx.object(SUI_SYSTEM_STATE_OBJECT_ID),
        tx.object(CLOCK_ADDRESS),
        tx.object(versioned_id),
      ],
    })
  }

  /**
   * Extract other token types from deposits and borrows excluding baseToken and quoteToken
   * @param deposits Deposit list
   * @param borrows Borrow list
   * @param baseToken Base token type
   * @param quoteToken Quote token type
   * @returns Array of other token types
   */
  private extractOtherTokenTypes(
    deposits: { reserve: { coinType: string } }[],
    borrows: { reserve: { coinType: string } }[],
    baseToken: string,
    quoteToken: string
  ): string[] {
    const otherTokens: string[] = []

    deposits.forEach((deposit) => {
      if (deposit.reserve.coinType !== baseToken && deposit.reserve.coinType !== quoteToken) {
        otherTokens.push(deposit.reserve.coinType)
      }
    })

    borrows.forEach((borrow) => {
      if (borrow.reserve.coinType !== baseToken && borrow.reserve.coinType !== quoteToken) {
        otherTokens.push(borrow.reserve.coinType)
      }
    })

    return otherTokens
  }



  /**
   * Open position
   */
  openPosition = async (params: OpenPositionParams) => {
    const { is_quote, is_long, amount, swap_clmm_pool = '', slippage, leverage, market_id } = params
    const { lending_market_id } = getPackagerConfigs(this._sdk.sdkOptions.suilend)
    const tx = new Transaction()
    const { base_token, quote_token } = await this._sdk.MarketModules.getMarketInfo(market_id)

    const {
      borrow_amount,
      base_reserve_array_index,
      quote_reserve_array_index,
      reserve,
      has_swap,
      flash_loan_objs
    } = await this.calculatePositionDeposit({
      is_long,
      is_quote,
      amount,
      swap_clmm_pool,
      leverage,
      slippage,
      market_id,
      base_token,
      quote_token,
      is_submit: true,
    })

    // Update oracle prices
    await this._sdk.SuiLendModule.refreshReservePrices(tx, reserve)

    // Open position
    const position_cap = this.createLeveragePosition({
      leverage,
      market_id,
      base_token,
      quote_token,
      is_long,
      init_deposit_amount: d(amount).toString(),
      init_coin_type: is_quote ? quote_token : base_token,
      tx,
    })

    // Reserve index of collateral asset
    const deposit_reserve_array_index = is_long ? base_reserve_array_index : quote_reserve_array_index

    if (flash_loan_objs) {
      const { is_flash_a, flash_amount, clmm_pool, clmm_pool_coin_type_a, clmm_pool_coin_type_b, flash_loan_coin } = flash_loan_objs
      // Initiate flash loan
      const { balance_a, balance_b, receipt } = this._sdk.SwapModules.flashLoan({
        amount: flash_amount,
        clmm_pool,
        clmm_pool_coin_type_a,
        clmm_pool_coin_type_b,
        flash_loan_coin,
        tx,
      })

      // Flash loan partial conversion
      const debt_from = is_long ? quote_token : base_token
      const debt_to = is_long ? base_token : quote_token
      const init_deposit_coin = CoinAssist.buildCoinWithBalance(BigInt(amount), is_quote ? quote_token : base_token, tx)
      const balance_coin_a = CoinAssist.fromBalance(balance_a, clmm_pool_coin_type_a, tx)
      const balance_coin_b = CoinAssist.fromBalance(balance_b, clmm_pool_coin_type_b, tx)


      if (has_swap) {
        console.log('🚀🚀🚀 ~ positionModules.ts:515 ~ PositionModules ~ is_flash_a:', is_flash_a)
        tx.mergeCoins(init_deposit_coin, [is_flash_a ? balance_coin_a : balance_coin_b])
      }

      const debtSwapResult = await this._sdk.SwapModules.handleSwap({
        from: debt_from,
        to: debt_to,
        amount: has_swap ? d(flash_amount).add(amount).toString() : flash_amount,
        input_coin: has_swap ? init_deposit_coin : is_flash_a ? balance_coin_a : balance_coin_b,
        swap_clmm_pool,
        slippage,
        tx,
      })

      if (debtSwapResult.swap_out_coin && !has_swap) {
        tx.mergeCoins(debtSwapResult.swap_out_coin, [init_deposit_coin])
      }

      // Position deposit
      await this.depositToLeveragePosition(
        {
          is_long,
          market_id,
          position_cap,
          deposit_reserve_array_index,
          input_coin: debtSwapResult.swap_out_coin,
          base_token,
          quote_token,
        },
        tx
      )

      // Borrow asset
      const borrowCoin = this.borrowAsset(
        {
          position_cap,
          reserve_array_index: is_long ? quote_reserve_array_index : base_reserve_array_index,
          borrow_amount,
          base_token,
          quote_token,
          is_long,
          lending_market_id,
          market_id,
        },
        tx
      )


      const zeroBalance = CoinAssist.mintBalanceZero(is_flash_a ? clmm_pool_coin_type_b : clmm_pool_coin_type_a, tx)
      // Repay flash loan
      this._sdk.SwapModules.repayFlashLoan({
        tx,
        clmm_pool,
        repay_base: is_flash_a ? CoinAssist.intoBalance(borrowCoin, clmm_pool_coin_type_a, tx) : zeroBalance,
        repay_quote: is_flash_a ? zeroBalance : CoinAssist.intoBalance(borrowCoin, clmm_pool_coin_type_b, tx),
        receipt,
        clmm_pool_coin_type_a,
        clmm_pool_coin_type_b,
      })

      // Transfer position to user
      tx.transferObjects([position_cap], tx.pure.address(this._sdk.getSenderAddress()))
      // Destroy zero balance asset from flash loan
      CoinAssist.destroyBalanceZero(
        is_flash_a
          ? CoinAssist.intoBalance(balance_coin_b, clmm_pool_coin_type_b, tx)
          : CoinAssist.intoBalance(balance_coin_a, clmm_pool_coin_type_a, tx),
        is_flash_a ? clmm_pool_coin_type_b : clmm_pool_coin_type_a,
        tx
      )
    } else {
      let init_deposit_coin = CoinAssist.buildCoinWithBalance(BigInt(amount), is_quote ? quote_token : base_token, tx)
      const deposit_token = is_long ? base_token : quote_token
      const borrow_token = is_long ? quote_token : base_token
      if (has_swap) {
        const swapResult = await this._sdk.SwapModules.handleSwap({
          from: borrow_token,
          to: deposit_token,
          amount,
          input_coin: init_deposit_coin,
          swap_clmm_pool,
          slippage,
          tx,
        })
        init_deposit_coin = swapResult.swap_out_coin!
      }


      // Position deposit
      await this.depositToLeveragePosition(
        {
          is_long,
          market_id,
          position_cap,
          deposit_reserve_array_index,
          input_coin: init_deposit_coin,
          base_token,
          quote_token,
        },
        tx
      )
      // Borrow asset
      const borrowCoin = this.borrowAsset(
        {
          position_cap,
          reserve_array_index: is_long ? quote_reserve_array_index : base_reserve_array_index,
          borrow_amount,
          base_token,
          quote_token,
          is_long,
          lending_market_id,
          market_id,
        },
        tx
      )

      const swapResult = await this._sdk.SwapModules.handleSwap({
        from: borrow_token,
        to: deposit_token,
        amount: borrow_amount,
        input_coin: borrowCoin,
        swap_clmm_pool,
        slippage,
        tx,
      })

      await this.depositToLeveragePosition(
        {
          is_long,
          market_id,
          position_cap,
          deposit_reserve_array_index,
          input_coin: swapResult.swap_out_coin!,
          base_token,
          quote_token,
        },
        tx
      )
      tx.transferObjects([position_cap], tx.pure.address(this._sdk.getSenderAddress()))
    }



    return tx
  }

  /**
   * Increase position size
   */
  positionDeposit = async (params: PositionManageSizeDepositParams) => {
    const { position_id, swap_clmm_pool = '', is_quote, amount, slippage, leverage, txb } = params
    const { lending_market_id } = getPackagerConfigs(this._sdk.sdkOptions.suilend)

    // Get position info
    const { is_long, deposits, borrows, position_cap_id, market_id } = await this.getPositionInfo(position_id)
    // Get market info
    const { base_token, quote_token } = await this._sdk.MarketModules.getMarketInfo(market_id)
    const tx = txb || new Transaction()


    // Get reserveArrayIndex of position collateral token
    const deposit_reserve_array_index = deposits[0].reserveArrayIndex.toString()
    const borrow_reserve_array_index = borrows[0].reserveArrayIndex.toString()

    // Calculate flash loan parameters
    const {
      borrow_amount,
      flash_loan_objs,
      reserve,
      has_swap,
    } = await this.calculatePositionDeposit({
      market_id,
      is_long,
      is_quote,
      amount,
      swap_clmm_pool,
      leverage,
      slippage,
      base_token,
      quote_token,
      position_id,
      is_open: false,
    })

    // Update oracle prices
    await this._sdk.SuiLendModule.refreshReservePrices(tx, reserve)

    if (flash_loan_objs) {
      const { is_flash_a, flash_amount, clmm_pool, clmm_pool_coin_type_a, clmm_pool_coin_type_b, flash_loan_coin } = flash_loan_objs

      // Initiate flash loan
      const { balance_a, balance_b, receipt } = this._sdk.SwapModules.flashLoan({
        amount: flash_amount,
        clmm_pool,
        clmm_pool_coin_type_a: clmm_pool_coin_type_a,
        clmm_pool_coin_type_b: clmm_pool_coin_type_b,
        flash_loan_coin,
        tx,
      })

      // Flash loan partial conversion
      const debt_from = is_long ? quote_token : base_token
      const debt_to = is_long ? base_token : quote_token
      const init_deposit_coin = CoinAssist.buildCoinWithBalance(BigInt(amount), is_quote ? quote_token : base_token, tx)
      const balance_coin_a = CoinAssist.fromBalance(balance_a, clmm_pool_coin_type_a, tx)
      const balance_coin_b = CoinAssist.fromBalance(balance_b, clmm_pool_coin_type_b, tx)
      if (has_swap) {
        tx.mergeCoins(init_deposit_coin, [is_flash_a ? balance_coin_a : balance_coin_b])
      }

      const debtSwapResult = await this._sdk.SwapModules.handleSwap({
        from: debt_from,
        to: debt_to,
        amount: has_swap ? d(flash_amount).add(amount).toString() : flash_amount,
        input_coin: has_swap ? init_deposit_coin : is_flash_a ? balance_coin_a : balance_coin_b,
        swap_clmm_pool,
        slippage,
        tx,
      })

      if (debtSwapResult.swap_out_coin && !has_swap) {
        tx.mergeCoins(debtSwapResult.swap_out_coin, [init_deposit_coin])
      }

      // Increase position size
      await this.depositToLeveragePosition(
        {
          is_long,
          market_id,
          position_cap_id,
          deposit_reserve_array_index,
          input_coin: debtSwapResult.swap_out_coin,
          base_token,
          quote_token,
        },
        tx
      )

      // Borrow asset
      const borrowCoin = await this.borrowAsset(
        {
          position_cap_id,
          reserve_array_index: borrow_reserve_array_index,
          borrow_amount: borrow_amount,
          base_token,
          quote_token,
          is_long,
          lending_market_id,
          market_id,
        },
        tx
      )
      const zeroBalance = CoinAssist.mintBalanceZero(is_flash_a ? clmm_pool_coin_type_b : clmm_pool_coin_type_a, tx)

      // Repay flash loan
      this._sdk.SwapModules.repayFlashLoan({
        tx,
        clmm_pool,
        repay_base: is_flash_a ? CoinAssist.intoBalance(borrowCoin, clmm_pool_coin_type_a, tx) : zeroBalance,
        repay_quote: is_flash_a ? zeroBalance : CoinAssist.intoBalance(borrowCoin, clmm_pool_coin_type_b, tx),
        receipt,
        clmm_pool_coin_type_a,
        clmm_pool_coin_type_b,
      })

      // Destroy zero balance asset from flash loan
      CoinAssist.destroyBalanceZero(
        is_flash_a
          ? CoinAssist.intoBalance(balance_coin_b, clmm_pool_coin_type_b, tx)
          : CoinAssist.intoBalance(balance_coin_a, clmm_pool_coin_type_a, tx),
        is_flash_a ? clmm_pool_coin_type_b : clmm_pool_coin_type_a,
        tx
      )

    } else {
      let init_deposit_coin = CoinAssist.buildCoinWithBalance(BigInt(amount), is_quote ? quote_token : base_token, tx)
      const deposit_token = is_long ? base_token : quote_token
      const borrow_token = is_long ? quote_token : base_token
      if (has_swap) {
        const swapResult = await this._sdk.SwapModules.handleSwap({
          from: borrow_token,
          to: deposit_token,
          amount,
          input_coin: init_deposit_coin,
          swap_clmm_pool,
          slippage,
          tx,
        })
        init_deposit_coin = swapResult.swap_out_coin!
      }


      // Position deposit
      await this.depositToLeveragePosition(
        {
          is_long,
          market_id,
          position_cap_id,
          deposit_reserve_array_index,
          input_coin: init_deposit_coin,
          base_token,
          quote_token,
        },
        tx
      )
      // Borrow asset
      const borrowCoin = this.borrowAsset(
        {
          position_cap_id,
          reserve_array_index: borrow_reserve_array_index,
          borrow_amount,
          base_token,
          quote_token,
          is_long,
          lending_market_id,
          market_id,
        },
        tx
      )

      const swapResult = await this._sdk.SwapModules.handleSwap({
        from: borrow_token,
        to: deposit_token,
        amount: borrow_amount,
        input_coin: borrowCoin,
        swap_clmm_pool,
        slippage,
        tx,
      })

      await this.depositToLeveragePosition(
        {
          is_long,
          market_id,
          position_cap_id,
          deposit_reserve_array_index,
          input_coin: swapResult.swap_out_coin!,
          base_token,
          quote_token,
        },
        tx
      )
    }


    return tx
  }

  /**
   * Decrease position size
   */

  positionWithdraw = async (params: PositionManageSizeWithdrawParams) => {
    const { amount, is_quote, txb, swap_clmm_pool = '', slippage, position_id, leverage, withdraw_max } = params
    const tx = txb || new Transaction()
    const {
      withdraw_ctoken_amount,
      repay_amount,
      is_close,
      deposits,
      borrows,
      reserve,
      base_token,
      quote_token,
      clmm_pool,
      clmm_pool_coin_type_a,
      clmm_pool_coin_type_b,
      position_cap_id,
      market_id,
      is_long,
      swap_convert_all,
      flash_loan_amount,
      routers,
      repay_flash_loan_amount = '0',
      partial_amount_in,
      withdraw_amount,
      has_flash_loan,
      compoundDebtU64,
    } = await this.calculatePositionWithdraw({ position_id, is_quote, swap_clmm_pool, amount, leverage, slippage, withdraw_max })
    if (is_close) {
      return this.positionClose({
        position_id,
        is_quote,
        leverage,
        slippage,
        swap_clmm_pool,
      })
    }
    // Update oracle prices
    await this._sdk.SuiLendModule.refreshReservePrices(tx, reserve)

    let flashReceipt, isLoanA
    if (has_flash_loan) {
      // Flash loan borrows debt
      const { balance_a, balance_b, receipt, is_loan_a } = this._sdk.SwapModules.flashLoan({
        tx,
        amount: flash_loan_amount,
        amount_u64: compoundDebtU64,
        flash_loan_coin: borrows[0].reserve.coinType,
        clmm_pool,
        clmm_pool_coin_type_a,
        clmm_pool_coin_type_b,
      })
      flashReceipt = receipt
      isLoanA = is_loan_a
      CoinAssist.destroyBalanceZero(isLoanA ? balance_b : balance_a, isLoanA ? clmm_pool_coin_type_b : clmm_pool_coin_type_a, tx)
      // Repay debt
      const repayCoin = is_loan_a
        ? CoinAssist.fromBalance(balance_a, clmm_pool_coin_type_a, tx)
        : CoinAssist.fromBalance(balance_b, clmm_pool_coin_type_b, tx)
      this.repay({
        txb: tx,
        position_cap_id,
        repay_reserve_array_index: borrows[0].reserveArrayIndex.toString(),
        repay_coin: repayCoin,
        repay_coin_type: is_long ? quote_token : base_token,
        repay_amount: '0',
        market_id,
      })
      tx.transferObjects([repayCoin], this._sdk.getSenderAddress())
    }

    // Withdraw collateral asset
    const withdrawCoin = this.withdrawAsset(
      {
        market_id,
        position_cap_id,
        withdraw_amount: withdraw_ctoken_amount.toString(),
        withdraw_reserve_array_index: deposits[0].reserveArrayIndex.toString(),
        withdraw_coin_type: is_long ? base_token : quote_token,
      },
      tx
    )

    for (let i = 1; i < deposits.length; i++) {
      const rewardCoin = this.withdrawAsset(
        {
          market_id,
          position_cap_id,
          withdraw_amount: U64_MAX.toString(),
          withdraw_reserve_array_index: deposits[i].reserveArrayIndex.toString(),
          withdraw_coin_type: deposits[i].coinType,
        },
        tx
      )
      tx.transferObjects([rewardCoin], this._sdk.getSenderAddress())
    }

    let swapOutCoin
    // Convert all collateral assets
    console.log('🚀🚀🚀 ~ positionModules.ts:778 ~ PositionModules ~ swap_convert_all:', { swap_convert_all, has_flash_loan })
    if (swap_convert_all) {
      swapOutCoin = await this._sdk.SwapModules.routerSwap({
        router: routers?.route_obj,
        input_coin: withdrawCoin,
        slippage,
        txb: tx,
      })
    } else {
      // Partially convert collateral asset to borrow asset
      const inputCoin = tx.splitCoins(withdrawCoin, [tx.pure.u64(partial_amount_in?.toString() || '0')])
      swapOutCoin = await this._sdk.SwapModules.routerSwap({
        router: routers?.route_obj,
        input_coin: inputCoin,
        slippage,
        txb: tx,
      })
    }

    // Repay flash loan
    let repayFlashLoanCoin
    if (swapOutCoin && has_flash_loan) {
      repayFlashLoanCoin = tx.splitCoins(swapOutCoin, [tx.pure.u64(repay_flash_loan_amount.toString())])
    }

    if (repayFlashLoanCoin && has_flash_loan) {
      const zeroBalance = CoinAssist.mintBalanceZero(isLoanA ? clmm_pool_coin_type_b : clmm_pool_coin_type_a, tx)
      this._sdk.SwapModules.repayFlashLoan({
        tx,
        clmm_pool,
        repay_base: isLoanA ? CoinAssist.intoBalance(repayFlashLoanCoin, clmm_pool_coin_type_a, tx) : zeroBalance,
        repay_quote: isLoanA ? zeroBalance : CoinAssist.intoBalance(repayFlashLoanCoin, clmm_pool_coin_type_b, tx),
        clmm_pool_coin_type_a,
        clmm_pool_coin_type_b,
        receipt: flashReceipt,
      })
    } else {
      if (swapOutCoin) {
        const repayCoin = tx.splitCoins(swapOutCoin, [tx.pure.u64(repay_flash_loan_amount.toString())])
        this.repay({
          txb: tx,
          position_cap_id,
          repay_reserve_array_index: borrows[0].reserveArrayIndex.toString(),
          repay_coin: repayCoin,
          repay_coin_type: is_long ? quote_token : base_token,
          repay_amount: '0',
          market_id,
        })
        tx.transferObjects([repayCoin], this._sdk.getSenderAddress())
      }
    }

    if (swapOutCoin) {
      tx.transferObjects([swapOutCoin], this._sdk.getSenderAddress())
    }
    if (!swap_convert_all) {
      tx.transferObjects([withdrawCoin], this._sdk.getSenderAddress())
    }

    return tx
  }

  /**
   * Close position
   */
  positionClose = async (params: PositionCloseWithCoinParams) => {
    const { position_id, is_quote, slippage, leverage, swap_clmm_pool = '' } = params
    const { margin_trading: marginTradingConfig } = this._sdk.sdkOptions
    const { global_config_id, versioned_id } = getPackagerConfigs(this._sdk.sdkOptions.margin_trading)
    const { lending_market_type: lendingMarketType, lending_market_id: lendingMarketId } = getPackagerConfigs(this._sdk.sdkOptions.suilend)
    const tx = new Transaction()
    const {
      deposits,
      borrows,
      base_token,
      quote_token,
      clmm_pool,
      clmm_pool_coin_type_a,
      clmm_pool_coin_type_b,
      position_cap_id,
      market_id,
      swap_convert_all,
      routers,
      partial_amount_in,
      is_long,
      flash_loan_amount,
      reserve,
      repay_flash_loan_amount = '0',
      claimable_rewards,
      compoundDebtU64
    } = await this.calculatePositionWithdraw({ tx, position_id, is_quote, swap_clmm_pool, amount: U64_MAX.toString(), leverage, slippage, withdraw_max: true })

    // Update oracle prices
    await this._sdk.SuiLendModule.refreshReservePrices(tx, reserve)

    // Flash loan borrow
    let flashReceipt, isLoanA
    if (d(flash_loan_amount).gt(0)) {
      const { balance_a, balance_b, receipt, is_loan_a } = this._sdk.SwapModules.flashLoan({
        tx,
        amount: flash_loan_amount,
        amount_u64: compoundDebtU64,
        flash_loan_coin: is_long ? quote_token : base_token,
        clmm_pool,
        clmm_pool_coin_type_a,
        clmm_pool_coin_type_b,
      })
      flashReceipt = receipt
      isLoanA = is_loan_a
      // Repay debt
      CoinAssist.destroyBalanceZero(isLoanA ? balance_b : balance_a, isLoanA ? clmm_pool_coin_type_b : clmm_pool_coin_type_a, tx)
      const repayCoin = isLoanA
        ? CoinAssist.fromBalance(balance_a, clmm_pool_coin_type_a, tx)
        : CoinAssist.fromBalance(balance_b, clmm_pool_coin_type_b, tx)
      this.repay({
        txb: tx,
        position_cap_id,
        repay_reserve_array_index: borrows[0].reserveArrayIndex.toString(),
        repay_coin: repayCoin,
        repay_coin_type: borrows[0].reserve.coinType,
        repay_amount: '0',
        market_id,
      })
      tx.transferObjects([repayCoin], this._sdk.getSenderAddress())
    }

    // Withdraw collateral asset
    const withdrawCoin = this.withdrawAsset(
      {
        market_id,
        position_cap_id,
        withdraw_amount: U64_MAX.toString(), // u64max will be automatically converted to maxAmount when withdrawing
        withdraw_reserve_array_index: deposits[0].reserveArrayIndex.toString(),
        withdraw_coin_type: is_long ? base_token : quote_token,
      },
      tx
    )



    await this.buildClaimRewardsMoveCall(claimable_rewards, market_id, position_cap_id, tx)

    for (let i = 1; i < deposits.length; i++) {
      const rewardCoin = this.withdrawAsset(
        {
          market_id,
          position_cap_id,
          withdraw_amount: U64_MAX.toString(),
          withdraw_reserve_array_index: deposits[i].reserveArrayIndex.toString(),
          withdraw_coin_type: deposits[i].coinType,
        },
        tx
      )
      tx.transferObjects([rewardCoin], this._sdk.getSenderAddress())
    }
    // Asset conversion
    let swapOutCoin
    console.log('🚀🚀🚀 ~ positionModules.ts:895 ~ PositionModules ~ swap_convert_all:', swap_convert_all)
    if (swap_convert_all) {
      swapOutCoin = await this._sdk.SwapModules.routerSwap({
        router: routers?.route_obj,
        input_coin: withdrawCoin,
        slippage,
        txb: tx,
      })
    } else {
      if (partial_amount_in && d(partial_amount_in).gt(0)) {
        const inputCoin = tx.splitCoins(withdrawCoin, [tx.pure.u64(partial_amount_in?.toString() || '0')])
        swapOutCoin = await this._sdk.SwapModules.routerSwap({
          router: routers?.route_obj,
          input_coin: inputCoin,
          slippage,
          txb: tx,
        })
      }
    }
    // Repay flash loan
    if (swapOutCoin && flashReceipt) {
      const zeroBalance = CoinAssist.mintBalanceZero(isLoanA ? clmm_pool_coin_type_b : clmm_pool_coin_type_a, tx)
      const repayFlashLoanCoin = tx.splitCoins(swapOutCoin, [tx.pure.u64(repay_flash_loan_amount?.toString() || '0')])
      this._sdk.SwapModules.repayFlashLoan({
        tx,
        clmm_pool,
        repay_base: isLoanA ? CoinAssist.intoBalance(repayFlashLoanCoin, clmm_pool_coin_type_a, tx) : zeroBalance,
        repay_quote: isLoanA ? zeroBalance : CoinAssist.intoBalance(repayFlashLoanCoin, clmm_pool_coin_type_b, tx),
        clmm_pool_coin_type_a,
        clmm_pool_coin_type_b,
        receipt: flashReceipt,
      })
    }

    // Close position
    tx.moveCall({
      target: `${marginTradingConfig.published_at}::router::close_position`,
      typeArguments: [lendingMarketType],
      arguments: [
        tx.object(global_config_id),
        tx.object(lendingMarketId),
        tx.object(market_id),
        tx.object(position_cap_id),
        tx.object(CLOCK_ADDRESS),
        tx.object(versioned_id),
      ],
    })

    if (swapOutCoin) {
      tx.transferObjects([swapOutCoin], this._sdk.getSenderAddress())
    }
    if (!swap_convert_all) {
      tx.transferObjects([withdrawCoin], this._sdk.getSenderAddress())
    }


    console.log('🚀🚀🚀 ~ positionModules.ts:951 ~ PositionModules ~ tx:', tx)
    return tx
  }

  /**
   * Increase position leverage
   */
  positionLeverageIncrease = async (params: PositionManageLeverageParams) => {
    const { current_leverage, target_leverage, swap_clmm_pool = '', slippage, position_id } = params
    const { lending_market_id } = getPackagerConfigs(this._sdk.sdkOptions.suilend)
    const tx = new Transaction()
    const {
      flash_loan_amount,
      quote_token,
      base_token,
      reserve,
      deposits,
      borrow_amount,
      routers,
      position_cap_id,
      is_long,
      market_id,
      is_flash_loan,
    } = await this.calculatePositionLeverage({ position_id, current_leverage, target_leverage, swap_clmm_pool, slippage })
    const flash_loan_coin = is_long ? quote_token : base_token

    // Update oracle prices
    await this._sdk.SuiLendModule.refreshReservePrices(tx, reserve)

    // Need flash loan
    if (is_flash_loan) {
      const { clmm_pool_coin_type_a, clmm_pool_coin_type_b, clmm_pool } = await this._sdk.SwapModules.getFlashLoanPool(
        flash_loan_coin,
        flash_loan_amount?.toString() || ''
      )
      const { balance_a, balance_b, receipt, is_loan_a } = this._sdk.SwapModules.flashLoan({
        tx,
        amount: flash_loan_amount?.toString() || '0',
        clmm_pool,
        clmm_pool_coin_type_a,
        clmm_pool_coin_type_b,
        flash_loan_coin,
      })
      const swapOutCoin = await this._sdk.SwapModules.routerSwap({
        router: routers?.route_obj,
        input_coin: is_loan_a
          ? CoinAssist.fromBalance(balance_a, clmm_pool_coin_type_a, tx)
          : CoinAssist.fromBalance(balance_b, clmm_pool_coin_type_b, tx),
        slippage: slippage,
        txb: tx,
      })

      this.depositToLeveragePosition(
        {
          is_long,
          market_id,
          position_cap_id,
          deposit_reserve_array_index: deposits[0].reserveArrayIndex.toString(),
          input_coin: swapOutCoin,
          base_token,
          quote_token,
        },
        tx
      )

      const borrowCoin = this.borrowAsset(
        {
          position_cap_id,
          reserve_array_index: is_long ? reserve[1].arrayIndex.toString() : reserve[0].arrayIndex.toString(),
          borrow_amount,
          base_token,
          quote_token,
          is_long,
          lending_market_id,
          market_id,
        },
        tx
      )

      const zeroBalance = CoinAssist.mintBalanceZero(is_loan_a ? clmm_pool_coin_type_b : clmm_pool_coin_type_a, tx)

      this._sdk.SwapModules.repayFlashLoan({
        tx,
        clmm_pool,
        repay_base: is_loan_a ? CoinAssist.intoBalance(borrowCoin, clmm_pool_coin_type_a, tx) : zeroBalance,
        repay_quote: is_loan_a ? zeroBalance : CoinAssist.intoBalance(borrowCoin, clmm_pool_coin_type_b, tx),
        receipt,
        clmm_pool_coin_type_a,
        clmm_pool_coin_type_b,
      })

      CoinAssist.destroyBalanceZero(is_loan_a ? balance_b : balance_a, is_loan_a ? clmm_pool_coin_type_b : clmm_pool_coin_type_a, tx)
    } else {
      const borrowCoin = this.borrowAsset(
        {
          position_cap_id,
          reserve_array_index: is_long ? reserve[1].arrayIndex.toString() : reserve[0].arrayIndex.toString(),
          borrow_amount,
          base_token,
          quote_token,
          is_long,
          lending_market_id,
          market_id,
        },
        tx
      )

      const swapOutCoin = await this._sdk.SwapModules.routerSwap({
        router: routers?.route_obj,
        input_coin: borrowCoin,
        slippage: slippage,
        txb: tx,
      })

      this.depositToLeveragePosition(
        {
          is_long,
          market_id,
          position_cap_id,
          deposit_reserve_array_index: deposits[0].reserveArrayIndex.toString(),
          input_coin: swapOutCoin,
          base_token,
          quote_token,
        },
        tx
      )
    }


    return tx
  }

  /**
   * Decrease position leverage
   */
  positionLeverageDecrease = async (params: PositionManageLeverageParams) => {
    const { current_leverage, target_leverage, swap_clmm_pool = '', slippage, position_id } = params
    const { deposits, borrows, position_cap_id, market_id, is_long } = await this.getPositionInfo(position_id)
    const { base_token, quote_token } = await this._sdk.MarketModules.getMarketInfo(market_id)
    const tx = new Transaction()
    // Decrease position leverage, withdraw collateral asset
    const { withdraw_ctoken_amount, routers, reserve, is_flash_loan } = await this.calculatePositionLeverage({
      position_id,
      current_leverage,
      target_leverage,
      swap_clmm_pool,
      slippage,
    })
    // Need to update oracle prices before placing suilend order
    await this._sdk.SuiLendModule.refreshReservePrices(tx, reserve)

    if (is_flash_loan) {
      const { clmm_pool_coin_type_a, clmm_pool_coin_type_b, clmm_pool, clmm_fee_tier } = await this._sdk.SwapModules.getFlashLoanPool(
        deposits[0].reserve.coinType,
        withdraw_ctoken_amount.toString()
      )

      const { balance_a, balance_b, receipt, is_loan_a } = this._sdk.SwapModules.flashLoan({
        tx,
        amount: withdraw_ctoken_amount,
        clmm_pool,
        clmm_pool_coin_type_a,
        clmm_pool_coin_type_b,
        flash_loan_coin: deposits[0].reserve.coinType,
      })

      const swapOutCoin = await this._sdk.SwapModules.routerSwap({
        router: routers?.route_obj,
        input_coin: is_loan_a
          ? CoinAssist.fromBalance(balance_a, clmm_pool_coin_type_a, tx)
          : CoinAssist.fromBalance(balance_b, clmm_pool_coin_type_b, tx),
        slippage: slippage,
        txb: tx,
      })

      this.repay({
        txb: tx,
        market_id,
        position_cap_id,
        repay_reserve_array_index: borrows[0].reserveArrayIndex.toString(),
        repay_coin: swapOutCoin,
        repay_coin_type: is_long ? quote_token : base_token,
        repay_amount: '0',
      })
      if (swapOutCoin) {
        tx.transferObjects([swapOutCoin], this._sdk.getSenderAddress())
      }
      const flashLoanFee = d(withdraw_ctoken_amount).mul(clmm_fee_tier).toString()
      const repayFlashLoanAmount = d(withdraw_ctoken_amount).add(flashLoanFee).toDP(0, Decimal.ROUND_UP)

      const withdrawCoin = this.withdrawAsset(
        {
          market_id,
          position_cap_id,
          withdraw_amount: repayFlashLoanAmount.toString(),
          withdraw_reserve_array_index: deposits[0].reserveArrayIndex.toString(),
          withdraw_coin_type: is_long ? base_token : quote_token,
        },
        tx
      )

      const repayCoin = tx.splitCoins(withdrawCoin, [repayFlashLoanAmount.toString()])
      this._sdk.SwapModules.repayFlashLoan({
        tx,
        clmm_pool,
        repay_base: is_loan_a ? CoinAssist.intoBalance(repayCoin, clmm_pool_coin_type_a, tx) : balance_a,
        repay_quote: is_loan_a ? balance_b : CoinAssist.intoBalance(repayCoin, clmm_pool_coin_type_b, tx),
        receipt,
        clmm_pool_coin_type_a,
        clmm_pool_coin_type_b,
      })

      tx.transferObjects([withdrawCoin], this._sdk.getSenderAddress())
    } else {
      const withdrawCoin = this.withdrawAsset(
        {
          market_id,
          position_cap_id,
          withdraw_amount: withdraw_ctoken_amount.toString(),
          withdraw_reserve_array_index: deposits[0].reserveArrayIndex.toString(),
          withdraw_coin_type: is_long ? base_token : quote_token,
        },
        tx
      )

      const swapOutCoin = await this._sdk.SwapModules.routerSwap({
        router: routers?.route_obj,
        input_coin: withdrawCoin,
        slippage: slippage,
        txb: tx,
      })

      this.repay({
        txb: tx,
        market_id,
        position_cap_id,
        repay_reserve_array_index: borrows[0].reserveArrayIndex.toString(),
        repay_coin: swapOutCoin,
        repay_coin_type: is_long ? quote_token : base_token,
        repay_amount: '0',
      })

      tx.transferObjects([swapOutCoin!], this._sdk.getSenderAddress())
    }


    return tx
  }

  /**
   * Leverage position repay
   */
  positionRepay = async (params: PositionRepayParams) => {
    const { position_id, amount, is_quote, slippage } = params
    const { routers, repay_coin_type, base_token, quote_token, borrows, deposits, market_id, position_cap_id } =
      await this.calculatePositionRepay({
        position_id,
        amount,
        is_quote,
      })
    const otherToken = this.extractOtherTokenTypes(deposits, borrows, base_token, quote_token)
    const { reserve } = await this._sdk.SuiLendModule.getSuiLendReserveInfo(base_token, quote_token, undefined, otherToken)
    const tx = new Transaction()
    await this._sdk.SuiLendModule.refreshReservePrices(tx, reserve)
    // Coin to be repaid
    const hasSwap = is_quote ? quote_token !== repay_coin_type : base_token !== repay_coin_type
    let repayCoin: any
    if (hasSwap) {
      const inputCoin = CoinAssist.buildCoinWithBalance(BigInt(amount.toString()), is_quote ? quote_token : base_token, tx)
      repayCoin = await this._sdk.SwapModules.routerSwap({
        router: routers?.route_obj,
        input_coin: inputCoin,
        slippage,
        txb: tx,
      })
    } else {
      repayCoin = CoinAssist.buildCoinWithBalance(BigInt(amount.toString()), is_quote ? quote_token : base_token, tx)
    }

    this.repay({
      txb: tx,
      position_cap_id,
      repay_reserve_array_index: borrows[0].reserveArrayIndex.toString(),
      repay_coin: repayCoin,
      repay_coin_type,
      repay_amount: '0',
      market_id,
    })
    tx.transferObjects([repayCoin], this._sdk.getSenderAddress())

    return tx
  }

  /**
   * Top up collateral for leverage position
   */
  positionTopUpCToken = async (params: positionTopUpCTokenParams) => {
    const { position_id, amount, is_quote, swap_clmm_pool = '', slippage } = params
    const tx = new Transaction()
    const { is_long, market_id, position_cap_id, deposits, borrows } = await this.getPositionInfo(position_id)
    const { base_token, quote_token } = await this._sdk.MarketModules.getMarketInfo(market_id)
    const hasSwap = (is_long && is_quote) || (!is_long && !is_quote)
    const otherToken = this.extractOtherTokenTypes(deposits, borrows, base_token, quote_token)
    const { base_reserve_array_index, quote_reserve_array_index, reserve } = await this._sdk.SuiLendModule.getSuiLendReserveInfo(
      base_token,
      quote_token,
      undefined,
      otherToken
    )
    await this._sdk.SuiLendModule.refreshReservePrices(tx, reserve)
    let depositCoin: any
    if (hasSwap) {
      const routers = await this._sdk.SwapModules.findRouters(
        is_quote ? quote_token : base_token,
        is_quote ? base_token : quote_token,
        amount,
        true,
        [swap_clmm_pool]
      )
      const inputCoin = CoinAssist.buildCoinWithBalance(BigInt(amount.toString()), is_quote ? quote_token : base_token, tx)
      depositCoin = await this._sdk.SwapModules.routerSwap({
        router: routers?.route_obj,
        input_coin: inputCoin,
        slippage,
        txb: tx,
      })
    } else {
      depositCoin = CoinAssist.buildCoinWithBalance(BigInt(amount.toString()), is_quote ? quote_token : base_token, tx)
    }

    await this.depositToLeveragePosition(
      {
        is_long,
        market_id,
        position_cap_id,
        deposit_reserve_array_index: is_long ? base_reserve_array_index : quote_reserve_array_index,
        input_coin: depositCoin,
        base_token,
        quote_token,
      },
      tx
    )

    return tx
  }

  /**
   * Withdraw ctoken for leverage position
   */
  positionWithdrawCToken = async (params: positionWithdrawCTokenParams) => {
    const { position_id, amount, is_quote, swap_clmm_pool = '', slippage } = params
    const tx = new Transaction()
    const { is_long, market_id, position_cap_id, deposits, borrows } = await this.getPositionInfo(position_id)
    const { base_token, quote_token } = await this._sdk.MarketModules.getMarketInfo(market_id)
    const hasSwap = (is_long && is_quote) || (!is_long && !is_quote)
    const otherToken = this.extractOtherTokenTypes(deposits, borrows, base_token, quote_token)
    const { base_reserve_array_index, quote_reserve_array_index, reserve } = await this._sdk.SuiLendModule.getSuiLendReserveInfo(
      base_token,
      quote_token,
      undefined,
      otherToken
    )
    await this._sdk.SuiLendModule.refreshReservePrices(tx, reserve)

    // Get oracle price
    const priceUpdateData = await this._sdk.SuiLendModule.getLatestPriceFeeds(reserve, true)
    const quotePrice = priceUpdateData[removeHexPrefix(quote_token)]?.price
    const basePrice = priceUpdateData[removeHexPrefix(base_token)]?.price
    const rate = is_long ? d(quotePrice).div(d(basePrice)).toString() : d(basePrice).div(d(quotePrice)).toString()
    const baseTokenDecimal = reserve[0].mintDecimals
    const quoteTokenDecimal = reserve[1].mintDecimals
    const withdrawAmount = hasSwap
      ? d(amount)
        .mul(rate)
        .div(10 ** (is_quote ? quoteTokenDecimal : baseTokenDecimal))
        .mul(10 ** (is_long ? baseTokenDecimal : quoteTokenDecimal))
        .toDP(0, Decimal.ROUND_DOWN)
        .toString()
      : amount.toString()

    const withdrawCoin = this.withdrawAsset(
      {
        market_id,
        position_cap_id,
        withdraw_amount: withdrawAmount,
        withdraw_reserve_array_index: is_long ? base_reserve_array_index : quote_reserve_array_index,
        withdraw_coin_type: is_long ? base_token : quote_token,
      },
      tx
    )

    if (hasSwap) {
      const routers = await this._sdk.SwapModules.findRouters(
        is_long ? base_token : quote_token,
        is_quote ? quote_token : base_token,
        withdrawAmount,
        true,
        [swap_clmm_pool]
      )
      const targetCoin = await this._sdk.SwapModules.routerSwap({
        router: routers?.route_obj,
        input_coin: withdrawCoin,
        slippage,
        txb: tx,
      })
      if (targetCoin) {
        tx.transferObjects([targetCoin], this._sdk.getSenderAddress())
      }
    } else {
      tx.transferObjects([withdrawCoin], this._sdk.getSenderAddress())
    }


    return tx
  }

  private async buildClaimRewardsMoveCall(claimable_rewards: any[], market_id: string, position_cap_id: string, tx: Transaction) {
    const { suilend, margin_trading } = this._sdk.sdkOptions
    const lending_market_id = getPackagerConfigs(suilend).lending_market_id
    const lending_market_type = getPackagerConfigs(suilend).lending_market_type

    const { global_config_id, versioned_id } = getPackagerConfigs(this._sdk.sdkOptions.margin_trading)

    for (let i = 0; i < claimable_rewards.length; i++) {
      const coin = tx.moveCall({
        target: `${margin_trading.published_at}::router::claim_rewards`,
        arguments: [
          tx.object(global_config_id),
          tx.object(lending_market_id),
          tx.object(market_id),
          tx.object(position_cap_id),
          tx.pure.u64(claimable_rewards[i].reserveArrayIndex.toString()),
          tx.pure.u64(claimable_rewards[i].rewardIndex.toString()),
          tx.pure.bool(claimable_rewards[i].reserveType === 'deposit'),
          tx.object(CLOCK_ADDRESS),
          tx.object(versioned_id),
        ],
        typeArguments: [lending_market_type, claimable_rewards[i].coinType],
      })

      tx.transferObjects([coin], this._sdk.getSenderAddress())

    }
  }

  positionClaim = async (position_id: string) => {
    const tx = new Transaction()
    const { position_cap_id, obligation_owner_cap, market_id, claimable_rewards } = await this.getPositionInfo(position_id)
    console.log('🚀🚀🚀 ~ positionModules.ts:1650 ~ PositionModules ~ claimable_rewards:', claimable_rewards)


    await this.buildClaimRewardsMoveCall(claimable_rewards, market_id, position_cap_id, tx)


    return tx
  }

  /**
   * Pre-calculate for opening position
   */
  calculatePositionDeposit = async (params: CalculatePositionDepositParams) => {
    const {
      is_quote,
      is_long,
      amount,
      swap_clmm_pool = '',
      leverage,
      by_amount_in = true,
      base_token,
      quote_token,
      is_submit = false,
      is_open = true,
      position_id,
      market_id,
    } = params
    let otherToken: string[] = []
    let deposits: any[] = []
    let borrows: any[] = []
    const leverageThreshold = this._sdk.getLeverageThresholdForMarket(market_id)

    let current_leverage
    if (!is_open && position_id) {
      const { deposits: positionDeposits, borrows: positionBorrows } = await this.getPositionInfo(position_id)
      deposits = positionDeposits
      borrows = positionBorrows
      otherToken = this.extractOtherTokenTypes(deposits, borrows, base_token, quote_token)

      if (borrows.length > 0 && deposits.length > 0) {
        const borrowedAmountUsd = borrows[0].borrowedAmountUsd.toString()
        const depositedAmountUsd = deposits[0].depositedAmountUsd.toString()
        if (depositedAmountUsd && borrowedAmountUsd && d(borrowedAmountUsd).gt(0)) {
          current_leverage = d(depositedAmountUsd).div(d(depositedAmountUsd).sub(borrowedAmountUsd)).toString()
        }

      }

    }
    const { reserve, base_reserve_array_index, quote_reserve_array_index } = await this._sdk.SuiLendModule.getSuiLendReserveInfo(
      base_token,
      quote_token,
      undefined,
      otherToken
    )
    const baseTokenDecimal = reserve[0].mintDecimals
    const quoteTokenDecimal = reserve[1].mintDecimals
    // User's initial deposit coin
    let initDepositAmount = amount.toString()
    // First check if initial deposit coin needs conversion
    const has_swap = (is_long && is_quote) || (!is_long && !is_quote)
    const priceUpdateData = await this._sdk.SuiLendModule.getLatestPriceFeedsByCoinTypes([base_token, quote_token])
    const quotePrice = priceUpdateData && priceUpdateData[quote_token]?.price
    const basePrice = priceUpdateData && priceUpdateData[base_token]?.price
    if (!quotePrice || !basePrice) {
      throw handleError(MarginTradingErrorCode.PriceNotFound, 'Price not found')
    }
    if (has_swap && is_submit) {
      const rate = is_long ? d(quotePrice).div(d(basePrice)).toString() : d(basePrice).div(d(quotePrice)).toString()
      initDepositAmount = d(amount)
        .mul(rate)
        .div(10 ** (is_quote ? quoteTokenDecimal : baseTokenDecimal))
        .mul(10 ** (is_long ? baseTokenDecimal : quoteTokenDecimal))
        .toString()
      console.log('🚀🚀🚀 ~ positionModules.ts:492 ~ PositionModules ~ initDepositAmount:', { initDepositAmount, rate })
    } else if (has_swap && !is_submit) {
      const from = is_long ? quote_token : base_token
      const to = is_long ? base_token : quote_token
      const routers = await this._sdk.SwapModules.findRouters(from, to, initDepositAmount, true, [swap_clmm_pool])
      initDepositAmount = routers?.amount_out.toString()
    } else {
      initDepositAmount = amount
    }

    let has_flash_loan = false
    if (leverageThreshold) {
      has_flash_loan = is_long ? leverage > leverageThreshold.long_threshold : leverage > leverageThreshold.short_threshold
    } else {
      has_flash_loan = true
    }

    if (current_leverage && d(current_leverage).gt(leverage)) {
      has_flash_loan = true
    }

    let depositAmount
    let depositAmountUSD
    let borrowAmount
    let borrowAmountUSD
    let flash_loan_objs: any
    let quote_price
    let base_price
    let routers: any
    if (has_flash_loan) {
      // After conversion, calculate flash loan borrow amount
      const {
        base_price,
        quote_price,
        flash_amount,
        flash_loan_fee,
        flash_loan_coin,
        is_flash_a,
        clmm_pool,
        clmm_fee_tier,
        clmm_pool_coin_type_a,
        clmm_pool_coin_type_b,
      } = await this._sdk.SwapModules.calculateFlashLoan({
        is_long,
        leverage,
        base_token,
        quote_token,
        deposit_amount: initDepositAmount,
        reserve,
        base_token_decimal: baseTokenDecimal,
        quote_token_decimal: quoteTokenDecimal,
      })

      // Convert flash loan borrow amount to collateral asset
      const debtRouters = await this._sdk.SwapModules.findRouters(
        is_long ? quote_token : base_token,
        is_long ? base_token : quote_token,
        flash_amount.toString(),
        true,
        [swap_clmm_pool]
      )

      depositAmount = d(initDepositAmount).add(d(debtRouters?.amount_out.toString())).toDP(0, Decimal.ROUND_DOWN).toString()
      depositAmountUSD = d(depositAmount)
        .mul(is_long ? base_price : quote_price)
        .toString()

      borrowAmount = d(flash_amount).add(flash_loan_fee).toDP(0, Decimal.ROUND_UP).toString()
      borrowAmountUSD = d(borrowAmount)
        .mul(is_long ? quote_price : base_price)
        .toString()
      routers = debtRouters
      flash_loan_objs = {
        clmm_fee_tier,
        flash_loan_fee,
        flash_loan_coin,
        flash_amount,
        is_flash_a,
        clmm_pool_coin_type_a,
        clmm_pool_coin_type_b,
        clmm_pool,
      }
    } else {
      const collateralDecimal = is_long ? baseTokenDecimal : quoteTokenDecimal
      const debtDecimal = is_long ? quoteTokenDecimal : baseTokenDecimal


      const currentCollateralAmount = deposits.length > 0 ? deposits[0].depositedAmount.toString() : '0'
      const currentDebtAmount = borrows.length > 0 ? borrows[0].borrowedAmount.toString() : '0'

      const collateralPrice = is_long ? basePrice : quotePrice
      const debtPrice = is_long ? quotePrice : basePrice
      const addedCollateralAmount = d(initDepositAmount).div(10 ** collateralDecimal).toFixed(collateralDecimal)


      const {
        addBorrowAmount,
        addBorrowValue,
        addCollateralFromBorrow,
        finalCollateralAmount,
        finalCollateralValue,
        finalDebtAmount,
        finalDebtValue,
        addCollateralAmount,
        addCollateralValue,
      } = calcIncrementalLeverage(currentCollateralAmount, currentDebtAmount, addedCollateralAmount, collateralPrice, debtPrice, leverage.toString())

      depositAmount = d(addCollateralAmount).mul(10 ** collateralDecimal).toFixed(0, Decimal.ROUND_DOWN).toString()
      depositAmountUSD = d(addCollateralValue).mul(10 ** collateralDecimal).toString()

      borrowAmount = d(addBorrowAmount).mul(10 ** debtDecimal).toFixed(0, Decimal.ROUND_UP).toString()
      borrowAmountUSD = d(addBorrowValue).mul(10 ** debtDecimal).toString()

      const debtRouters = await this._sdk.SwapModules.findRouters(
        is_long ? quote_token : base_token,
        is_long ? base_token : quote_token,
        depositAmount,
        true,
        []
      )
      routers = debtRouters
    }

    let leverageDepositAmount = !is_quote
      ? d(amount).mul(leverage).toDP(0, Decimal.ROUND_DOWN).toString()
      : d(amount)
        .div(10 ** (is_quote ? quoteTokenDecimal : baseTokenDecimal))
        .mul(10 ** baseTokenDecimal)
        .mul(leverage)
        .div(basePrice)
        .toDP(0, Decimal.ROUND_DOWN)
        .toString()
    // console.log('🚀🚀🚀 ~ positionModules.ts:1583 ~ PositionModules ~ leverageDepositAmount:', leverageDepositAmount)

    let afterBorrowAmount = '0'
    let afterBorrowAmountUSD = '0'
    let afterDepositAmount = '0'
    let afterDepositAmountUSD = '0'
    if (!is_open && position_id) {
      if (borrows && borrows.length > 0) {
        // Remaining borrowed assets
        afterBorrowAmount = d(borrows[0].borrowedAmount.toString())
          .mul(is_long ? 10 ** quoteTokenDecimal : 10 ** baseTokenDecimal)
          .add(d(borrowAmount))
          .toString()
        afterBorrowAmountUSD = d(afterBorrowAmount)
          .mul(is_long ? quotePrice : basePrice)
          .toString()
      }
      // Remaining collateral assets
      afterDepositAmount = d(deposits[0].depositedAmount.toString())
        .mul(is_long ? 10 ** baseTokenDecimal : 10 ** quoteTokenDecimal)
        .add(d(depositAmount))
        .toString()
      afterDepositAmountUSD = d(afterDepositAmount)
        .mul(is_long ? basePrice : quotePrice)
        .toString()
    }

    return {
      routers,
      flash_loan_objs,
      quote_price,
      leverageDepositAmount,
      base_price,
      deposit_amount: depositAmount,
      borrow_amount: borrowAmount,
      deposit_amount_usd: depositAmountUSD,
      borrow_amount_usd: borrowAmountUSD,
      after_borrow_amount: afterBorrowAmount,
      after_borrow_amount_usd: afterBorrowAmountUSD,
      after_deposit_amount: afterDepositAmount,
      after_deposit_amount_usd: afterDepositAmountUSD,
      init_deposit_amount: initDepositAmount,
      base_reserve_array_index,
      quote_reserve_array_index,
      reserve,
      has_swap,
    }
  }

  private calculateCompoundDebt = async (options: CalculateCompoundDebtParams, tx: Transaction): Promise<{ compoundDebtU64: TransactionResult, compoundDebtAmount: string } | undefined> => {
    const {
      market_id,
      position_cap_id,
      borrow_reserve_array_index,
      borrow_index,
    } = options

    const { margin_trading: marginTradingConfig } = this._sdk.sdkOptions
    const { lending_market_type, lending_market_id } = getPackagerConfigs(this._sdk.sdkOptions.suilend)

    const devTx = new Transaction()
    devTx.moveCall({
      target: `${marginTradingConfig.published_at}::router::compound_debt`,
      typeArguments: [lending_market_type],
      arguments: [
        devTx.object(lending_market_id),
        devTx.object(market_id),
        devTx.object(position_cap_id),
        devTx.pure.u64(borrow_reserve_array_index),
        devTx.pure.u64(borrow_index),
      ],
    })

    const compoundDebtU64 = tx.moveCall({
      target: `${marginTradingConfig.published_at}::router::compound_debt`,
      typeArguments: [lending_market_type],
      arguments: [
        tx.object(lending_market_id),
        tx.object(market_id),
        tx.object(position_cap_id),
        tx.pure.u64(borrow_reserve_array_index),
        tx.pure.u64(borrow_index),
      ],
    })


    try {
      const res = await this._sdk.FullClient.devInspectTransactionBlock({
        transactionBlock: devTx,
        sender: this._sdk.getSenderAddress(),
      })

      if (res.error != null) {
        handleError(
          MarginTradingErrorCode.FetchError,
          new Error(res.error),
          {
            [DETAILS_KEYS.METHOD_NAME]: 'calculateCompoundDebt',
            [DETAILS_KEYS.REQUEST_PARAMS]: options,
          }
        )
      }

      if (!res.results || res.results.length === 0 || !res.results[0].returnValues || res.results[0].returnValues.length === 0) {
        handleError(
          MarginTradingErrorCode.FetchError,
          new Error('No return values from compound_debt'),
          {
            [DETAILS_KEYS.METHOD_NAME]: 'calculateCompoundDebt',
            [DETAILS_KEYS.REQUEST_PARAMS]: options,
          }
        )
      }

      const u64Value = bcs.u64().parse(Uint8Array.from(res?.results?.[0]?.returnValues?.[0]?.[0] || []))
      return {
        compoundDebtU64,
        compoundDebtAmount: u64Value.toString()

      }
    } catch (error) {
      return undefined
    }
  }

  calculatePositionWithdraw = async (params: CalculatePositionWithdrawParams) => {
    const { position_id, is_quote, swap_clmm_pool = '', amount, leverage, slippage, withdraw_max, tx } = params
    const { deposits, borrows, origin_obligation, position_cap_id, market_id, is_long, claimable_rewards } = await this.getPositionInfo(position_id)
    const { base_token, quote_token } = await this._sdk.MarketModules.getMarketInfo(market_id)

    const otherToken = position_id ? this.extractOtherTokenTypes(deposits, borrows, base_token, quote_token) : []

    const { reserve, base_reserve_map_info, quote_reserve_map_info } = await this._sdk.SuiLendModule.getSuiLendReserveInfo(
      base_token,
      quote_token,
      undefined,
      otherToken
    )
    const baseTokenDecimal = reserve[0].mintDecimals
    const quoteTokenDecimal = reserve[1].mintDecimals
    // ctoken exchange rate
    const ctokenExchangeRate = is_long ? base_reserve_map_info.cTokenExchangeRate : quote_reserve_map_info.cTokenExchangeRate
    // Get oracle price
    const priceUpdateData = await this._sdk.SuiLendModule.getLatestPriceFeeds(reserve, true)
    const quotePrice = priceUpdateData[removeHexPrefix(quote_token)]?.price
    const basePrice = priceUpdateData[removeHexPrefix(base_token)]?.price
    let withdrawAmountUSD = d(0)
    let withdrawAmount
    if (is_long) {
      withdrawAmountUSD = d(is_quote ? d(amount).mul(quotePrice).toString() : d(amount).mul(basePrice).toString()).div(
        is_quote ? 10 ** quoteTokenDecimal : 10 ** baseTokenDecimal
      )
      withdrawAmount = is_quote
        ? d(amount)
          .div(basePrice)
          .div(10 ** quoteTokenDecimal)
          .mul(10 ** baseTokenDecimal)
          .toString()
        : d(amount)
    } else {
      withdrawAmountUSD = d(is_quote ? d(amount).mul(quotePrice).toString() : d(amount).mul(basePrice).toString()).div(
        is_quote ? 10 ** quoteTokenDecimal : 10 ** baseTokenDecimal
      )
      withdrawAmount = is_quote
        ? d(amount)
        : d(amount)
          .mul(basePrice)
          .div(10 ** baseTokenDecimal)
          .mul(10 ** quoteTokenDecimal)
          .toString()
    }
    // User available withdrawal token value (net worth)
    const availableWithdrawAmountUSD = d(deposits[0].depositedAmountUsd.toString())
      .sub(d(borrows && borrows.length > 0 ? borrows[0].borrowedAmountUsd.toString() : '0'))
      .toString()
    // Withdrawal ratio
    const ratio = withdrawAmountUSD.div(d(availableWithdrawAmountUSD))
    let is_close = withdraw_max || d(ratio).gte(1)

    // const debtBorrow = compoundDebt(origin_obligation.borrows[0], is_long ? reserve[1] : reserve[0])
    // const borrowAmount = d(debtBorrow.borrowedAmount.value.toString())
    // .div(10 ** 18)
    // .toDP(0, Decimal.ROUND_UP)
    let debtBorrow,
      borrowAmount = new Decimal(0)
    if (origin_obligation && origin_obligation.borrows && origin_obligation.borrows.length > 0) {
      debtBorrow = compoundDebt(origin_obligation.borrows[0], is_long ? reserve[1] : reserve[0])
      borrowAmount = d(debtBorrow.borrowedAmount.value.toString())
        .div(10 ** 18)
        .toDP(0, Decimal.ROUND_UP)
    }
    let compoundDebtU64: TransactionResult | undefined
    // if (withdraw_max && tx) {
    //   const result = await this.calculateCompoundDebt({
    //     market_id,
    //     position_cap_id,
    //     borrow_reserve_array_index: borrows[0].reserveArrayIndex.toString(),
    //     borrow_index: "0",
    //   }, tx)
    //   if (result) {
    //     borrowAmount = d(result.compoundDebtAmount)
    //     compoundDebtU64 = result.compoundDebtU64
    //   }
    // }

    // Borrowed assets to be repaid
    let repayAmount = borrowAmount
      .mul(is_close ? 1.001 : ratio)
      .toDP(0, Decimal.ROUND_UP)
      .toString()
    // Flash loan amount equals repayment amount
    let flashLoanAmount = repayAmount.toString()
    let flashLoanFee, repayFlashLoanAmount, clmmFeeTier, clmmPool, clmmPoolCoinTypeA, clmmPoolCoinTypeB
    if (d(repayAmount).gt(0)) {
      const { clmm_pool_coin_type_a, clmm_pool_coin_type_b, clmm_fee_tier, clmm_pool } = await this._sdk.SwapModules.getFlashLoanPool(
        is_long ? quote_token : base_token,
        flashLoanAmount
      )
      clmmPoolCoinTypeA = clmm_pool_coin_type_a || ''
      clmmPoolCoinTypeB = clmm_pool_coin_type_b || ''
      clmmFeeTier = clmm_fee_tier || 0
      clmmPool = clmm_pool || ''
      // Flash loan fee
      flashLoanFee = d(flashLoanAmount).mul(clmm_fee_tier).toString()
      // Flash loan repayment amount
      repayFlashLoanAmount = d(flashLoanAmount).mul(d(1).add(clmm_fee_tier)).toDP(0, Decimal.ROUND_UP).toString()
    }

    // Target coin is quote for long position, base for short position
    const swapConvertAll = (is_long && is_quote) || (!is_long && !is_quote)
    let routers: any
    let partialAmountIn
    if (swapConvertAll) {
      // User's target asset equals borrow asset, convert all collateral assets
      const amountIn = d(deposits[0].depositedAmount.toString())
        .mul(10 ** (is_long ? baseTokenDecimal : quoteTokenDecimal))
        .mul(is_close ? 1 : ratio)
        .toDP(0, Decimal.ROUND_DOWN)
        .toString()
      routers = await this._sdk.SwapModules.findRouters(deposits[0].reserve.coinType, is_long ? quote_token : base_token, amountIn, true, [
        swap_clmm_pool,
      ])
    } else {
      // User's target asset doesn't equal borrow asset, partially convert collateral assets to repay debt
      const is_wbtc = '0x0041f9f9344cac094454cd574e333c4fdb132d7bcc9379bcd4aab485b2a63942::wbtc::WBTC' === base_token ||
        '0x0041f9f9344cac094454cd574e333c4fdb132d7bcc9379bcd4aab485b2a63942::wbtc::WBTC' === quote_token
      const buffer_rate =
        is_wbtc ? 0.01 : 0.0025
      partialAmountIn = d(repayAmount)
        .mul(is_long ? quotePrice : basePrice)
        .div(10 ** (is_long ? quoteTokenDecimal : baseTokenDecimal))
        .mul(10 ** (is_long ? baseTokenDecimal : quoteTokenDecimal))
        .div(is_long ? basePrice : quotePrice)
        .mul(d(1).add(buffer_rate))
        .toDP(0, Decimal.ROUND_DOWN)
        .toString()
      routers = await this._sdk.SwapModules.findRouters(
        deposits[0].reserve.coinType,
        is_long ? quote_token : base_token,
        partialAmountIn.toString(),
        true,
        [swap_clmm_pool]
      )
      // Actual repayment amount
      if (!is_close) {
        repayAmount = d(routers?.amount_out.toString()).mul(d(1).sub(slippage)).toDP(0, Decimal.ROUND_DOWN).toString()
      }
    }
    // Borrowed assets to be repaid, borrows[0].borrowedAmount doesn't handle decimal, need to process decimal
    // Borrowed asset amount
    // Withdrawal amount = User input amount * leverage
    withdrawAmount = d(withdrawAmount).mul(leverage).toDP(0, Decimal.ROUND_DOWN).toString()
    withdrawAmountUSD = d(withdrawAmountUSD).mul(leverage)

    // Remaining borrowed assets
    const afterBorrowAmount = borrowAmount.mul(d(1).sub(ratio)).toString()
    const afterBorrowAmountUSD = d(afterBorrowAmount)
      .mul(is_long ? quotePrice : basePrice)
      .toString()
    // Remaining collateral assets
    const afterDepositAmount = d(deposits[0].depositedAmount.toString())
      .mul(is_long ? 10 ** baseTokenDecimal : 10 ** quoteTokenDecimal)
      .sub(d(withdrawAmount))
      .toString()
    const afterDepositAmountUSD = d(afterDepositAmount)
      .mul(is_long ? basePrice : quotePrice)
      .toString()

    // Router amount
    const amountIn = d(routers?.amount_in.toString()).toString()
    const amountOut = d(routers?.amount_out.toString()).toString()

    const withdrawCtokenAmount = d(withdrawAmount).div(ctokenExchangeRate.toString()).toDP(0, Decimal.ROUND_DOWN).toString()
    const afterBorrowAmountUSDDDecimal = d(afterBorrowAmountUSD).div(d(10 ** (is_long ? quoteTokenDecimal : baseTokenDecimal)))
    const afterDepositAmountUSDDecimal = d(afterDepositAmountUSD).div(d(10 ** (is_long ? baseTokenDecimal : quoteTokenDecimal)))
    let hasFlashLoan = true
    if (borrows.length > 0) {
      const currentBorrowAmountUSD = d(borrows[0].borrowedAmountUsd.toString())
      const afterLTV = currentBorrowAmountUSD.div(afterDepositAmountUSDDecimal).toString()
      const ltv = d(deposits[0].reserve.config.openLtvPct).mul(d(0.95)).div(100).toString()
      console.log('🚀🚀🚀 ~ positionModules.ts:1459 ~ PositionModules ~ afterLTV:', {
        afterLTV,
        ltv,
        afterDepositAmount,
        afterDepositAmountUSD: afterDepositAmountUSDDecimal,
        afterBorrowAmount,
        afterBorrowAmountUSD: afterBorrowAmountUSDDDecimal,
        withdrawAmount,
        currentBorrowAmountUSD,
      })
      if (d(afterLTV).lte(ltv)) {
        hasFlashLoan = false
      }
    }

    return {
      compoundDebtU64,
      amount_in: amountIn,
      amount_out: amountOut,
      from: deposits[0].reserve.coinType,
      to: is_long ? base_token : quote_token,
      after_borrow_amount: afterBorrowAmount,
      after_borrow_amount_usd: afterBorrowAmountUSD,
      after_deposit_amount: afterDepositAmount,
      after_deposit_amount_usd: afterDepositAmountUSD,
      flash_loan_fee: flashLoanFee,
      clmm_fee_tier: clmmFeeTier,
      withdraw_amount: withdrawAmount,
      withdraw_ctoken_amount: withdrawCtokenAmount,
      repay_amount: repayAmount,
      ratio,
      is_close,
      is_long,
      deposits,
      borrows,
      reserve,
      base_token,
      quote_token,
      clmm_pool: clmmPool,
      clmm_pool_coin_type_a: clmmPoolCoinTypeA,
      clmm_pool_coin_type_b: clmmPoolCoinTypeB,
      position_cap_id,
      market_id,
      swap_convert_all: swapConvertAll,
      flash_loan_amount: flashLoanAmount,
      routers,
      repay_flash_loan_amount: repayFlashLoanAmount,
      partial_amount_in: partialAmountIn,
      has_flash_loan: hasFlashLoan,
      claimable_rewards
    }
  }

  calculatePositionLeverage = async (params: CalculatePositionLeverageParams) => {
    const { position_id, current_leverage, target_leverage, swap_clmm_pool = '' } = params
    const laverageDiff = d(target_leverage).sub(d(current_leverage))
    const isUpLeverage = laverageDiff.gt(0)
    const { borrows, deposits, is_long, position_cap_id, market_id } = await this.getPositionInfo(position_id)
    const { base_token, quote_token } = await this._sdk.MarketModules.getMarketInfo(market_id)
    const otherToken = this.extractOtherTokenTypes(deposits, borrows, base_token, quote_token)
    const { reserve } = await this._sdk.SuiLendModule.getSuiLendReserveInfo(base_token, quote_token, undefined, otherToken)
    const baseTokenDecimal = reserve[0].mintDecimals
    const quoteTokenDecimal = reserve[1].mintDecimals
    // Get oracle price
    const priceUpdateData = await this._sdk.SuiLendModule.getLatestPriceFeeds(reserve, true)
    const quotePrice = priceUpdateData[removeHexPrefix(quote_token)]?.price
    const basePrice = priceUpdateData[removeHexPrefix(base_token)]?.price
    const hasBorrow = borrows.length > 0
    // Current collateral value
    const currentDepositAmountUSD = deposits[0].depositedAmountUsd.toString()
    // Current collateral value
    const currentDepositAmount = deposits[0].depositedAmount.toString()
    // Current debt amount
    const currentBorrowAmount = hasBorrow
      ? d(borrows[0].borrowedAmount.toString()).mul(10 ** (is_long ? quoteTokenDecimal : baseTokenDecimal))
      : d(0)
    // Current debt value
    const currentBorrowAmountUSD = hasBorrow ? borrows[0].borrowedAmountUsd.toString() : d(0)
    const bw = hasBorrow ? d(borrows[0].reserve.config.borrowWeightBps.toString()).div(10000).toString() : '1'
    const openLTV = d(deposits[0].reserve.config.openLtvPct).mul(d(0.95)).div(100).div(bw).toString()

    // Leverage difference
    const remainingOpenUSD = d(currentDepositAmountUSD).sub(d(currentBorrowAmountUSD)).mul(openLTV).toString()
    if (isUpLeverage) {
      const flashLoanCtokenAmountUsd = d(currentDepositAmountUSD).div(current_leverage).mul(laverageDiff)
      const afterLTV = flashLoanCtokenAmountUsd.add(currentBorrowAmountUSD).div(currentDepositAmountUSD).toString()

      const flashLoanCtokenAmount = flashLoanCtokenAmountUsd
        .div(is_long ? quotePrice : basePrice)
        .mul(10 ** (is_long ? quoteTokenDecimal : baseTokenDecimal))
        .toDP(0, Decimal.ROUND_UP)
      // Flash loan is needed when leverage difference exceeds maximum open amount
      const isFlashLoan = d(afterLTV).gt(openLTV)
      const flashLoanAmount = flashLoanCtokenAmount
      // Amount needed for increasing leverage, borrowed from flash loan
      // Convert flash loan borrowed portion to collateral
      const from = is_long ? quote_token : base_token
      const to = is_long ? base_token : quote_token
      const routers = await this._sdk.SwapModules.findRouters(from, to, flashLoanAmount.toString(), true, [swap_clmm_pool])
      // Collateral amount
      const depositAmount = d(routers?.amount_out.toString()).toString()
      // Collateral value
      const depositAmountUSD = d(depositAmount)
        .mul(is_long ? basePrice : quotePrice)
        .toString()

      let flashLoanFee
      let isLoanA
      let clmm_fee_tier
      let clmm_pool_coin_type_a
      let clmm_pool_coin_type_b
      let borrowAmount = '0'
      let borrowAmountUSD = '0'
      if (isFlashLoan) {
        const {
          clmm_pool_coin_type_a: flashLoanClmmPoolCoinTypeA,
          clmm_pool_coin_type_b: flashLoanClmmPoolCoinTypeB,
          clmm_pool,
          clmm_fee_tier: flashLoanClmmFeeTier,
        } = await this._sdk.SwapModules.getFlashLoanPool(from, flashLoanAmount.toString())
        clmm_fee_tier = flashLoanClmmFeeTier
        clmm_pool_coin_type_a = flashLoanClmmPoolCoinTypeA
        clmm_pool_coin_type_b = flashLoanClmmPoolCoinTypeB
        // Remaining available amount for opening position
        flashLoanFee = flashLoanAmount.mul(clmm_fee_tier).toString()
        isLoanA = is_long ? clmm_pool_coin_type_a == quote_token : clmm_pool_coin_type_b == base_token

        // Collateralize
        // Borrow assets to repay flash loan
        const debtAmount = d(flashLoanAmount).add(flashLoanFee).toDP(0, Decimal.ROUND_UP)
        borrowAmount = debtAmount.toString()
        borrowAmountUSD = d(borrowAmount)
          .mul(is_long ? quotePrice : basePrice)
          .toString()
      } else {
        borrowAmount = flashLoanCtokenAmount.toString()
        borrowAmountUSD = flashLoanCtokenAmountUsd.toString()
      }

      const afterDepositAmount = d(currentDepositAmount)
        .add(d(depositAmount).div(10 ** (is_long ? baseTokenDecimal : quoteTokenDecimal)))
        .toString()
      const afterDepositAmountUSD = d(afterDepositAmount)
        .mul(is_long ? basePrice : quotePrice)
        .toString()

      const afterBorrowAmount = d(currentBorrowAmount)
        .add(d(borrowAmount))
        .div(10 ** (is_long ? quoteTokenDecimal : baseTokenDecimal))
        .toString()
      const afterBorrowAmountUSD = d(afterBorrowAmount)
        .mul(is_long ? quotePrice : basePrice)
        .toString()

      return {
        amount_in: routers?.amount_in.toString(),
        amount_out: routers?.amount_out.toString(),
        flash_loan_fee: flashLoanFee,
        deposit_amount: depositAmount,
        borrow_amount: borrowAmount,
        deposit_amount_usd: depositAmountUSD,
        borrow_amount_usd: borrowAmountUSD,
        flash_loan_amount: flashLoanAmount,
        base_token,
        quote_token,
        reserve,
        deposits,
        borrows,
        clmm_fee_tier,
        is_flash_loan: isFlashLoan,
        is_loan_a: isLoanA,
        clmm_pool_coin_type_a,
        clmm_pool_coin_type_b,
        after_deposit_amount: afterDepositAmount,
        after_borrow_amount: afterBorrowAmount,
        after_deposit_amount_usd: afterDepositAmountUSD,
        after_borrow_amount_usd: afterBorrowAmountUSD,
        position_cap_id,
        market_id,
        is_long,
        routers,
      }
    } else {
      // User net worth
      const netValue = d(currentDepositAmountUSD).div(current_leverage)
      // Repayment amount needed for decreasing leverage
      const repayAmount = netValue
        .mul(laverageDiff.abs())
        .div(is_long ? quotePrice : basePrice)
        .mul(10 ** (is_long ? quoteTokenDecimal : baseTokenDecimal))
        .toDP(0, Decimal.ROUND_UP)
      // Given repayment amount, calculate how much collateral asset needs to be withdrawn
      const routers = await this._sdk.SwapModules.findRouters(
        deposits[0].reserve.coinType,
        borrows[0].reserve.coinType,
        repayAmount.toString(),
        false,
        [swap_clmm_pool]
      )
      // Amount of collateral asset to withdraw
      const withdrawCtokenAmount = routers?.amount_in.toString()
      const withdrawCtokenAmountUsd = d(withdrawCtokenAmount)
        .mul(is_long ? basePrice : quotePrice)
        .div(10 ** (is_long ? baseTokenDecimal : quoteTokenDecimal))
        .toString()
      const openLtvAmountUSD = d(currentDepositAmountUSD).mul(openLTV).toString()

      const afterLTV = d(currentBorrowAmountUSD)
        .div(d(currentDepositAmountUSD).sub(d(withdrawCtokenAmountUsd)))
        .toString()

      // Flash loan is needed when leverage difference exceeds maximum open amount
      const isFlashLoan = d(afterLTV).gt(openLTV)
      const borrowAmount = repayAmount.toString()
      const borrowAmountUSD = d(borrowAmount)
        .mul(is_long ? quotePrice : basePrice)
        .toString()
      const depositAmount = withdrawCtokenAmount
      const depositAmountUSD = d(depositAmount)
        .mul(is_long ? basePrice : quotePrice)
        .toString()

      let clmm_fee_tier
      let clmm_pool_coin_type_a = ''
      let clmm_pool_coin_type_b = ''
      if (isFlashLoan) {
        const {
          clmm_pool_coin_type_a: flashLoanClmmPoolCoinTypeA,
          clmm_pool_coin_type_b: flashLoanClmmPoolCoinTypeB,
          clmm_pool,
          clmm_fee_tier: flashLoanClmmFeeTier,
        } = await this._sdk.SwapModules.getFlashLoanPool(borrows[0].reserve.coinType, borrowAmount.toString())
        clmm_fee_tier = flashLoanClmmFeeTier
        clmm_pool_coin_type_a = flashLoanClmmPoolCoinTypeA
        clmm_pool_coin_type_b = flashLoanClmmPoolCoinTypeB
      }

      const afterDepositAmount = d(currentDepositAmount)
        .sub(d(depositAmount).div(10 ** (is_long ? baseTokenDecimal : quoteTokenDecimal)))
        .toString()
      const afterDepositAmountUSD = d(afterDepositAmount)
        .mul(is_long ? basePrice : quotePrice)
        .toString()

      const afterBorrowAmount = d(currentBorrowAmount)
        .sub(d(borrowAmount))
        .div(10 ** (is_long ? quoteTokenDecimal : baseTokenDecimal))
        .toString()
      const afterBorrowAmountUSD = d(afterBorrowAmount)
        .mul(is_long ? quotePrice : basePrice)
        .toString()

      return {
        amount_in: routers?.amount_in.toString(),
        amount_out: routers?.amount_out.toString(),
        deposit_amount: depositAmount,
        borrow_amount: borrowAmount,
        deposit_amount_usd: depositAmountUSD,
        borrow_amount_usd: borrowAmountUSD,
        base_token,
        quote_token,
        reserve,
        deposits,
        borrows,
        clmm_fee_tier,
        withdraw_ctoken_amount: withdrawCtokenAmount,
        is_flash_loan: isFlashLoan,
        clmm_pool_coin_type_a,
        clmm_pool_coin_type_b,
        after_deposit_amount: afterDepositAmount,
        after_borrow_amount: afterBorrowAmount,
        after_deposit_amount_usd: afterDepositAmountUSD,
        after_borrow_amount_usd: afterBorrowAmountUSD,
        position_cap_id,
        market_id,
        is_long,
        routers,
      }
    }
  }

  calculatePositionRepay = async (params: CalculatePositionRepayParams) => {
    const { position_id, amount, is_quote } = params
    const { borrows, deposits, is_long, market_id, position_cap_id } = await this._sdk.PositionModules.getPositionInfo(position_id)
    const repayCoinType = borrows[0].reserve.coinType
    const baseToken = is_long ? deposits[0].reserve.coinType : borrows[0].reserve.coinType
    const quoteToken = is_long ? borrows[0].reserve.coinType : deposits[0].reserve.coinType
    let routers: any

    const hasSwap = is_long ? !is_quote : is_quote
    if (hasSwap) {
      routers = await this._sdk.SwapModules.findRouters(is_quote ? quoteToken : baseToken, repayCoinType, amount, true, [])
    }
    return {
      routers,
      repay_coin_type: repayCoinType,
      base_token: baseToken,
      quote_token: quoteToken,
      is_long,
      borrows,
      deposits,
      market_id,
      position_cap_id,
      has_swap: hasSwap,
    }
  }
}
