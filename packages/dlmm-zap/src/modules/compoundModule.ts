import { CetusDlmmZapSDK } from '../sdk'
import {
  CalculateClaimMergeParams,
  CalculateRebalanceParams,
  ClosePosOnlyReturnAmountCoinsParams,
  ClosePosReturnAmountCoinAParams,
  CreateClaimMergePayloadParams,
  CreateCompoundRebalanceAddPayload,
  CreateMovePositionPayloadParams,
  PreSwapParams,
  RebalanceResult,
} from '../types'
import { Transaction } from '@mysten/sui/transactions'
import { d, fixCoinType, SuiAddressType, IModule, toDecimalsAmount } from '@cetusprotocol/common-sdk'
import { BuildRouterSwapParamsV3 } from '@cetusprotocol/aggregator-sdk'
import { BinUtils } from '@cetusprotocol/dlmm-sdk'
import { calcSwapAmountForTargetRatio } from '../utils/zap'
import { isEmptyObj, isNotMergeCoin, isSameType } from '../utils/compound'

const DEFAULT_SLIPPAGE = 0.005
const DEFAULT_DEPTH = 3

/**
 * DLMM compound/rebalance module.
 * This module provides three core capabilities:
 * 1) Collect position fees and rewards, with optional merged swap;
 * 2) Compute rebalance by target ratio (including whether swap is needed first);
 * 3) Close old positions and migrate assets into a new price range (move position).
 */
export class CompoundModule implements IModule<CetusDlmmZapSDK> {
  protected _sdk: CetusDlmmZapSDK

  constructor(sdk: CetusDlmmZapSDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  /** Unified slippage handling: floor output amount conservatively to avoid overestimation and follow-up tx failures. */
  private calculateAmountWithSlippage(amount: string, slippage: number): string {
    return d(amount).mul(d(1 - slippage)).floor().toString()
  }

  /**
   * Fetch claimable fee/reward snapshot for a single position.
   * Note: this is read-only, does not build transactions, and does not change on-chain state.
   */
  private async fetchFeeAndRewardSnapshot(params: {
    pool_id: string
    position_id: string
    coin_type_a: string
    coin_type_b: string
    rewarder_types: string[]
  }) {
    const { feeData, rewardData } = await this._sdk.DlmmSDK.Position.fetchPositionFeeAndReward([
      {
        pool_id: params.pool_id,
        position_id: params.position_id,
        coin_type_a: params.coin_type_a,
        coin_type_b: params.coin_type_b,
        reward_coins: params.rewarder_types || [],
      },
    ])
    return { fee: feeData[params.position_id], reward: rewardData[params.position_id] }
  }

  /**
   * Get available token A/B amounts after consolidation:
   * - Same token types in fee + reward are merged into coin_amount_a / coin_amount_b;
   * - Other reward tokens are estimated via aggregator routes and merged into target token;
   * - Tokens in not_merge_coins are excluded from merge swap.
   */
  async getFeeAndReward(params: {
    pool_id: string
    position_id: string
    coin_type_a: SuiAddressType
    coin_type_b: SuiAddressType
    rewarder_types: string[]
    merge_swap_target_coin_type: string
    not_merge_coins: string[]
  }) {
    const { pool_id, position_id, coin_type_a, coin_type_b, rewarder_types, merge_swap_target_coin_type, not_merge_coins } = params
    let coin_amount_a = '0'
    let coin_amount_b = '0'
    const other_rewarder: Record<string, string> = {}
    const snapshot = await this.fetchFeeAndRewardSnapshot({ pool_id, position_id, coin_type_a, coin_type_b, rewarder_types })

    if (snapshot.fee) {
      // Fees are only counted for token types that are allowed to merge/retain.
      coin_amount_a = isNotMergeCoin(not_merge_coins, coin_type_a) ? snapshot.fee.fee_owned_a : '0'
      coin_amount_b = isNotMergeCoin(not_merge_coins, coin_type_b) ? snapshot.fee.fee_owned_b : '0'
    }

    // Group reward tokens into A/B/others; only "others" go through aggregator estimation.
    snapshot.reward?.rewards?.forEach((rewarder) => {
      const rewardType = fixCoinType(rewarder.coin_type)
      if (rewardType === fixCoinType(coin_type_a) && isNotMergeCoin(not_merge_coins, coin_type_a)) {
        coin_amount_a = d(coin_amount_a).add(rewarder.reward_owned).toString()
      } else if (rewardType === fixCoinType(coin_type_b) && isNotMergeCoin(not_merge_coins, coin_type_b)) {
        coin_amount_b = d(coin_amount_b).add(rewarder.reward_owned).toString()
      } else if (rewardType !== fixCoinType(merge_swap_target_coin_type) && isNotMergeCoin(not_merge_coins, rewardType)) {
        other_rewarder[rewardType] = rewarder.reward_owned
      }
    })

    let mergeSwapResult
    if (!isEmptyObj(other_rewarder)) {
      // Query one by-amount-in merge route for other reward tokens; estimation only, no tx sent.
      mergeSwapResult = await this._sdk.AggregatorClient.findMergeSwapRouters({
        target: merge_swap_target_coin_type,
        byAmountIn: true,
        depth: DEFAULT_DEPTH,
        froms: Object.entries(other_rewarder).map(([coinType, amount]) => ({ coinType, amount })),
      })
      if (mergeSwapResult?.totalAmountOut) {
        // Apply default slippage to estimated output for safer display and execution.
        const out = this.calculateAmountWithSlippage(mergeSwapResult.totalAmountOut.toString(), DEFAULT_SLIPPAGE)
        if (fixCoinType(merge_swap_target_coin_type) === fixCoinType(coin_type_a)) coin_amount_a = d(coin_amount_a).add(out).toString()
        else coin_amount_b = d(coin_amount_b).add(out).toString()
      }
    }

    return { coin_amount_a, coin_amount_b, merge_routers: mergeSwapResult }
  }

  /**
   * Build route inputs for one-shot merge into target token after claim.
   * Returns null when there are no mergeable assets, so caller can skip merge flow.
   */
  async calculateClaimMerge(params: CalculateClaimMergeParams) {
    const { coin_type_a, coin_type_b, pool_id, position_id, rewarder_types, target_coin_type, not_merge_coins } = params
    const mergeSwapFromMap: Record<string, { coinType: string; amount: string }> = {}
    const normalizedNotMergeCoins = new Set(not_merge_coins.map((coin) => fixCoinType(coin)))
    const addMergeFrom = (coinType: string, amount: string) => {
      if (d(amount).lte(0)) return
      const normalizedCoinType = fixCoinType(coinType)
      if (normalizedNotMergeCoins.has(normalizedCoinType)) return

      if (!mergeSwapFromMap[normalizedCoinType]) {
        mergeSwapFromMap[normalizedCoinType] = { coinType, amount }
        return
      }

      mergeSwapFromMap[normalizedCoinType].amount = d(mergeSwapFromMap[normalizedCoinType].amount).add(amount).toString()
    }
    const snapshot = await this.fetchFeeAndRewardSnapshot({ pool_id, position_id, coin_type_a, coin_type_b, rewarder_types })

    if (snapshot.fee) {
      // Add fee into merge inputs only when amount is positive and token is not blocked.
      addMergeFrom(coin_type_a, snapshot.fee.fee_owned_a)
      addMergeFrom(coin_type_b, snapshot.fee.fee_owned_b)
    }
    snapshot.reward?.rewards?.forEach((rewarder) => {
      addMergeFrom(rewarder.coin_type, rewarder.reward_owned)
    })

    const mergeSwapFroms = Object.values(mergeSwapFromMap)
    if (mergeSwapFroms.length === 0) return null
    return this._sdk.AggregatorClient.findMergeSwapRouters({ target: target_coin_type, byAmountIn: true, depth: DEFAULT_DEPTH, froms: mergeSwapFroms })
  }

  /**
   * Compute rebalance plan:
   * 1) Calculate theoretical add-liquidity distribution with current A/B amounts;
   * 2) If obviously one-sided, compute required swap amount by target ratio;
   * 3) Recompute final bin_infos using post-swap real amounts.
   */
  async calculateRebalance(params: CalculateRebalanceParams): Promise<RebalanceResult> {
    const { pool_id, amount_a, amount_b, active_id, bin_step, lower_bin_id, upper_bin_id, strategy_type, active_bin_of_pool, slippage } = params
    const initialInfos = await this._sdk.DlmmSDK.Position.calculateAddLiquidityInfo({
      pool_id,
      amount_a,
      amount_b,
      active_id,
      bin_step,
      lower_bin_id,
      upper_bin_id,
      active_bin_of_pool,
      strategy_type,
    })
    // Use simulation amounts to derive interval target ratio, avoiding user-input ratio bias.
    const simulationInfos = await this._sdk.DlmmSDK.Position.calculateAddLiquidityInfo({
      pool_id,
      coin_amount: toDecimalsAmount(100, 9).toString(),
      fix_amount_a: active_id < upper_bin_id,
      active_id,
      bin_step,
      lower_bin_id,
      upper_bin_id,
      active_bin_of_pool,
      strategy_type,
    })

    const simulationAmountA = d(simulationInfos.amount_a)
    const simulationAmountB = d(simulationInfos.amount_b)

    // Derive current price from active_id + bin_step, independent of CLMM sqrt_price.
    const currentPrice = BinUtils.getPricePerLamportFromBinId(active_id, bin_step)
    let swapCalc: { a_to_b: boolean; swap_amount: string }

    if (simulationAmountA.eq(0) && simulationAmountB.eq(0)) {
      // No liquidity can be added in this range; return current result directly.
      return { bin_infos: initialInfos, lower_bin_id, upper_bin_id, use_amount_a: initialInfos.amount_a, use_amount_b: initialInfos.amount_b, fix_amount_a: d(initialInfos.amount_a).gte(initialInfos.amount_b), remain_amount: '0' }
    } else if (simulationAmountA.eq(0)) {
      // Range is single-sided B: swap all A into B.
      swapCalc = { a_to_b: true, swap_amount: amount_a }
    } else if (simulationAmountB.eq(0)) {
      // Range is single-sided A: swap all B into A.
      swapCalc = { a_to_b: false, swap_amount: amount_b }
    } else {
      const targetRatio = simulationAmountB.div(simulationAmountA).toString()
      swapCalc = calcSwapAmountForTargetRatio(amount_a, amount_b, currentPrice, targetRatio)
    }

    if (d(swapCalc.swap_amount).lte(0)) {
      // No swap needed; keep the initial add-liquidity plan.
      return { bin_infos: initialInfos, lower_bin_id, upper_bin_id, use_amount_a: initialInfos.amount_a, use_amount_b: initialInfos.amount_b, fix_amount_a: d(initialInfos.amount_a).gte(initialInfos.amount_b), remain_amount: '0' }
    }

    const fromCoinType = swapCalc.a_to_b ? params.coin_type_a : params.coin_type_b
    const targetCoinType = swapCalc.a_to_b ? params.coin_type_b : params.coin_type_a
    const swapResult = await this._sdk.Zap.findRouters(fromCoinType, targetCoinType, swapCalc.swap_amount)
    const out = this.calculateAmountWithSlippage(swapResult.swap_out_amount, slippage)
    // Recompute usable assets with actual swap-in + slippage-adjusted output to keep addLiquidity executable.
    const realAmountA = swapCalc.a_to_b ? d(amount_a).sub(swapResult.swap_in_amount).toFixed(0) : d(amount_a).add(out).toFixed(0)
    const realAmountB = swapCalc.a_to_b ? d(amount_b).add(out).toFixed(0) : d(amount_b).sub(swapResult.swap_in_amount).toFixed(0)

    const finalInfos = await this._sdk.DlmmSDK.Position.calculateAddLiquidityInfo({
      pool_id,
      amount_a: realAmountA,
      amount_b: realAmountB,
      active_id,
      bin_step,
      lower_bin_id,
      upper_bin_id,
      active_bin_of_pool,
      strategy_type,
    })
    const remainAmountA = d(realAmountA).sub(finalInfos.amount_a).abs()
    const remainAmountB = d(realAmountB).sub(finalInfos.amount_b).abs()
    return {
      bin_infos: finalInfos,
      lower_bin_id,
      upper_bin_id,
      use_amount_a: finalInfos.amount_a,
      use_amount_b: finalInfos.amount_b,
      fix_amount_a: d(finalInfos.amount_a).gte(finalInfos.amount_b),
      remain_amount: remainAmountA.lt(remainAmountB) ? remainAmountA.toFixed(0) : remainAmountB.toFixed(0),
      swap_result: swapResult,
    }
  }

  /** Single pre-swap query: returns route, route price, and minimum output with slippage. */
  async preSwap(params: PreSwapParams): Promise<{ swapResult: any; routerPrice: string; swapAmountOutWithSlippage: string }> {
    const { from_coin_type, target_coin_type, amount, is_a2b, slippage } = params
    const swapResult = await this._sdk.Zap.findRouters(from_coin_type, target_coin_type, amount)
    const swapAmountOutWithSlippage = this.calculateAmountWithSlippage(swapResult.swap_out_amount, slippage)
    const routerPrice = is_a2b ? d(swapResult.swap_out_amount).div(swapResult.swap_in_amount).toString() : d(swapResult.swap_in_amount).div(swapResult.swap_out_amount).toString()
    return { swapResult, routerPrice, swapAmountOutWithSlippage }
  }

  /**
   * Build tx segment to claim fee/reward without immediate transfer, and merge same-token rewards into fee results:
   * - fee_a / fee_b are used as primary inputs for following compounding;
   * - other reward tokens are returned separately for upper layer to decide merge vs direct transfer.
   */
  async collectFeeAndRewardsAndReturnCoins(params: { pool_id: string; pos_id: string; coin_type_a: string; coin_type_b: string; rewarder_coin_types: string[] }, tx: Transaction) {
    const { pool_id, pos_id, coin_type_a, coin_type_b, rewarder_coin_types } = params
    this._sdk.DlmmSDK.Position.updatePositionFeeAndRewards({ pool_id, position_id: pos_id, coin_type_a, coin_type_b }, tx)
    const feeRes = this._sdk.DlmmSDK.Position.collectFeePayloadWithoutTransfer({ pool_id, position_id: pos_id, coin_type_a, coin_type_b }, tx)
    const fee_a = feeRes.fee_a_obj
    const fee_b = feeRes.fee_b_obj
    const rewardRes = this._sdk.DlmmSDK.Position.collectRewardPayloadWithoutTransfer({ pool_id, position_id: pos_id, coin_type_a, coin_type_b, reward_coins: rewarder_coin_types || [] }, tx)

    const other_rewarder: Record<string, any> = {}
    rewardRes.reward_coin_objs.forEach((coinObj, index) => {
      const rewardType = rewarder_coin_types[index]
      // Merge same-token rewards directly to reduce downstream coin object count.
      if (isSameType(rewardType, coin_type_a)) tx.mergeCoins(fee_a, [coinObj])
      else if (isSameType(rewardType, coin_type_b)) tx.mergeCoins(fee_b, [coinObj])
      else other_rewarder[rewardType] = coinObj
    })
    return { fee_a, fee_b, other_rewarder }
  }

  /**
   * Claim and process rewards:
   * - Same A/B token rewards are merged into coin_a/coin_b directly;
   * - Other mergeable rewards are collected into mergeInputCoinMap;
   * - Unprocessed other rewards are transferred back to user address.
   */
  async claimFeeAndRewardsAndMergeRewards(
    baseParams: { pool_id: string; pos_id: string; coin_type_a: SuiAddressType; coin_type_b: SuiAddressType; rewarder_coin_types: SuiAddressType[] },
    rewarderMergeOption?: { merge_routers: any; slippage: number; not_merge_coins: string[] },
    tx = new Transaction()
  ) {
    const { coin_type_a, coin_type_b } = baseParams
    const { fee_a, fee_b, other_rewarder } = await this.collectFeeAndRewardsAndReturnCoins(baseParams, tx)
    let coin_a: any = fee_a
    let coin_b: any = fee_b
    const mergeInputCoinMap: any = {}
    for (const key in other_rewarder) {
      const coin = other_rewarder[key]
      if (rewarderMergeOption && isNotMergeCoin(rewarderMergeOption.not_merge_coins, key)) {
        if (fixCoinType(key) === fixCoinType(coin_type_a)) tx.mergeCoins(coin_a, [coin])
        else if (fixCoinType(key) === fixCoinType(coin_type_b)) tx.mergeCoins(coin_b, [coin])
        else mergeInputCoinMap[fixCoinType(key)] = { coinType: key, coin }
      } else if (fixCoinType(coin_type_a) === fixCoinType(key)) {
        tx.mergeCoins(coin_a, [coin])
      } else if (fixCoinType(coin_type_b) === fixCoinType(key)) {
        tx.mergeCoins(coin_b, [coin])
      } else {
        // Return non-target rewards that do not participate in merge, avoiding leftovers in tx context.
        tx.transferObjects([coin], this.sdk.getSenderAddress())
      }
    }

    if (!isEmptyObj(mergeInputCoinMap) && rewarderMergeOption?.merge_routers) {
      // Execute multi-token merge swap, then merge target token into the A/B primary coin object.
      const inputCoins = rewarderMergeOption.merge_routers.allRoutes?.map((item: any) => mergeInputCoinMap[fixCoinType(item.paths[0].from)])
      const targetCoin = await this._sdk.AggregatorClient.mergeSwap({ router: rewarderMergeOption.merge_routers, inputCoins, slippage: rewarderMergeOption.slippage, txb: tx })
      const targetType = rewarderMergeOption.merge_routers.allRoutes[0].paths[rewarderMergeOption.merge_routers.allRoutes[0].paths.length - 1].target
      if (fixCoinType(targetType) === fixCoinType(coin_type_a)) tx.mergeCoins(coin_a, [targetCoin])
      else tx.mergeCoins(coin_b, [targetCoin])
    }
    return { coin_a, coin_b }
  }

  /**
   * Close or partially remove an old position, returning only principal coin objects:
   * - Claim fee/reward first and transfer them directly to the user;
   * - Use closePosition when close_position=true;
   * - Otherwise use removeLiquidity (by remove_percent).
   */
  async closePosOnlyReturnAmountCoins(params: ClosePosOnlyReturnAmountCoinsParams, tx: Transaction) {
    const { pool_id, pos_id, coin_type_a, coin_type_b, rewarder_coin_types, close_position = true } = params
    const { fee_a, fee_b, other_rewarder } = await this.collectFeeAndRewardsAndReturnCoins(params, tx)
    tx.transferObjects([fee_a, fee_b], this.sdk.getSenderAddress())
    for (const key in other_rewarder) tx.transferObjects([other_rewarder[key]], this.sdk.getSenderAddress())
    if (close_position) {
      const { coin_a_obj, coin_b_obj } = this._sdk.DlmmSDK.Position.closePositionNoTransferPayload(
        { pool_id, position_id: pos_id, reward_coins: rewarder_coin_types, coin_type_a, coin_type_b },
        tx
      )
      return { coin_a: coin_a_obj, coin_b: coin_b_obj }
    }
    // When not closing the position, remove only the specified liquidity ratio and return related assets.
    const { coin_a_obj, coin_b_obj } = this._sdk.DlmmSDK.Position.removeLiquidityNoTransferPayload(
      {
        pool_id,
        position_id: pos_id,
        active_id: params.active_id,
        bin_step: params.bin_step,
        bin_infos: params.bin_infos,
        slippage: params.slippage,
        reward_coins: rewarder_coin_types,
        collect_fee: false,
        remove_percent: params.remove_percent,
        coin_type_a,
        coin_type_b,
      },
      tx
    )
    return { coin_a: coin_a_obj, coin_b: coin_b_obj }
  }

  /**
   * Close/partially remove position while retaining A/B coin objects:
   * - Different from closePosOnlyReturnAmountCoins, reward merge is done first here;
   * - Position principal is finally merged back into coin_a/coin_b as compound inputs.
   */
  async closePosReturnCoinWithMerge(params: ClosePosReturnAmountCoinAParams, rewarderMergeOption?: { merge_routers: any; slippage: number; not_merge_coins: string[] }, tx = new Transaction()) {
    const { coin_type_a, coin_type_b, pool_id, pos_id, close_position = true } = params
    const { coin_a, coin_b } = await this.claimFeeAndRewardsAndMergeRewards(params, rewarderMergeOption, tx)
    const res = close_position
      ? this._sdk.DlmmSDK.Position.closePositionNoTransferPayload(
        { pool_id, position_id: pos_id, reward_coins: params.rewarder_coin_types, coin_type_a, coin_type_b },
        tx
      )
      : this._sdk.DlmmSDK.Position.removeLiquidityNoTransferPayload(
        {
          pool_id,
          position_id: pos_id,
          active_id: params.active_id,
          bin_step: params.bin_step,
          bin_infos: params.bin_infos,
          slippage: params.slippage,
          reward_coins: params.rewarder_coin_types,
          collect_fee: false,
          remove_percent: params.remove_percent,
          coin_type_a,
          coin_type_b,
        },
        tx
      )
    tx.mergeCoins(coin_a, [res.coin_a_obj])
    tx.mergeCoins(coin_b, [res.coin_b_obj])
    return { coin_a, coin_b }
  }

  /**
   * Build a standalone claim + merge + transfer transaction only:
   * suited for "convert rewards into one target token and withdraw" flow, without add-liquidity actions.
   */
  async createClaimMergePayload(params: CreateClaimMergePayloadParams) {
    const { coin_type_a, coin_type_b, not_merge_coins, merge_routers, slippage, target_coin_type } = params
    const tx = new Transaction()
    const { fee_a, fee_b, other_rewarder } = await this.collectFeeAndRewardsAndReturnCoins(params, tx)
    const inputCoinMap: any = {}
    let coin_a: any
    let coin_b: any
    // For A/B fees, keep for merge only when strategy allows; otherwise transfer back to user directly.
    if (fee_a && isNotMergeCoin(not_merge_coins, coin_type_a) && !isSameType(target_coin_type, coin_type_a)) coin_a = fee_a
    else if (fee_a) tx.transferObjects([fee_a], this.sdk.getSenderAddress())
    if (fee_b && isNotMergeCoin(not_merge_coins, coin_type_b) && !isSameType(target_coin_type, coin_type_b)) coin_b = fee_b
    else if (fee_b) tx.transferObjects([fee_b], this.sdk.getSenderAddress())

    for (const key in other_rewarder) {
      const coin = other_rewarder[key]
      if (isNotMergeCoin(not_merge_coins, key) && !isSameType(target_coin_type, key)) {
        if (isSameType(key, coin_type_a)) {
          if (coin_a) {
            tx.mergeCoins(coin_a, [coin])
          } else {
            coin_a = coin
          }
        }
        else if (isSameType(key, coin_type_b)) {
          if (coin_b) {
            tx.mergeCoins(coin_b, [coin])
          } else {
            coin_b = coin
          }
        }
        else inputCoinMap[fixCoinType(key)] = { coinType: key, coin }
      } else tx.transferObjects([coin], this.sdk.getSenderAddress())
    }

    // Build merge inputs and execute final swap, then transfer target token to the user.
    if (coin_a) inputCoinMap[fixCoinType(coin_type_a)] = { coinType: coin_type_a, coin: coin_a }
    if (coin_b) inputCoinMap[fixCoinType(coin_type_b)] = { coinType: coin_type_b, coin: coin_b }
    const inputCoins = merge_routers.allRoutes?.map((item: any) => inputCoinMap[fixCoinType(item.paths[0].from)])
    const targetCoin = await this._sdk.AggregatorClient.mergeSwap({ router: merge_routers, inputCoins, slippage, txb: tx })
    tx.transferObjects([targetCoin], this.sdk.getSenderAddress())
    return tx
  }

  /**
   * Main compounding flow (without position migration):
   * - Claim first with optional merge;
   * - If rebalance requires swap, execute route swap inside tx first;
   * - Finally addLiquidity back to the original position using rebalance result.
   */
  async createCompoundRebalanceAddPayload(params: CreateCompoundRebalanceAddPayload) {
    const tx = params.tx || new Transaction()
    const { baseParams, rebalancePre, rewarderMergeOption } = params
    const { pool_id, pos_id, coin_type_a, coin_type_b, active_id, bin_step, strategy_type } = baseParams
    const { slippage } = rewarderMergeOption
    const { swap_result, bin_infos } = rebalancePre
    const { coin_a, coin_b } = await this.claimFeeAndRewardsAndMergeRewards(baseParams as any, rewarderMergeOption, tx)

    if (swap_result?.route_obj) {
      // Route "from" determines whether to split coin_a or coin_b; merge swap output into the opposite side.
      const fromIsCoinA = fixCoinType(swap_result.route_obj.paths[0].from) === fixCoinType(coin_type_a)
      const swapInputCoin = fromIsCoinA ? tx.splitCoins(coin_a, [tx.pure.u64(swap_result.swap_in_amount)]) : tx.splitCoins(coin_b, [tx.pure.u64(swap_result.swap_in_amount)])
      const swapOutCoin = await this._sdk.AggregatorClient.fixableRouterSwapV3({
        router: swap_result.route_obj,
        slippage,
        txb: tx,
        inputCoin: swapInputCoin,
      } as BuildRouterSwapParamsV3)
      if (fromIsCoinA) tx.mergeCoins(coin_b, [swapOutCoin])
      else tx.mergeCoins(coin_a, [swapOutCoin])
    }

    this._sdk.DlmmSDK.Position.addLiquidityPayload(
      {
        pool_id,
        position_id: pos_id,
        coin_type_a,
        coin_type_b,
        bin_infos,
        active_id,
        bin_step,
        strategy_type,
        max_price_slippage: slippage,
        collect_fee: false,
        reward_coins: [],
        use_bin_infos: false,
        coin_object_id_a: coin_a,
        coin_object_id_b: coin_b,
      },
      tx
    )
    return tx
  }

  /**
   * Main move-position flow:
   * 1) Retrieve assets from old position (optionally already claimed);
   * 2) Execute one swap if required by rebalancePre;
   * 3) Add liquidity into new position config by new bin range.
   */
  async createMovePositionPayload(params: CreateMovePositionPayloadParams, tx = new Transaction()) {
    const { newPos, oldPos, rebalancePre, slippage, rewarderMergeOption, have_claim } = params
    const { pool_id, pos_id, coin_type_a, coin_type_b, rewarder_coin_types } = oldPos
    const { swap_result, bin_infos } = rebalancePre
    const res = have_claim
      // have_claim=true means reward merge was handled externally, so only principal assets are returned here.
      ? await this.closePosOnlyReturnAmountCoins(
        {
          pool_id,
          pos_id,
          coin_type_a,
          coin_type_b,
          rewarder_coin_types,
          active_id: oldPos.active_id,
          bin_step: oldPos.bin_step,
          slippage: oldPos.slippage,
          bin_infos: oldPos.bin_infos,
          remove_percent: oldPos.remove_percent,
          close_position: oldPos.close_position ?? true,
        },
        tx
      )
      // Otherwise handle reward merge within this flow.
      : await this.closePosReturnCoinWithMerge(
        {
          pool_id,
          pos_id,
          coin_type_a,
          coin_type_b,
          rewarder_coin_types,
          active_id: oldPos.active_id,
          bin_step: oldPos.bin_step,
          slippage: oldPos.slippage,
          bin_infos: oldPos.bin_infos,
          remove_percent: oldPos.remove_percent,
          close_position: oldPos.close_position ?? true,
        },
        rewarderMergeOption,
        tx
      )

    let coin_a = res.coin_a
    let coin_b = res.coin_b
    if (swap_result?.route_obj) {
      const fromIsCoinA = fixCoinType(swap_result.route_obj.paths[0].from) === fixCoinType(coin_type_a)
      const swapInputCoin = fromIsCoinA ? tx.splitCoins(coin_a, [tx.pure.u64(swap_result.swap_in_amount)]) : tx.splitCoins(coin_b, [tx.pure.u64(swap_result.swap_in_amount)])
      const swapOutCoin = await this._sdk.AggregatorClient.fixableRouterSwapV3({
        router: swap_result.route_obj,
        slippage,
        txb: tx,
        inputCoin: swapInputCoin,
      } as BuildRouterSwapParamsV3)
      if (fromIsCoinA) tx.mergeCoins(coin_b, [swapOutCoin])
      else tx.mergeCoins(coin_a, [swapOutCoin])
    }



    // Use newPos bin range and strategy to migrate assets into the new position distribution.
    this._sdk.DlmmSDK.Position.addLiquidityPayload(
      {
        pool_id,
        coin_type_a,
        coin_type_b,
        lower_bin_id: newPos.lower_bin_id,
        upper_bin_id: newPos.upper_bin_id,
        active_id: newPos.active_id,
        bin_step: newPos.bin_step,
        strategy_type: newPos.strategy_type,
        active_bin_of_pool: newPos.active_bin_of_pool,
        max_price_slippage: slippage,
        use_bin_infos: false,
        bin_infos,
        coin_object_id_a: tx.splitCoins(coin_a, [tx.pure.u64(bin_infos.amount_a)]),
        coin_object_id_b: tx.splitCoins(coin_b, [tx.pure.u64(bin_infos.amount_b)]),
      } as any,
      tx
    )

    tx.transferObjects([coin_a, coin_b], this.sdk.getSenderAddress())

    return tx
  }
}
