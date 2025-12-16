import { CetusZapSDK } from '../sdk'
import { 
  ClosePosReturnAmountCoinAParams,
  ClosePosOnlyReturnAmountCoinsParams,
  CollectFeeAndRewardsAndReturnCoinsParams,
  CalculateClaimMergeParams,
  CreateClaimMergePayloadParams,
  RebalanceResult,
  CalculateRebalanceParams,
  CreateMovePositionPayloadParams,
  PreSwapParams,
  CreateCompoundRebalanceAddPayload
} from '../types'
import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions'
import { getPackagerConfigs, CLOCK_ADDRESS, SuiAddressType, ClmmPoolUtil, d, TickMath, fixCoinType, CoinAssist, toDecimalsAmount, fromDecimalsAmount, asUintN } from '@cetusprotocol/common-sdk'
import BN from 'bn.js'
import {calculateLiquidityAmountEnough} from '../utils/zap'
import {calculateLiquidityWithFallback, isEmptyObj, isNotMergeCoin, isSameType} from '../utils/compound'
import { ClmmIntegratePoolV2Module, PositionUtils, ClmmIntegrateRouterModule } from '@cetusprotocol/sui-clmm-sdk'
import {BuildRouterSwapParamsV3} from '@cetusprotocol/aggregator-sdk'

// Constants
const DEFAULT_SLIPPAGE = 0.005
const DEFAULT_MAX_REMAIN_RATE = 0.01
const DEFAULT_DEPTH = 3
const MAX_U64 = '999999999999999'

export class CompoundModule {
  protected _sdk: CetusZapSDK

  constructor(sdk: CetusZapSDK) {
    this._sdk = sdk
  }

  /**
   * Returns the associated SDK instance
   */
  get sdk() {
    return this._sdk
  }

  /**
   * Pre-calculate fee, rewarder amounts and merge swap rewarders to target coin type(Mainly used for test cases)
   * @param params - Parameters for fee and reward calculation including:
   *                 - pool_id: ID of the liquidity pool
   *                 - position_id: ID of the position
   *                 - coin_type_a/b: Coin types for the trading pair
   *                 - rewarder_types: Array of rewarder coin types
   *                 - merge_swap_target_coin_type: Target coin type for merge swap
   * @returns Object containing calculated coin amounts and merge swap routers
   */
  async getFeeAndReward(params: {
    pool_id: string
    farms_pool_id?: string
    position_id: string
    coin_type_a: SuiAddressType
    coin_type_b: SuiAddressType
    rewarder_types: string[]
    merge_swap_target_coin_type: string
    not_merge_coins: string[]
  }) {
    const {pool_id, position_id, coin_type_a, coin_type_b, rewarder_types, merge_swap_target_coin_type, farms_pool_id, not_merge_coins} = params

    let coin_amount_a = '0'
    let coin_amount_b = '0'
    let other_rewarder: Record<string, string> = {}

    // Fetch fee amounts
    const feeResult = await this._sdk.ClmmSDK.Position.fetchPosFeeAmount([{
      pool_id,
      position_id,
      coin_type_a,
      coin_type_b,
    }])

    if (feeResult[0]) {
      coin_amount_a = isNotMergeCoin(not_merge_coins, coin_type_a) ? feeResult[0].fee_owned_a : '0'
      coin_amount_b = isNotMergeCoin(not_merge_coins, coin_type_b) ? feeResult[0].fee_owned_b : '0'
    }

    // Fetch rewarder amounts if any
    if (rewarder_types?.length > 0 && !farms_pool_id) {
      const rewarderResult = await this._sdk.ClmmSDK.Rewarder.fetchPosRewardersAmount([{
        pool_id,
        position_id,
        coin_type_a,
        coin_type_b,
        rewarder_types,
      }])

      if (rewarderResult[0].rewarder_amounts?.length > 0) {
        rewarderResult[0].rewarder_amounts.forEach((rewarder) => {
          const fixedCoinType = fixCoinType(rewarder.coin_type)
          if (fixedCoinType === fixCoinType(coin_type_a) && isNotMergeCoin(not_merge_coins, coin_type_a)) {
            coin_amount_a = d(coin_amount_a).add(rewarder.amount_owned).toString()
          } else if (fixedCoinType === fixCoinType(coin_type_b) && isNotMergeCoin(not_merge_coins, coin_type_b)) {
            coin_amount_b = d(coin_amount_b).add(rewarder.amount_owned).toString()
          } else if (fixedCoinType !==fixCoinType(merge_swap_target_coin_type) && (isNotMergeCoin(not_merge_coins, fixedCoinType))) {
            other_rewarder[fixedCoinType] = rewarder.amount_owned
          }
        })
      }
    }

    // Handle merge swap for other rewarders
    let mergeSwapResult
    if (!isEmptyObj(other_rewarder)) {
      mergeSwapResult = await this.performMergeSwap(other_rewarder, merge_swap_target_coin_type)
      
      if (mergeSwapResult?.totalAmountOut) {
        const amountOutWithSlippage = this.calculateAmountWithSlippage(
          mergeSwapResult.totalAmountOut.toString(), 
          DEFAULT_SLIPPAGE
        )
        
        if (fixCoinType(merge_swap_target_coin_type) === fixCoinType(coin_type_a)) {
          coin_amount_a = d(coin_amount_a).add(amountOutWithSlippage).toString()
        } else {
          coin_amount_b = d(coin_amount_b).add(amountOutWithSlippage).toString()
        }
      }
    }

    return {
      coin_amount_a,
      coin_amount_b,
      merge_routers: mergeSwapResult
    }
  }

   /**
   * Pre-calculate claim merge parameters for harvesting and swapping rewards (Mainly used for test cases)
   * @param params - Parameters for claim merge calculation including:
   *                 - coin_type_a/b: Coin types for the trading pair
   *                 - pool_id: ID of the liquidity pool
   *                 - position_id: ID of the position
   *                 - rewarder_types: Array of rewarder coin types
   *                 - target_coin_type: Target coin type for merge swap
   * @returns Promise resolving to merge swap result with optimal routing
   */
  async calculateClaimMerge(params: CalculateClaimMergeParams) {
    const { coin_type_a, coin_type_b, pool_id, position_id, rewarder_types, target_coin_type, not_merge_coins, farms_pool_id } = params
    const mergeSwapFroms = []
    const feeResult = await this._sdk.ClmmSDK.Position.fetchPosFeeAmount([{
      pool_id,
      position_id,
      coin_type_a,
      coin_type_b,
    }])

    if (d(feeResult[0].fee_owned_a).gt(0) && !not_merge_coins.includes(coin_type_a)) {
      mergeSwapFroms.push({
        coinType: coin_type_a,
        amount: feeResult[0].fee_owned_a
      })
    }

    if (d(feeResult[0].fee_owned_b).gt(0) && !not_merge_coins.includes(coin_type_b)) {
      mergeSwapFroms.push({
        coinType: coin_type_b,
        amount: feeResult[0].fee_owned_b
      })
    }

    if (rewarder_types?.length > 0 && !farms_pool_id) {
      const rewarderResult = await this._sdk.ClmmSDK.Rewarder.fetchPosRewardersAmount([{
        pool_id,
        position_id,
        coin_type_a,
        coin_type_b,
        rewarder_types,
      }])

      if (rewarderResult[0].rewarder_amounts?.length >0) {
        rewarderResult[0].rewarder_amounts.forEach((rewarder) => {
          if (fixCoinType(rewarder.coin_type) === fixCoinType(coin_type_a) && fixCoinType(rewarder.coin_type) === fixCoinType(coin_type_b) && !not_merge_coins.includes(rewarder.coin_type)) {
            mergeSwapFroms.push({
              coinType: rewarder.coin_type,
              amount: rewarder.amount_owned
            })
          }
        })
      }
    }

    if (mergeSwapFroms?.length > 0) {
      const mergeSwapParams = {
        target: target_coin_type,
        byAmountIn: true,
        depth: DEFAULT_DEPTH,
        froms: mergeSwapFroms
      }
  
      const client = this._sdk.AggregatorClient
      const mergeRes = await client.findMergeSwapRouters(mergeSwapParams)
      return mergeRes
    }

    return null 
  }

  /**
   * Helper method to perform merge swap
   */
  private async performMergeSwap(otherRewarder: Record<string, string>, targetCoinType: string) {
    const client = this._sdk.AggregatorClient
    const mergeSwapParams = {
      target: targetCoinType,
      byAmountIn: true,
      depth: DEFAULT_DEPTH,
      froms: Object.entries(otherRewarder).map(([key, value]) => ({
        coinType: key,
        amount: value
      }))
    }

    return await client.findMergeSwapRouters(mergeSwapParams)
  }

  /**
   * Helper method to calculate amount with slippage
   */
  private calculateAmountWithSlippage(amount: string, slippage: number): string {
    return d(amount).mul(d(1 - slippage)).floor().toString()
  }


  /**
   * Pre-calculate rebalancing for optimal liquidity allocation
   * @param params - Parameters for rebalancing calculation including:
   *                 - pool_id: ID of the liquidity pool
   *                 - coin_type_a/b: Coin types for the trading pair
   *                 - coin_decimal_a/b: Decimal precision for each coin
   *                 - amount_a/b: Current amounts of each coin
   *                 - tick_lower/upper: Price range boundaries
   *                 - current_sqrt_price: Current square root price
   *                 - slippage: Slippage tolerance
   *                 - max_remain_rate: Maximum remaining rate threshold
   *                 - mark_price: Optional mark price for calculation
   *                 - verify_price_loop: Loop counter for price verification
   * @returns Promise resolving to RebalanceResult with optimal allocation
   */
  async calculateRebalance(params: CalculateRebalanceParams): Promise<RebalanceResult> {
    const {
      pool_id,
      coin_type_a,
      coin_type_b,
      coin_decimal_a,
      coin_decimal_b,
      amount_a,
      amount_b,
      tick_lower,
      tick_upper,
      current_sqrt_price,
      slippage,
      max_remain_rate = DEFAULT_MAX_REMAIN_RATE,
      mark_price,
      verify_price_loop = 0
    } = params

    const curr_tick = TickMath.sqrtPriceX64ToTickIndex(new BN(current_sqrt_price))

    if (curr_tick < tick_lower) { // Rebalancing range is single-sided a
      return this.calculateRebalanceToOnlyOneSide(params, true)
    } else if (curr_tick >= tick_upper) { // Rebalancing range is single-sided b
      return this.calculateRebalanceToOnlyOneSide(params, false)
    }

    // The following is the balance within the range

    const { ratio_a, ratio_b } = ClmmPoolUtil.calculateDepositRatio(tick_lower, tick_upper, new BN(current_sqrt_price))

    // 1. Determine the 3 cases of amounts on both sides
    let use_amount_a
    let use_amount_b
    let fix_amount_a
    let remain_amount
    let remain_amount_is_a = true
    if (d(amount_a).gt(0) && d(amount_b).eq(0)) {// Only a
      use_amount_a = '0'
      use_amount_b = '0'
      fix_amount_a = true
      remain_amount = amount_a
      remain_amount_is_a = true
    } else if (d(amount_b).gt(0) && d(amount_a).eq(0)) {// Only b
      use_amount_a = '0'
      use_amount_b = '0'
      fix_amount_a = false
      remain_amount = amount_b
      remain_amount_is_a = false
    } else { // Both sides have amounts
      const result = calculateLiquidityWithFallback({
        current_sqrt_price,
        tick_lower,
        tick_upper,
        amount_a,
        amount_b,
        slippage
      })
      use_amount_a = result.use_amount_a  
      use_amount_b = result.use_amount_b
      fix_amount_a = result.fix_amount_a
      remain_amount = result.remain_amount
      remain_amount_is_a = !fix_amount_a
      fix_amount_a = remain_amount_is_a
      
    }

    
    // Remaining amount rebalancing
    const currPrice = TickMath.sqrtPriceX64ToPrice(new BN(current_sqrt_price), coin_decimal_a, coin_decimal_b)
    const swapPrice = mark_price ? d(mark_price) : currPrice

    // Calculate optimal allocation of remaining amounts based on fix_amount_a and ratio
    let swapAmount: string
    // let receiveAmount: string
    let afterSwapA, afterSwapB // a,b after allocation
    const remain_amount_from_decimals = fromDecimalsAmount(remain_amount.toString(), remain_amount_is_a ? coin_decimal_a : coin_decimal_b)

    if (!mark_price) {
      if (!remain_amount_is_a) {
        // Remaining amount is token B
        // Calculate the amount of token B to swap based on current ratio
        // ratio_a/ratio_b = x / (remain - x) derived formula
        // x = (ratio_a * remain) / (ratio_a + ratio_b)
        swapAmount =toDecimalsAmount(d(ratio_a).mul(remain_amount_from_decimals).div(d(ratio_a).add(d(ratio_b))).toFixed(coin_decimal_b), coin_decimal_b)
        // receiveAmount = toDecimalsAmount(d(fromDecimalsAmount(swapAmount.toString(), coin_decimal_b)).div(swapPrice).toFixed(coin_decimal_a), coin_decimal_a)
      } else {
        // Remaining amount is token A
        // Calculate the amount of token A to swap based on current ratio
        // ratio_a/ratio_b = (remain - x)*price / (x*price) derived formula
        // x = (ratio_b × remain) / (ratio_a + ratio_b)
        swapAmount = toDecimalsAmount(d(ratio_b).mul(remain_amount_from_decimals).div(d(ratio_a).add(d(ratio_b))).toFixed(coin_decimal_a), coin_decimal_a)
        // receiveAmount = toDecimalsAmount(d(fromDecimalsAmount(swapAmount.toString(), coin_decimal_a)).mul(swapPrice).toFixed(coin_decimal_b), coin_decimal_b)
      }
    } else {
      if (!remain_amount_is_a) {
        // 剩余B
        // 调整ratio_a：因为实际价格不同，价值比例可能需要调整
        const priceRatio = d(mark_price).div(currPrice)
        const adjustedRatioA = ratio_a.mul(priceRatio)
        const adjustedRatioB = ratio_b
        
        // 用调整后的ratio重新计算
        swapAmount = toDecimalsAmount(
          d(adjustedRatioA)
            .mul(remain_amount_from_decimals)
            .div(d(adjustedRatioA).add(d(adjustedRatioB)))
            .toFixed(coin_decimal_b),
          coin_decimal_b
        )
      } else {
        // 剩余A
        const priceRatio = d(mark_price).div(currPrice)
        const adjustedRatioA = ratio_a
        const adjustedRatioB = ratio_b.div(priceRatio)
        
        swapAmount = toDecimalsAmount(
          d(adjustedRatioB)
            .mul(remain_amount_from_decimals)
            .div(d(adjustedRatioA).add(d(adjustedRatioB)))
            .toFixed(coin_decimal_a),
          coin_decimal_a
        )
      }
    }
    


    // findRouter for actual rebalancing attempt
    let swapResult
    let isVerifySwapResult = false

    try {
      let realAmountA, realAmountB
      let routerPrice = swapPrice

      if (d(swapAmount).gt(0)) {
        swapResult = await this._sdk.Zap.findRouters(
          pool_id,
          current_sqrt_price,
          remain_amount_is_a ? coin_type_a : coin_type_b,
          remain_amount_is_a ? coin_type_b : coin_type_a,
          d(swapAmount),
          true,
          remain_amount_is_a ? coin_decimal_a : coin_decimal_b,
          remain_amount_is_a ? coin_decimal_b : coin_decimal_a
        )
  
        routerPrice = remain_amount_is_a ? d(swapResult.swap_price) : d(1).div(d(swapResult.swap_price))
        
        // Calculate actual swap out amount with slippage
        const swapAmountOutWithSlippage = this.calculateAmountWithSlippage(swapResult.swap_out_amount, slippage)
  
        afterSwapA = remain_amount_is_a ? d(remain_amount).sub(swapResult.swap_in_amount).toString() : swapAmountOutWithSlippage
        
        afterSwapB = remain_amount_is_a ? swapAmountOutWithSlippage : d(remain_amount).sub(swapResult.swap_in_amount).toString()
        
        realAmountA = d(use_amount_a).add(afterSwapA).toFixed(0)
        realAmountB = d(use_amount_b).add(afterSwapB).toFixed(0)
      } else {
        realAmountA = use_amount_a
        
        realAmountB = use_amount_b
      }

      let res = calculateLiquidityAmountEnough(
        realAmountA,
        realAmountB,
        current_sqrt_price,
        tick_lower,
        tick_upper,
        0,
        fix_amount_a
      )

      // Rebalancing logic
      // 1. res.is_enough_amount is true means there's remaining amount, need to check if remaining amount is greater than max_remain_rate
      // 2. If remaining amount is greater than max_remain_rate, need to continue calculating swapAmount using actual amount after swap
      // 3. If remaining amount is less than max_remain_rate, return original calculation result
      
      // TODO: This may need adjustment based on situation later
      const remain_ratio = res.remain_amount.div(fix_amount_a ? realAmountB : realAmountA).abs().toString()
      // if (res.is_enough_amount && d(remain_ratio).gt(d(max_remain_rate)) && verify_price_loop < 3) {
      if (d(remain_ratio).gt(d(max_remain_rate)) && verify_price_loop < 3) {
        return await this.calculateRebalance({
          ...params,
          mark_price: routerPrice.toString(),
          verify_price_loop: verify_price_loop + 1
        })
      } 

      if(!res.is_enough_amount) {
        fix_amount_a = !fix_amount_a
          
        res = calculateLiquidityAmountEnough(
          realAmountA,
          realAmountB,
          current_sqrt_price,
          tick_lower,
          tick_upper,
          0,
          fix_amount_a
        )
      }

      return {
        liquidity: res.liquidity,
        use_amount_a: res.use_amount_a,
        use_amount_b: res.use_amount_b,
        tick_lower,
        tick_upper,
        fix_amount_a: fix_amount_a,
        remain_amount: res.remain_amount.toString(),
        swap_result: swapResult
      }
    } catch (error) {
      // If swap fails, return original calculation result
      return {
        liquidity: '',
        use_amount_a: '',
        use_amount_b: '',
        tick_lower,
        tick_upper,
        fix_amount_a: true,
        remain_amount: remain_amount.toString(),
        swap_amount_in: swapAmount,
        swap_in_coin_type: remain_amount_is_a ? coin_type_a : coin_type_b,
        error: (error as Error).message || 'Swap failed'
      }
    }
  
  }

  /**
   * Rebalance to single-sided range when current price is outside the range
   * @param params - Parameters for single-sided rebalancing including:
   *                 - pool_id: ID of the liquidity pool
   *                 - coin_type_a/b: Coin types for the trading pair
   *                 - coin_decimal_a/b: Decimal precision for each coin
   *                 - amount_a/b: Current amounts of each coin
   *                 - tick_lower/upper: Price range boundaries
   *                 - current_sqrt_price: Current square root price
   *                 - slippage: Slippage tolerance
   *                 - max_remain_rate: Maximum remaining rate threshold
   *                 - mark_price: Optional mark price for calculation
   *                 - verify_price_loop: Loop counter for price verification
   * @param only_have_coin_a - Whether only coin A should be used (true) or coin B (false)
   * @returns Promise resolving to RebalanceResult for single-sided allocation
   */
  async calculateRebalanceToOnlyOneSide(params: CalculateRebalanceParams, only_have_coin_a: boolean) {
    const {
      pool_id,
      coin_type_a,
      coin_type_b,
      coin_decimal_a,
      coin_decimal_b,
      amount_a,
      amount_b,
      tick_lower,
      tick_upper,
      current_sqrt_price,
      slippage,
      max_remain_rate = DEFAULT_MAX_REMAIN_RATE,
      mark_price,
      verify_price_loop = 0,
      old_pos_origin_amount_a,
      old_pos_origin_amount_b,
    } = params
    

    if (only_have_coin_a) {
      if (d(amount_b).gt(0)) { // b needs to be swapped to a

        try {
          const { swapResult, swapAmountOutWithSlippage } = await this.preSwap({
            pool_id,
            current_sqrt_price,
            from_coin_type: coin_type_b,
            target_coin_type: coin_type_a,
            amount: amount_b,
            from_coin_decimal: coin_decimal_b,
            target_coin_decimal: coin_decimal_a,
            is_a2b: false,
            slippage
          })

          const liquidity = ClmmPoolUtil.estimateLiquidityFromCoinAmounts(new BN(current_sqrt_price), tick_lower, tick_upper, {
            coin_amount_a: d(amount_a).add(swapAmountOutWithSlippage).toString(),
            coin_amount_b: '0'
          })

          return {
            liquidity,
            use_amount_a: d(amount_a).add(swapAmountOutWithSlippage).toString(),
            use_amount_b: '0',
            fix_amount_a: true,
            remain_amount: '0',
            tick_lower,
            tick_upper,
            display_swap_amount_in: old_pos_origin_amount_b,
            swap_result: swapResult,
          }
        } catch (error) {
          return {
            liquidity: '',
            use_amount_a: '',
            use_amount_b: '',
            tick_lower,
            tick_upper,
            fix_amount_a: true,
            remain_amount: '',
            swap_amount_in: old_pos_origin_amount_b,
            swap_in_coin_type: coin_type_b,
            error: (error as Error).message || 'Swap failed'
          }
        }

      } else {
        const liquidity = ClmmPoolUtil.estimateLiquidityFromCoinAmounts(new BN(current_sqrt_price), tick_lower, tick_upper, {
          coin_amount_a: amount_a,
          coin_amount_b: '0'
        })

        return {
          liquidity,
          use_amount_a: amount_a,
          use_amount_b: '0',
          fix_amount_a: true,
          remain_amount: '0',
          tick_lower,
          tick_upper,
        }
      }
    } else {
      if (d(amount_a).gt(0)) { // a needs to be swapped to b
        try {
          const { swapResult, swapAmountOutWithSlippage } = await this.preSwap({
            pool_id,
            current_sqrt_price,
            from_coin_type: coin_type_a,
            target_coin_type: coin_type_b,
            amount: amount_a,
            from_coin_decimal: coin_decimal_a,
            target_coin_decimal: coin_decimal_b,
            is_a2b: true,
            slippage
          })
  
          const liquidity = ClmmPoolUtil.estimateLiquidityFromCoinAmounts(new BN(current_sqrt_price), tick_lower, tick_upper, {
            coin_amount_a: '0',
            coin_amount_b: d(amount_b).add(swapAmountOutWithSlippage).toString()
          })
  
          return {
            liquidity,
            use_amount_a: '0',
            use_amount_b: d(amount_b).add(swapAmountOutWithSlippage).toString(),
            fix_amount_a: false,
            remain_amount: '0',
            tick_lower,
            tick_upper,
            display_swap_amount_in: old_pos_origin_amount_a,
            swap_result: swapResult,
          }
        } catch(error) {
          return {
            liquidity: '',
            use_amount_a: '',
            use_amount_b: '',
            tick_lower,
            tick_upper,
            fix_amount_a: false,
            remain_amount: '',
            swap_amount_in: old_pos_origin_amount_a,
            swap_in_coin_type: coin_type_a,
            error: (error as Error).message || 'Swap failed'
          }
        }
        
      } else {
        const liquidity = ClmmPoolUtil.estimateLiquidityFromCoinAmounts(new BN(current_sqrt_price), tick_lower, tick_upper, {
          coin_amount_a: '0',
          coin_amount_b: amount_b
        })
        return {
          liquidity,
          use_amount_a: '0',
          use_amount_b: amount_b,
          fix_amount_a: false,
          remain_amount: '0',
          tick_lower,
          tick_upper,
        }
      }
    }

  }


  async closeAndHarvestFarmsPos(params: {
    pool_id: string
    farms_pool_id: string
    pos_id: string
    coin_type_a: string
    coin_type_b: string
    min_amount_a: string
    min_amount_b: string
    delta_liquidity: string
    not_close?: boolean
  }, tx: Transaction) {
    const { pool_id, farms_pool_id, pos_id, coin_type_a,coin_type_b, min_amount_a, min_amount_b, not_close } = params
    const { farms } = this._sdk.FarmsSDK.sdkOptions
    const farmsConfig = getPackagerConfigs(farms)
    const { clmm_pool } = this._sdk.ClmmSDK.sdkOptions
    const clmmConfig = getPackagerConfigs(clmm_pool)

    

    let coinBalanceA
    let coinBalanceB


    await this._sdk.FarmsSDK.Farms.harvestPayload(
      {
        pool_id: farms_pool_id,
        position_nft_id: pos_id,
      },
      tx
    )
    if (not_close) {
      const [coinA, coinB] = tx.moveCall({
        target: `${farms.published_at}::pool::remove_liquidity`,
        typeArguments: [params.coin_type_a, params.coin_type_b],
        arguments: [
          tx.object(farmsConfig.global_config_id),
          tx.object(clmmConfig.global_config_id),
          tx.object(farmsConfig.rewarder_manager_id),
          tx.object(params.farms_pool_id),
          tx.object(params.pool_id),
          tx.object(params.pos_id),
          tx.pure.u128(params.delta_liquidity),
          tx.pure.u64(params.min_amount_a),
          tx.pure.u64(params.min_amount_b),
          tx.object(CLOCK_ADDRESS),
        ],
      })
      coinBalanceA = coinA
      coinBalanceB = coinB
    } else {
      const [coinA, coinB] = tx.moveCall({
        target: `${farms.published_at}::pool::close_position_v2`,
        typeArguments: [coin_type_a, coin_type_b],
        arguments: [
          tx.object(farmsConfig.global_config_id),
          tx.object(farmsConfig.rewarder_manager_id),
          tx.object(farms_pool_id),
          tx.object(clmmConfig.global_config_id),
          tx.object(pool_id),
          tx.object(pos_id),
          tx.pure.u64(min_amount_a),
          tx.pure.u64(min_amount_b),
          tx.object(CLOCK_ADDRESS),
        ],
      })
      coinBalanceA = coinA
      coinBalanceB = coinB
    }
    

    

    const returnAmountA = CoinAssist.fromBalance(coinBalanceA, coin_type_a, tx)
    const returnAmountB = CoinAssist.fromBalance(coinBalanceB, coin_type_b, tx)

    return {
      returnAmountA,
      returnAmountB
    }
  }

  /**
   * Close position and return amount_a, amount_b, harvest fees and rewards directly to user
   * @param params - Parameters for closing position including:
   *                 - pool_id: ID of the liquidity pool
   *                 - pos_id: ID of the position
   *                 - coin_type_a/b: Coin types for the trading pair
   *                 - min_amount_a/b: Minimum amounts to return
   * @param tx - Transaction object to add operations to
   * @returns Object containing coin_a and coin_b transaction objects
   */ 
  async closePosOnlyReturnAmountCoins(params: ClosePosOnlyReturnAmountCoinsParams, tx: Transaction) {
    const {pool_id, farms_pool_id, pos_id, coin_type_a, coin_type_b, min_amount_a, min_amount_b, delta_liquidity, not_close} = params
    const { clmm_pool, integrate } = this._sdk.ClmmSDK.sdkOptions
    const typeArguments = [params.coin_type_a, params.coin_type_b]
    const clmmConfig = getPackagerConfigs(clmm_pool)
    const args = [
      tx.object(clmmConfig.global_config_id),
      tx.object(params.pool_id),
      tx.object(params.pos_id),
      tx.pure.bool(true),
      tx.object(CLOCK_ADDRESS),
    ]

    let returnAmountA
    let returnAmountB

    const { fee_a, fee_b, other_rewarder } = await this.collectFeeAndRewardsAndReturnCoins(params, tx)
    tx.transferObjects([fee_a, fee_b], this.sdk.getSenderAddress())
    for(let key in other_rewarder) {
      tx.transferObjects([other_rewarder[key]], this.sdk.getSenderAddress())
    }

    if (!farms_pool_id) {
      const args = [
        tx.object(clmmConfig.global_config_id),
        tx.object(pool_id),
        tx.object(pos_id),
        tx.pure.u128(delta_liquidity),
        tx.object(CLOCK_ADDRESS),
      ]
      const [amount_a, amount_b] = tx.moveCall({
        target: `${clmm_pool.published_at}::pool::remove_liquidity`,
        typeArguments,
        arguments: args,
      })
  
      returnAmountA = CoinAssist.fromBalance(amount_a, params.coin_type_a, tx)
      returnAmountB = CoinAssist.fromBalance(amount_b, params.coin_type_b, tx)

      if (!not_close){
        tx.moveCall({
          target: `${clmm_pool.published_at}::pool::close_position`,
          typeArguments: [coin_type_a, coin_type_b],
          arguments: [tx.object(getPackagerConfigs(clmm_pool).global_config_id), tx.object(pool_id), tx.object(pos_id)],
        })
      }
      
    } else {

      const res = await this.closeAndHarvestFarmsPos(params as any, tx)
      returnAmountA = res.returnAmountA
      returnAmountB = res.returnAmountB
    }

    return {
      coin_a: returnAmountA,
      coin_b: returnAmountB
    }
  }

  /**
   * Harvest fees and rewards and return coins
   * @param params - Parameters for collecting fees and rewards including:
   *                 - pool_id: ID of the liquidity pool
   *                 - pos_id: ID of the position
   *                 - coin_type_a/b: Coin types for the trading pair
   *                 - rewarder_coin_types: Array of rewarder coin types
   * @param tx - Transaction object to add operations to
   * @returns Object containing fee_a, fee_b and other_rewarder transaction objects
   */
  async collectFeeAndRewardsAndReturnCoins(params: any, tx: Transaction) {
    const { coin_type_a, coin_type_b, rewarder_coin_types, not_merge_coins, farms_pool_id, clmm_pos_id } = params
    const { farms } = this._sdk.FarmsSDK.sdkOptions
    const { clmm_pool } = this._sdk.ClmmSDK.sdkOptions
    const farmsConfig = getPackagerConfigs(farms)
    const clmmConfig = getPackagerConfigs(clmm_pool)
    
    let fee_a: any
    let fee_b: any
    if (!farms_pool_id) {
      const feeRes = this._sdk.ClmmSDK.Position.createCollectFeeAndReturnCoinsPayload({
        pool_id: params.pool_id,
        pos_id: clmm_pos_id || params.pos_id,
        coin_type_a: params.coin_type_a,
        coin_type_b: params.coin_type_b,
      }, tx)
      
      if (feeRes.fee_a) {
        fee_a = CoinAssist.fromBalance(feeRes.fee_a, coin_type_a, tx)
      }
      if (feeRes.fee_b) {
        fee_b = CoinAssist.fromBalance(feeRes.fee_b, coin_type_b, tx)
      }
    } else {
      
      const [coinBalanceA, coinBalanceB] = tx.moveCall({
        target: `${farms.published_at}::pool::collect_fee`,
        typeArguments: [params.coin_type_a, params.coin_type_b],
        arguments: [
          tx.object(farmsConfig.global_config_id),
          tx.object(clmmConfig.global_config_id),
          tx.object(params.pool_id),
          tx.object(params.pos_id),
          tx.pure.bool(true)
        ],
      })

      if (coinBalanceA) {
        fee_a = CoinAssist.fromBalance(coinBalanceA, coin_type_a, tx)
      }
      if (coinBalanceB) {
        fee_b = CoinAssist.fromBalance(coinBalanceB, coin_type_b, tx)
      }
    }

    let other_rewarder: any = {}

    if (rewarder_coin_types.length > 0) {
      if (!farms_pool_id) {
        params.rewarder_coin_types.forEach((type: SuiAddressType, index: number) => {
          const  rewarder = this._sdk.ClmmSDK.Rewarder.createCollectRewarderAndReturnCoinPayload({
              pool_id: params.pool_id,
              pos_id: clmm_pos_id || params.pos_id,
              coin_type_a: coin_type_a,
              coin_type_b: coin_type_b,
              rewarder_coin_type: type,
              
            }, tx)
        
          // const returnCoin = CoinAssist.fromBalance(rewarder, `0x${fixCoinType(type)}`, tx)
          const returnCoin = CoinAssist.fromBalance(rewarder, type, tx)
  
          if (isSameType(type, coin_type_a)) {
            tx.mergeCoins(fee_a, [returnCoin])
          } else if (isSameType(type, coin_type_b)) {
            tx.mergeCoins(fee_b, [returnCoin])
          } else {
            other_rewarder[type] = returnCoin
          }
        })
      } else {
        const primaryCoinInputs: any = []        
        for (let i = 0; i < rewarder_coin_types.length; i++) {
          const item = rewarder_coin_types[i]
          const coin = CoinAssist.buildCoinWithBalance(BigInt(0), item, tx)
          primaryCoinInputs.push(coin)
        }

        params.rewarder_coin_types?.forEach((type: string, index: number) => {
          if (tx) {
            const { farms } = this._sdk.FarmsSDK.sdkOptions
            const farmsConfig = getPackagerConfigs(farms)
            const coin = tx.moveCall({
              target: `${farms.published_at}::pool::collect_clmm_reward`,
              typeArguments: [type, params.coin_type_a, params.coin_type_b],
              arguments: [
                tx.object(farmsConfig.global_config_id),
                tx.object(clmmConfig.global_config_id),
                tx.object(params.pool_id),
                tx.object(params.pos_id),
                tx.object(clmmConfig.global_vault_id),
                primaryCoinInputs[index],
                
                tx.pure.bool(true),
                tx.object(CLOCK_ADDRESS),
              ],
            })
            other_rewarder[type] = CoinAssist.fromBalance(coin, type, tx)
          }
        })

      }
    }

    return {
      fee_a, fee_b, other_rewarder
    }
  }

  /**
   * Close position and return amount_a, amount_b, fees and rewarders, then merge swap rewarders to a or b
   * @param params - Parameters for closing position with merge swap including:
   *                 - pool_id: ID of the liquidity pool
   *                 - pos_id: ID of the position
   *                 - coin_type_a/b: Coin types for the trading pair
   *                 - delta_liquidity: Amount of liquidity to remove
   * @param rewarderMergeOption - Optional merge swap configuration including:
   *                              - merge_routers: Router configuration for merge swap
   *                              - slippage: Slippage tolerance
   *                              - not_merge_coins: Coins to exclude from merge swap
   * @param tx - Transaction object to add operations to
   * @returns Object containing coin_a and coin_b transaction objects
   */
  async closePosReturnCoinWithMerge(params: ClosePosReturnAmountCoinAParams, rewarderMergeOption?: {
    merge_routers: any
    slippage: number
    not_merge_coins: string[]
  }, tx = new Transaction()) {
    const {farms_pool_id, coin_type_a, coin_type_b, pool_id, pos_id, delta_liquidity, min_amount_a, min_amount_b, not_close} = params
    const { clmm_pool } = this._sdk.ClmmSDK.sdkOptions
    const typeArguments = [coin_type_a, coin_type_b]
    const clmmConfig = getPackagerConfigs(clmm_pool)

    let returnAmountA
    let returnAmountB

    const {coin_a, coin_b} = await this.claimFeeAndRewardsAndMergeRewards(params, rewarderMergeOption, tx)
    
    if (farms_pool_id) {
      const res = await this.closeAndHarvestFarmsPos(params as any, tx)
      returnAmountA = res.returnAmountA
      returnAmountB = res.returnAmountB
    } else {
      const args = [
        tx.object(clmmConfig.global_config_id),
        tx.object(pool_id),
        tx.object(pos_id),
        tx.pure.u128(delta_liquidity),
        tx.object(CLOCK_ADDRESS),
      ]
      const [amount_a, amount_b] = tx.moveCall({
        target: `${clmm_pool.published_at}::pool::remove_liquidity`,
        typeArguments,
        arguments: args,
      })

      if (!not_close){
        tx.moveCall({
          target: `${clmm_pool.published_at}::pool::close_position`,
          typeArguments: [coin_type_a, coin_type_b],
          arguments: [tx.object(getPackagerConfigs(clmm_pool).global_config_id), tx.object(pool_id), tx.object(pos_id)],
        })
      }
  
      returnAmountA = CoinAssist.fromBalance(amount_a, params.coin_type_a, tx)
      returnAmountB = CoinAssist.fromBalance(amount_b, params.coin_type_b, tx)
    }
    
    
    if (coin_a) {
      tx.mergeCoins(coin_a, [returnAmountA])
    }
    
    if (coin_b) {
      tx.mergeCoins(coin_b, [returnAmountB])
    }

    return {
      coin_a,
      coin_b,
    }
  }

  /**
   * Pre-calculate swap parameters for optimal routing
   * @param params - Parameters for swap calculation including:
   *                 - pool_id: ID of the liquidity pool
   *                 - current_sqrt_price: Current square root price
   *                 - from_coin_type: Source coin type
   *                 - target_coin_type: Target coin type
   *                 - amount: Amount to swap
   *                 - from_coin_decimal: Decimal precision of source coin
   *                 - target_coin_decimal: Decimal precision of target coin
   *                 - is_a2b: Whether swapping from coin A to coin B
   *                 - slippage: Slippage tolerance
   * @returns Promise resolving to swap result with router price and slippage-adjusted amount
   */
  async preSwap(params: PreSwapParams): Promise<{
    swapResult: any
    routerPrice: string
    swapAmountOutWithSlippage: string
  }> {
    const { pool_id, current_sqrt_price, from_coin_type, target_coin_type, amount, from_coin_decimal, target_coin_decimal, is_a2b,slippage } = params

    const swapResult = await this._sdk.Zap.findRouters(
      pool_id,
      current_sqrt_price,
      from_coin_type,
      target_coin_type,
      d(amount),
      true,
      from_coin_decimal,
      target_coin_decimal
    )
    const swapAmountOutWithSlippage = this.calculateAmountWithSlippage(swapResult.swap_out_amount, slippage)

    const routerPrice = is_a2b ? d(swapResult.swap_price).toString() : d(1).div(d(swapResult.swap_price)).toString()
  
    return {
      swapResult,
      routerPrice,
      swapAmountOutWithSlippage
    }
  }


  /**
   * Harvest fees and rewards and merge swap rewards to coin_a or coin_b
   * @param baseParams - Base parameters including:
   *                     - pool_id: ID of the liquidity pool
   *                     - pos_id: ID of the position
   *                     - coin_type_a/b: Coin types for the trading pair
   *                     - rewarder_coin_types: Array of rewarder coin types
   * @param rewarderMergeOption - Optional merge swap configuration including:
   *                              - merge_routers: Router configuration for merge swap
   *                              - slippage: Slippage tolerance
   *                              - not_merge_coins: Coins to exclude from merge swap
   * @param tx - Transaction object to add operations to (creates new one if not provided)
   * @returns Object containing coin_a and coin_b transaction objects
   */
  async claimFeeAndRewardsAndMergeRewards(baseParams: {
    pool_id: string
    pos_id: string
    coin_type_a: SuiAddressType
    coin_type_b: SuiAddressType
    rewarder_coin_types: SuiAddressType[]
    farms_pool_id?: string
    clmm_pos_id?: string
  }, rewarderMergeOption?: {
    merge_routers: any
    slippage: number
    not_merge_coins: string[]
  }, tx = new Transaction()) {
    const {coin_type_a, coin_type_b} = baseParams

    const { fee_a, fee_b, other_rewarder } = await this.collectFeeAndRewardsAndReturnCoins(baseParams, tx)
    let coin_a: any = fee_a
    let coin_b: any = fee_b

    const mergeInputCoinMap: any = {}
    if (!isEmptyObj(other_rewarder)) {
      for(let key in other_rewarder) {
        const coin = other_rewarder[key]
        
        // if (rewarderMergeOption && !rewarderMergeOption.not_merge_coins.includes(key)) {
        if (rewarderMergeOption && isNotMergeCoin(rewarderMergeOption.not_merge_coins, key)) {
          if (fixCoinType(key) === fixCoinType(coin_type_a)) {
            if (coin_a){
              tx.mergeCoins(coin_a, [coin])
            } else {
              coin_a = coin
            }  
          } else if (fixCoinType(key) === fixCoinType(coin_type_b)) {
            if (coin_b){
              tx.mergeCoins(coin_b, [coin])
            } else {
              coin_b = coin
            }
          } else {
            mergeInputCoinMap[fixCoinType(key)] = {
              coinType: key,
              coin: coin
            }
          }
        } else {
          if (fixCoinType(coin_type_a) === fixCoinType(key)) {
            if (coin_a){
              tx.mergeCoins(coin_a, [coin])
            } else {
              coin_a = coin
            }  
          } else if (fixCoinType(coin_type_b) === fixCoinType(key)) {
            if (coin_b){
              tx.mergeCoins(coin_b, [coin])
            } else {
              coin_b = coin
            }
          } else {
            tx.transferObjects([coin], this.sdk.getSenderAddress())
          }
        }
      }
    }

    const client = this._sdk.AggregatorClient
    if (!isEmptyObj(mergeInputCoinMap) && rewarderMergeOption?.merge_routers) {
      const inputCoins: any = rewarderMergeOption?.merge_routers.allRoutes?.map((item: any) => {  
        
        const from  = item.paths[0].from     
        return mergeInputCoinMap[fixCoinType(from)]
      })


      const targetCoin = await client.mergeSwap({
        router: rewarderMergeOption?.merge_routers,
        inputCoins,
        slippage: rewarderMergeOption!.slippage,
        txb: tx,
      })

      const merge_target_coin_type = rewarderMergeOption?.merge_routers.allRoutes[0].paths[rewarderMergeOption?.merge_routers.allRoutes[0].paths.length - 1].target

      if (fixCoinType(merge_target_coin_type) === fixCoinType(coin_type_a)) {
        coin_a ? tx.mergeCoins(coin_a, [targetCoin]) : coin_a = targetCoin
      } else {
        coin_b ? tx.mergeCoins(coin_b, [targetCoin]) : coin_b = targetCoin
      }
      
    }

    return {
      coin_a,
      coin_b
    }
  }

  /**
   * Harvest fees, rewarders and merge swap them to target coin
   * @param params - Parameters for claim merge payload including:
   *                 - pool_id: ID of the liquidity pool
   *                 - pos_id: ID of the position
   *                 - coin_type_a/b: Coin types for the trading pair
   *                 - rewarder_coin_types: Array of rewarder coin types
   *                 - not_merge_coins: Coins to exclude from merge swap
   *                 - merge_routers: Router configuration for merge swap
   *                 - slippage: Slippage tolerance
   *                 - target_coin_type: Target coin type for merge swap
   * @param is_return_coin - Whether to return the target coin directly (default: false)
   * @returns Transaction object or target coin object based on is_return_coin parameter
   */
  async createClaimMergePayload(params: CreateClaimMergePayloadParams) {
    const { coin_type_a, coin_type_b, not_merge_coins, merge_routers, slippage, target_coin_type } = params
    const tx = new Transaction()
    const { fee_a, fee_b, other_rewarder } = await this.collectFeeAndRewardsAndReturnCoins(params, tx)    
    
    const inputCoinMap: any = {}
    let coin_a
    let coin_b

    if (fee_a) {
      if (isNotMergeCoin(not_merge_coins, coin_type_a) && !isSameType(target_coin_type, coin_type_a)) {
        coin_a = fee_a
      } else {
        tx.transferObjects([fee_a], this.sdk.getSenderAddress())
      }
    }

    if (fee_b) {
      if (isNotMergeCoin(not_merge_coins, coin_type_b) && !isSameType(target_coin_type, coin_type_b)) {
        coin_b = fee_b
      } else {
        tx.transferObjects([fee_b], this.sdk.getSenderAddress())
      }
    }

    if (!isEmptyObj(other_rewarder)) {
      for(let key in other_rewarder) {
        const coin = other_rewarder[key]
        if (isNotMergeCoin(not_merge_coins, key) && !isSameType(target_coin_type, key)) {
          if (isSameType(key, coin_type_a)) {
            if (coin_a) {
              tx.mergeCoins(coin_a, [coin])
            } else {
              coin_a = coin
            }
          } else if (isSameType(key, coin_type_b)) {
            if (coin_b) {
              tx.mergeCoins(coin_b, [coin])
            } else {
              coin_b = coin
            }
          } else {
            inputCoinMap[fixCoinType(key)] = {
              coinType: key,
              coin: coin
            }
          }
        } else {
          
          tx.transferObjects([coin], this.sdk.getSenderAddress())
        }
      }
    }

    if (coin_a) {
      inputCoinMap[fixCoinType(coin_type_a)] = {
        coinType: coin_type_a,
        coin: coin_a
      }
    }
    if (coin_b) {
      inputCoinMap[fixCoinType(coin_type_b)] = {
        coinType: coin_type_b,
        coin: coin_b
      }
    }

    const inputCoins: any = merge_routers.allRoutes?.map((item: any) => {
      const from  = item.paths[0].from     
      return inputCoinMap[fixCoinType(from)]
    })


    if (inputCoins.length !== Object.values(inputCoinMap)?.length) {
      for(const key in inputCoinMap) {
        const coin = inputCoinMap[key]
        const isMergeInput = merge_routers?.allRoutes?.filter((item: any) => isSameType(item?.paths[0]?.from,  key))?.length > 0
        if(!isMergeInput) {
          tx.transferObjects([coin], this.sdk.getSenderAddress())
        }
      }
    }

    const client = this._sdk.AggregatorClient
    

    const targetCoin = await client.mergeSwap({
      router: merge_routers,
      inputCoins,
      slippage,
      txb: tx,
    })
      
    tx.transferObjects([targetCoin], this.sdk.getSenderAddress())
    return tx    
  }

  /**
   * Compound: Harvest fees, rewarders and merge swap rewarders to target coin, then rebalance and add liquidity
   * @param params - Parameters for compound rebalance add payload including:
   *                 - baseParams: Base parameters including pool_id, pos_id, coin types, rewarder types
   *                 - rebalancePre: Pre-calculated rebalancing result
   *                 - rewarderMergeOption: Merge swap configuration with routers, slippage, and excluded coins
   *                 - tx: Optional transaction object (creates new one if not provided)
   * @returns Transaction object with compound rebalance and add liquidity operations
   */
  async createCompoundRebalanceAddPayload(params: CreateCompoundRebalanceAddPayload) {
    const client = this._sdk.AggregatorClient
    const tx = params?.tx ||new Transaction()
    const {baseParams, rebalancePre, rewarderMergeOption} = params
    const {pool_id, pos_id, coin_type_a, coin_type_b, rewarder_coin_types, farms_pool_id} = baseParams
    const { merge_routers, slippage, not_merge_coins } = rewarderMergeOption
    const { liquidity, use_amount_a, use_amount_b, fix_amount_a, remain_amount, swap_result } = rebalancePre

    // Harvest rewards and fees, then merge swap rewards to a or b
    const {coin_a, coin_b} = await this.claimFeeAndRewardsAndMergeRewards(baseParams, rewarderMergeOption, tx)
    if (swap_result?.route_obj) {
      // Perform partial swap based on pre-calculated rebalance result
      const swapAmountIn = swap_result?.swap_in_amount || '0'
      const fromIsCoinA = fixCoinType(swap_result.route_obj.paths[0].from) === fixCoinType(coin_type_a)
      const swapInputCoin = fromIsCoinA ? tx.splitCoins(coin_a, [tx.pure.u64(swapAmountIn)]) : tx.splitCoins(coin_b, [tx.pure.u64(swapAmountIn)])
      const routerParamsV3: BuildRouterSwapParamsV3 = {
        router: swap_result.route_obj,
        slippage,
        txb: tx,
        inputCoin: swapInputCoin,
      }

      
      const swapOutCoin = await client.fixableRouterSwapV3(routerParamsV3)
      const { clmm_pool, integrate } = this._sdk.ClmmSDK.sdkOptions
      const swapAmountOutWithSlippage = this.calculateAmountWithSlippage(swap_result?.swap_out_amount, slippage)
      tx.moveCall({
        target: `${integrate.published_at}::${ClmmIntegrateRouterModule}::check_coin_threshold`,
        typeArguments: [fromIsCoinA ? coin_type_b: coin_type_a],
        arguments: [swapOutCoin, tx.pure.u64(swapAmountOutWithSlippage)],
      })
      // const returnSwapOutCoin = CoinAssist.fromBalance(swapOutCoin, fix_amount_a ? coin_type_b : coin_type_a, tx)

      if (fromIsCoinA) {
        tx.mergeCoins(coin_b, [swapOutCoin])
        // tx.mergeCoins(coin_b, [returnSwapOutCoin])
      } else {
        tx.mergeCoins(coin_a, [swapOutCoin])
        // tx.mergeCoins(coin_a, [returnSwapOutCoin])
      }
    }

    // coin_a, coin_b add liquidity
    return this.buildAddLiquidityPayload({
      coin_type_a,
      coin_type_b,
      pool_id,
      pos_id,
      fixed_amount_a: fix_amount_a ? use_amount_a : MAX_U64,
      fixed_amount_b: fix_amount_a ? MAX_U64 : use_amount_b,
      farms_pool_id,
      fixed_liquidity_coin_a: fix_amount_a,
      coin_object_id_a: coin_a,
      coin_object_id_b: coin_b,
      tx
    })
  }

  /**
   * Move position from old range to new range with optimal rebalancing
   * @param params - Parameters for move position payload including:
   *                 - oldPos: Old position details including pool_id, pos_id, coin types, liquidity, amounts
   *                 - newPos: New position details including tick_lower and tick_upper
   *                 - rebalancePre: Pre-calculated rebalancing result
   *                 - slippage: Slippage tolerance
   *                 - rewarderMergeOption: Optional merge swap configuration
   *                 - have_claim: Whether fees and rewards have already been claimed
   * @param tx - Transaction object to add operations to (creates new one if not provided)
   * @returns Transaction object with move position operations
   */
  async createMovePositionPayload(params: CreateMovePositionPayloadParams,tx = new Transaction()) {
    const client = this._sdk.AggregatorClient
    const {newPos, oldPos, rebalancePre, slippage, rewarderMergeOption, have_claim} = params
    const {pool_id, pos_id, coin_type_a, coin_type_b, rewarder_coin_types} = oldPos
    const { use_amount_a, use_amount_b, fix_amount_a, swap_result } = rebalancePre

    let coin_a, coin_b
    let res
    if (have_claim) {
      res = await this.closePosOnlyReturnAmountCoins({
        pool_id,
        farms_pool_id: oldPos?.farms_pool_id,
        pos_id,
        coin_type_a,
        coin_type_b,
        min_amount_a: oldPos.min_amount_a,
        min_amount_b: oldPos.min_amount_b,
        rewarder_coin_types,
        delta_liquidity: oldPos.liquidity,
        not_close: oldPos?.not_close
      }, tx)
      
    } else {
      res = await this.closePosReturnCoinWithMerge({
        pool_id,
        farms_pool_id: oldPos?.farms_pool_id,
        pos_id,
        coin_type_a,
        coin_type_b,
        min_amount_a: oldPos.min_amount_a,
        min_amount_b: oldPos.min_amount_b,
        delta_liquidity: oldPos.liquidity,
        rewarder_coin_types,
        not_close: oldPos?.not_close
      }, rewarderMergeOption, tx)
    }

    coin_a = res.coin_a
    coin_b = res.coin_b

    if (swap_result?.route_obj) {
      // Perform partial swap based on pre-calculated rebalance result
      const swapAmountIn = swap_result.swap_in_amount.toString()
      const fromIsCoinA = fixCoinType(swap_result.route_obj.paths[0].from) === fixCoinType(coin_type_a)
      const swapInputCoin = fromIsCoinA ? tx.splitCoins(coin_a, [tx.pure.u64(swapAmountIn)]) : tx.splitCoins(coin_b, [tx.pure.u64(swapAmountIn)])
      const routerParamsV3: BuildRouterSwapParamsV3 = {
        router: swap_result.route_obj,
        slippage,
        txb: tx,
        inputCoin: swapInputCoin,
      }
      const swapOutCoin = await client.fixableRouterSwapV3(routerParamsV3)
      // const returnSwapOutCoin = CoinAssist.fromBalance(swapOutCoin, fromIsCoinA ? coin_type_b : coin_type_a, tx)

      if (fromIsCoinA) {
        tx.mergeCoins(coin_b, [swapOutCoin])
      } else {
        tx.mergeCoins(coin_a, [swapOutCoin])
      }
    }

    // Open position
    const newPosId = this.buildOpenPositionPayload({
      pool_id,
      coin_type_a,
      coin_type_b,
      tick_lower: newPos.tick_lower,
      tick_upper: newPos.tick_upper
    }, tx)
    // coin_a, coin_b add liquidity
    const txb = await this.buildAddLiquidityPayload({
      coin_type_a,
      coin_type_b,
      pool_id,
      farms_pool_id:  newPos?.farms_pool_id,
      pos_id: newPosId,
      fixed_amount_a: fix_amount_a ? use_amount_a : MAX_U64,
      fixed_amount_b: fix_amount_a ? MAX_U64 : use_amount_b,
      fixed_liquidity_coin_a: fix_amount_a,
      coin_object_id_a: coin_a,
      coin_object_id_b: coin_b,
      is_open_position: true,
      tx
    })
    if (newPos?.farms_pool_id) {
      this.buildFarmsDepositPayload(newPosId, newPos?.farms_pool_id, pool_id, coin_type_a, coin_type_b, tx)
    } else {
      txb.transferObjects([newPosId], this.sdk.getSenderAddress())
    }
    
    

    return txb
  }


   /**
   * Builds a transaction payload for opening a new position
   * @param options - Deposit options including:
   *                  - pool_id: ID of the liquidity pool
   *                  - coin_type_a/b: Coin types for the trading pair
   *                  - tick_lower/upper: Price range boundaries
   * @param tx - Transaction object to add operations to
   * @returns Transaction object with open position operations
   */
   private buildOpenPositionPayload(options: {
    pool_id: string,
    coin_type_a: string,
    coin_type_b: string,
    tick_lower: number,
    tick_upper: number
   }, tx: Transaction): TransactionObjectArgument {
    const { pool_id, coin_type_a, coin_type_b, tick_lower, tick_upper } = options
    const { clmm_pool } = this._sdk.ClmmSDK.sdkOptions
    const clmmConfig = getPackagerConfigs(clmm_pool)

    return tx.moveCall({
      target: `${clmm_pool.published_at}::pool::open_position`,
      typeArguments: [coin_type_a, coin_type_b],
      arguments: [
        tx.object(clmmConfig.global_config_id),
        tx.object(pool_id),
        tx.pure.u32(Number(asUintN(BigInt(tick_lower)))),
        tx.pure.u32(Number(asUintN(BigInt(tick_upper)))),
      ],
    })
  }

  /**
   * Create add liquidity payload for adding coins to a position
   * @param params - Parameters for adding liquidity including:
   *                 - farms_pool_id: Optional farms pool ID
   *                 - coin_type_a/b: Coin types for the trading pair
   *                 - pool_id: ID of the liquidity pool
   *                 - pos_id: ID of the position
   *                 - fixed_amount_a/b: Fixed amounts for each coin
   *                 - coin_object_id_a/b: Coin object IDs for each coin
   *                 - fixed_liquidity_coin_a: Whether coin A amount is fixed
   *                 - tx: Transaction object to add operations to
   * @returns Promise resolving to Transaction object with add liquidity operations
   */
  private async buildAddLiquidityPayload(
    params: any
  ): Promise<Transaction> {
    const { farms_pool_id, coin_type_a, coin_type_b, pool_id, pos_id, fixed_amount_a, fixed_amount_b, coin_object_id_a, coin_object_id_b, fixed_liquidity_coin_a, is_open_position, tx } = params
    const { clmm_pool, integrate } = this._sdk.ClmmSDK.sdkOptions
    const clmmConfig = getPackagerConfigs(clmm_pool)

    const { farms } = this._sdk.FarmsSDK.sdkOptions
    const farmsConfig = getPackagerConfigs(farms)

    if (farms_pool_id && !is_open_position) {
      tx.moveCall({
        target: `${farms.published_at}::router::add_liquidity_fix_coin`,
        typeArguments: [coin_type_a, coin_type_b],
        arguments: [
          tx.object(farmsConfig.global_config_id),
          tx.object(clmmConfig.global_config_id),
          tx.object(farmsConfig.rewarder_manager_id),
          tx.object(farms_pool_id),
          tx.object(pool_id),
          typeof pos_id === 'string' ? tx.object(pos_id) : pos_id,
          coin_object_id_a,
          coin_object_id_b,
          tx.pure.u64(fixed_amount_a),
          tx.pure.u64(fixed_amount_b),
          tx.pure.bool(fixed_liquidity_coin_a),
          tx.object(CLOCK_ADDRESS),
        ],
      })
    } else {
      tx.moveCall({
        target: `${integrate.published_at}::${ClmmIntegratePoolV2Module}::add_liquidity_by_fix_coin`,
        typeArguments: [coin_type_a, coin_type_b],
        arguments: [
          tx.object(clmmConfig.global_config_id),
          tx.object(pool_id),
          typeof pos_id === 'string' ? tx.object(pos_id) : pos_id,
          coin_object_id_a,
          coin_object_id_b,
          tx.pure.u64(fixed_amount_a),
          tx.pure.u64(fixed_amount_b),
          tx.pure.bool(fixed_liquidity_coin_a),
          tx.object(CLOCK_ADDRESS),
        ],
      })
    }
    

    return tx
  }

  /**
   * Builds a transaction payload for depositing liquidity to a farms pool
   * @param pos_id - ID of the position
   * @param pool_id - ID of the liquidity pool
   * @param tx - Transaction object to add operations to
   * @returns Transaction object with deposit operations
   */
  private buildFarmsDepositPayload(
    pos_id: TransactionObjectArgument | string,
    pool_id: string,
    clmm_pool_id: string,
    coin_type_a: string,
    coin_type_b: string,
    tx: Transaction
  ): Transaction {
    this._sdk.FarmsSDK.Farms.depositPayload(
      {
        clmm_pool_id,
        clmm_position_id: pos_id,
        pool_id,
        coin_type_a,
        coin_type_b,
      },
      tx
    )
    return tx
  }
}