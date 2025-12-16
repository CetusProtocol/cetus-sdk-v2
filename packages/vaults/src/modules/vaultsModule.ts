import { coinWithBalance, Transaction, TransactionArgument, TransactionObjectArgument } from '@mysten/sui/transactions'
import { BN } from 'bn.js'
import Decimal from 'decimal.js'
import {
  CalculateAmountParams,
  CalculateAmountResult,
  CalculateRemoveAmountParams,
  CalculateRemoveAmountResult,
  DepositParams,
  InputType,
  Vault,
  VaultsConfigs,
  VaultsRouterModule,
  VaultsVaultModule,
  WithdrawBothParams,
  WithdrawOneSideParams,
} from '../types'

import { AggregatorClient, FindRouterParams, PreSwapLpChangeParams } from '@cetusprotocol/aggregator-sdk'
import { ClmmIntegrateRouterModule, PositionUtils } from '@cetusprotocol/sui-clmm-sdk'
import {
  BuildCoinResult,
  CACHE_TIME_24H,
  ClmmPoolUtil,
  CLOCK_ADDRESS,
  CoinAssist,
  d,
  DataPage,
  extractStructTagFromType,
  getDefaultSqrtPriceLimit,
  getObjectFields,
  getPackagerConfigs,
  IModule,
  PaginationArgs,
  TickMath,
} from '@cetusprotocol/common-sdk'
import { handleMessageError, VaultsErrorCode } from '../errors'
import { CetusVaultsSDK } from '../sdk'
import { VaultsUtils } from '../utils/vaults'

/**
 * Helper class to help interact with Vaults interface.
 */
export class VaultsModule implements IModule<CetusVaultsSDK> {
  protected _sdk: CetusVaultsSDK

  constructor(sdk: CetusVaultsSDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  async calculateDepositAmount(
    params: CalculateAmountParams,
    should_request_stake = true,
    adjust_best_amount = false
  ): Promise<CalculateAmountResult> {
    if (params.side === InputType.Both) {
      return await this.calculateAmountFromBoth(params, true)
    }
    return await this.calculateDepositAmountFromOneSide(params, should_request_stake, adjust_best_amount)
  }

  async calculateWithdrawAmount(params: CalculateRemoveAmountParams): Promise<CalculateRemoveAmountResult> {
    if (params.side === InputType.Both) {
      if (params.is_ft_input) {
        const amounts = await this.estLiquidityAmountFromFtAmount({
          ...params,
          input_ft_amount: params.input_amount,
        })
        return {
          ...amounts,
          request_id: params.input_amount,
          burn_ft_amount: params.input_amount,
          side: params.side,
        }
      }
      const res = await this.calculateAmountFromBoth(params, false)
      return {
        ...res,
        request_id: params.input_amount,
        burn_ft_amount: res.ft_amount,
        side: params.side,
      }
    }
    const { vault } = await this.getVaultAndPool(params.vault_id)

    if (!+params.max_ft_amount) {
      return handleMessageError(VaultsErrorCode.InvalidMaxFtAmount, 'max_ft_amount input is invalid')
    }

    const max_liquidity = VaultsUtils.getShareLiquidityByAmount(vault, params.max_ft_amount)
    return await this.calculateWithdrawAmountFromOneSide(
      {
        fix_amount_a: params.fix_amount_a,
        vault_id: params.vault_id,
        receive_amount: params.is_ft_input ? '0' : params.input_amount,
        slippage: params.slippage,
        max_liquidity,
        remove_liquidity: params.is_ft_input ? VaultsUtils.getShareLiquidityByAmount(vault, params.input_amount) : undefined,
      },
      true
    )
  }

  private async calculateWithdrawAmountFromOneSide(
    params: {
      fix_amount_a: boolean
      vault_id: string
      receive_amount: string
      slippage: number
      remove_liquidity?: string
      max_liquidity: string
    },
    use_route: boolean,
    range?: {
      left: Decimal
      right: Decimal
      count: number
    }
  ): Promise<CalculateRemoveAmountResult> {
    try {
      const { vault_id, remove_liquidity, max_liquidity } = params
      // Get vault information
      const { vault, pool } = await this.getVaultAndPool(vault_id)
      const { position } = vault
      const lowerTick = position.tick_lower_index
      const upperTick = position.tick_upper_index

      const is_remove_all = remove_liquidity === max_liquidity

      const ratios = ClmmPoolUtil.calculateDepositRatio(lowerTick, upperTick, new BN(pool.current_sqrt_price))
      const fix_ratio = params.fix_amount_a ? ratios.ratio_a : ratios.ratio_b

      let fix_amount = d(params.receive_amount).mul(fix_ratio)
      let other_side_amount
      let liquidity

      // Remove by liquidity
      if (remove_liquidity) {
        const lower_sqrt_price = TickMath.tickIndexToSqrtPriceX64(lowerTick)
        const upper_sqrt_price = TickMath.tickIndexToSqrtPriceX64(upperTick)
        const remove_params = ClmmPoolUtil.getCoinAmountFromLiquidity(
          new BN(remove_liquidity),
          new BN(pool.current_sqrt_price),
          lower_sqrt_price,
          upper_sqrt_price,
          false
        )
        liquidity = remove_liquidity
        other_side_amount = params.fix_amount_a ? remove_params.coin_amount_b.toString() : remove_params.coin_amount_a.toString()
        fix_amount = params.fix_amount_a ? d(remove_params.coin_amount_a.toString()) : d(remove_params.coin_amount_b.toString())
      } else {
        // Fixed fix_amount_a calculation of liquidity and value in the other direction
        const remove_params = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
          lowerTick,
          upperTick,
          new BN(fix_amount.toFixed(0)),
          params.fix_amount_a,
          false,
          params.slippage,
          new BN(pool.current_sqrt_price)
        )
        liquidity = remove_params.liquidity_amount.toString()
        other_side_amount = params.fix_amount_a ? remove_params.coin_amount_b.toString() : remove_params.coin_amount_a.toString()
      }
      // Swap otherSideAmount to get the expected value in the fix_amount_a direction
      const a2b = !params.fix_amount_a

      const data: any = await this.findRouters(
        pool.id,
        pool.current_sqrt_price.toString(),
        params.fix_amount_a ? pool.coin_type_b : pool.coin_type_a,
        params.fix_amount_a ? pool.coin_type_a : pool.coin_type_b,
        d(other_side_amount),
        true,
        [pool.id],
        {
          poolID: pool.id,
          ticklower: lowerTick,
          tickUpper: upperTick,
          deltaLiquidity: Number(liquidity),
        }
      )

      const rcl_amount = fix_amount.add(data.amount_out)
      const expect_amount = d(params.receive_amount)
      const ramain_amount = expect_amount.sub(rcl_amount)

      if (!is_remove_all && (!params.remove_liquidity || (params.remove_liquidity && range))) {
        if (ramain_amount.abs().greaterThan(expect_amount.mul(0.01))) {
          // amount is not enough
          const amount_insufficient = rcl_amount.lessThan(expect_amount)
          let left
          let right
          if (!range) {
            left = amount_insufficient ? d(liquidity) : d(0)
            right = amount_insufficient ? d(params.max_liquidity) : d(liquidity)
          }
          // Determine the remaining amount last time and the remaining amount this time
          else if (amount_insufficient) {
            left = d(liquidity)
            right = range.right
          } else {
            left = range.left
            right = d(liquidity)
          }

          const mid_liquidity = d(left).add(right).div(2).toFixed(0)
          if (!range || (range && range.count < 15 && left.lessThan(right))) {
            const swap_result = await this.calculateWithdrawAmountFromOneSide(
              {
                ...params,
                remove_liquidity: mid_liquidity,
              },
              use_route,
              {
                left,
                right,
                count: range ? range.count + 1 : 0,
              }
            )
            return swap_result
          }
        }
      }

      const swap_in_amount =
        data.amount_in && data.fee_amount ? new BN(data.amount_in).add(new BN(data.fee_amount)).toString() : data.amount_in
      const swap_out_amount = data.amount_out
      const { is_exceed } = data

      const burn_ft_amount = VaultsUtils.getLpAmountByLiquidity(vault, liquidity.toString())
      const amounts = await this.estLiquidityAmountFromFtAmount({
        vault_id,
        input_ft_amount: burn_ft_amount,
        slippage: params.slippage,
      })

      const result: CalculateRemoveAmountResult = {
        side: InputType.OneSide,
        ...amounts,
        burn_ft_amount,
        request_id: params.receive_amount,
        swap_result: {
          swap_in_amount: swap_in_amount,
          swap_out_amount: swap_out_amount,
          a2b,
          is_exceed,
          route_obj: data.route_obj,
        },
      }

      return result
    } catch (error) {
      if (use_route && (String(error) === 'Error: route unavailable' || String(error) === 'Error: router timeout')) {
        return await this.calculateWithdrawAmountFromOneSide(params, false)
      }
      throw error
    }
  }

  private async calculateDepositAmountFromOneSide(
    params: CalculateAmountParams,
    should_request_stake: boolean,
    adjust_best_amount = false,
    use_route = true,
    max_loop_limit = 5,
    max_remain_rate = 0.02
  ): Promise<CalculateAmountResult> {
    try {
      const { vault_id, input_amount, fix_amount_a: fix_input_amount_a, slippage } = params
      // Get vault information
      const { vault, pool } = await this.getVaultAndPool(vault_id)
      const { position } = vault
      const lowerTick = position.tick_lower_index
      const upperTick = position.tick_upper_index

      const first_tick = TickMath.sqrtPriceX64ToTickIndex(new BN(pool.current_sqrt_price))
      const { ratio_a, ratio_b } = ClmmPoolUtil.calculateDepositRatio(lowerTick, upperTick, new BN(pool.current_sqrt_price))

      const fix_amount = d(input_amount).mul(fix_input_amount_a ? ratio_a : ratio_b)
      const swap_amount = d(input_amount).sub(fix_amount)
      const a2b = fix_input_amount_a
      if (swap_amount.toFixed(0) === '0') {
        return await this.calculateAmountFromBoth(params, true)
      }

      let fix_amount_a
      let swap_data
      let pares_swap_data
      let after_sqrt_price
      let swap_in_amount
      let swap_out_amount
      let swap_out_amount_limit

      swap_data = await this.findRouters(
        pool.id,
        pool.current_sqrt_price.toString(),
        a2b ? pool.coin_type_a : pool.coin_type_b,
        a2b ? pool.coin_type_b : pool.coin_type_a,
        swap_amount,
        true,
        [pool.id]
      )

      pares_swap_data = this.paresSwapData(
        swap_data,
        params.input_amount,
        params.fix_amount_a,
        a2b,
        lowerTick,
        upperTick,
        ratio_a,
        ratio_b,
        slippage
      )
      swap_out_amount_limit = pares_swap_data.swap_out_amount_limit
      const max_remaining = d(params.input_amount).mul(max_remain_rate)
      if (d(params.input_amount).sub(pares_swap_data.pre_amount_total).gt(max_remaining)) {
        const rebalance_params = {
          clmm_pool: pool.id,
          cur_sqrt_price: pool.current_sqrt_price.toString(),
          a2b,
          amount_a: a2b ? d(input_amount) : d(0),
          amount_b: a2b ? d(0) : d(params.input_amount),
          amount_left: a2b ? d(swap_amount.toFixed(0)) : d(0),
          amount_right: a2b ? d(input_amount) : d(swap_amount.toFixed(0)),
          lower_tick: lowerTick,
          upper_tick: upperTick,
          tick_spacing: 2,
          coin_type_a: position.coin_type_a,
          coin_type_b: position.coin_type_b,
          remain_rate: 0.02,
          price_split_point: slippage,
          use_route: use_route,
          max_loop_limit: max_loop_limit,
        }
        const use_rebalance = adjust_best_amount && first_tick <= upperTick

        swap_data = use_rebalance
          ? await this.calculateRebalance(rebalance_params)
          : await this.findRouters(
              pool.id,
              pool.current_sqrt_price.toString(),
              a2b ? pool.coin_type_a : pool.coin_type_b,
              a2b ? pool.coin_type_b : pool.coin_type_a,
              swap_amount,
              true,
              [pool.id]
            )
      }

      after_sqrt_price = swap_data.after_sqrt_price

      pares_swap_data = this.paresSwapData(
        swap_data,
        params.input_amount,
        params.fix_amount_a,
        a2b,
        lowerTick,
        upperTick,
        ratio_a,
        ratio_b,
        slippage
      )
      swap_out_amount_limit = pares_swap_data.swap_out_amount_limit
      fix_amount_a = pares_swap_data.fix_amount_a
      swap_in_amount = pares_swap_data.swap_in_amount
      swap_out_amount = pares_swap_data.swap_out_amount
      after_sqrt_price = pares_swap_data.after_sqrt_price

      const coin_amount = fix_amount_a === fix_input_amount_a ? d(input_amount).sub(swap_in_amount).toFixed(0) : swap_out_amount_limit

      const liquidity_input = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
        lowerTick,
        upperTick,
        new BN(coin_amount),
        fix_amount_a,
        true,
        slippage,
        new BN(after_sqrt_price)
      )

      const amount_a = liquidity_input.coin_amount_a.toString()
      const amount_b = liquidity_input.coin_amount_b.toString()

      const lp_amount = VaultsUtils.getLpAmountByLiquidity(vault, liquidity_input.liquidity_amount.toString())
      return {
        request_id: params.input_amount,
        side: InputType.OneSide,
        amount_a,
        amount_b,
        amount_limit_a: liquidity_input.coin_amount_limit_a.toString(),
        amount_limit_b: liquidity_input.coin_amount_limit_b.toString(),
        ft_amount: lp_amount,
        original_input_amount: params.input_amount,
        fix_amount_a: fix_amount_a,
        swap_result: {
          swap_in_amount: swap_in_amount,
          swap_out_amount: swap_out_amount,
          a2b: fix_input_amount_a,
          route_obj: swap_data.route_obj,
          is_exceed: swap_data.is_exceed,
          after_sqrt_price: after_sqrt_price,
        },
      }
    } catch (error) {
      if (use_route && (String(error) === 'Error: route unavailable' || String(error) === 'Error: router timeout')) {
        return await this.calculateDepositAmountFromOneSide(params, should_request_stake, false)
      }
      throw error
    }
  }

  paresSwapData(
    swap_data: any,
    input_amount: string,
    fix_input_amount_a: boolean,
    a2b: boolean,
    lower_tick: number,
    upper_tick: number,
    ratio_a: Decimal,
    ratio_b: Decimal,
    slippage: number
  ) {
    const after_sqrt_price = swap_data.after_sqrt_price
    const current_tick = TickMath.sqrtPriceX64ToTickIndex(new BN(after_sqrt_price))
    const { ratio_a: after_ratio_a, ratio_b: after_ratio_b } = ClmmPoolUtil.calculateDepositRatio(
      lower_tick,
      upper_tick,
      new BN(after_sqrt_price)
    )
    let fix_amount_a = after_ratio_b.div(after_ratio_a).sub(ratio_b.div(ratio_a)).greaterThan('0')

    const swap_in_amount =
      swap_data.amount_in && swap_data.fee_amount
        ? new BN(swap_data.amount_in).add(new BN(swap_data.fee_amount)).toString()
        : swap_data.amount_in
    const swap_out_amount = swap_data.amount_out
    const swap_out_amount_limit = d(swap_data.amount_out)
      .mul(1 - slippage)
      .toFixed(0)

    const coin_amount = fix_amount_a === a2b ? new BN(d(input_amount).sub(swap_in_amount).toString()) : new BN(swap_out_amount_limit)

    let pre_amount_total = d(input_amount)

    if (current_tick < lower_tick) {
      fix_amount_a = true
    } else if (current_tick > upper_tick) {
      fix_amount_a = false
    } else {
      const liquidity_input = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
        lower_tick,
        upper_tick,
        coin_amount,
        fix_amount_a,
        true,
        0,
        new BN(after_sqrt_price)
      )
      const amount_a = liquidity_input.coin_amount_a
      const amount_b = liquidity_input.coin_amount_b

      pre_amount_total = d(fix_input_amount_a ? amount_a.toString() : amount_b.toString()).add(swap_in_amount)

      if (pre_amount_total.greaterThan(input_amount)) {
        fix_amount_a = !fix_amount_a
      }
    }

    return {
      pre_amount_total,
      fix_amount_a,
      swap_in_amount,
      swap_out_amount,
      swap_out_amount_limit,
      after_sqrt_price,
    }
  }

  public async findRouters(
    clmm_pool: string,
    cur_sqrt_price: string,
    coin_type_a: string,
    coin_type_b: string,
    amount: Decimal,
    by_amount_in: boolean,
    pools: string[],
    liquidity_changes?: PreSwapLpChangeParams
  ) {
    const { providers } = this._sdk.sdkOptions

    try {
      const findRouterParams: FindRouterParams = {
        from: coin_type_a,
        target: coin_type_b,
        amount: new BN(amount.toFixed(0).toString()),
        byAmountIn: by_amount_in,
        depth: 3,
        providers,
      }
      if (liquidity_changes && liquidity_changes.poolID) {
        findRouterParams.liquidityChanges = [liquidity_changes]
      }
      const res = await this._sdk.AggregatorClient.findRouters(findRouterParams)
      if (res?.error?.code === 10001) {
        return {
          ...res,
          is_exceed: res.insufficientLiquidity,
        }
      }
      if (res?.insufficientLiquidity) {
        return {
          ...res,
          is_exceed: res.insufficientLiquidity,
        }
      }
      if (!res?.paths || res?.paths?.length === 0) {
        throw Error('Aggregator no router')
      }

      let after_sqrt_price = cur_sqrt_price
      // res.paths.forEach((splitPath: any) => {
      const basePath: any = res.paths.find((basePath: any) => basePath.id.toLowerCase() === clmm_pool.toLowerCase())
      if (basePath && basePath.extendedDetails && basePath.extendedDetails.afterSqrtPrice) {
        // after_sqrt_price
        after_sqrt_price = String(basePath.extendedDetails.afterSqrtPrice)
      }
      // })
      return {
        amount_in: res.amountIn.toString(),
        amount_out: res.amountOut.toString(),
        is_exceed: res.insufficientLiquidity,
        after_sqrt_price,
        route_obj: res,
        byAmountIn: true,
        liquidity: liquidity_changes?.deltaLiquidity,
        originRes: res,
      }
    } catch (error) {
      try {
        if (pools) {
          const res: any = await this._sdk.AggregatorClient.swapInPools({
            from: coin_type_a,
            target: coin_type_b,
            amount: new BN(amount.toFixed(0).toString()),
            byAmountIn: by_amount_in,
            pools,
          })

          if (res) {
            let after_sqrt_price = cur_sqrt_price
            // res.routeData.paths.forEach((splitPath: any) => {
            const basePath: any = res.routeData.paths.find((basePath: any) => basePath.id.toLowerCase() === clmm_pool.toLowerCase())
            if (basePath) {
              after_sqrt_price = String(basePath.extendedDetails.afterSqrtPrice)
            }
            // })

            return {
              amount_in: res.routeData.amountIn.toString(),
              amount_out: res.routeData.amountOut.toString(),
              is_exceed: res.isExceed,
              after_sqrt_price,
              route_obj: res.routeData,
              byAmountIn: true,
              liquidity: liquidity_changes?.deltaLiquidity,
              originRes: res,
            }
          }
          return null
        }
        return null
      } catch (e) {
        return null
      }
    }
  }

  public async calculateRebalance(params: {
    clmm_pool: string
    cur_sqrt_price: string
    a2b: boolean
    amount_a: Decimal
    amount_b: Decimal
    amount_left: Decimal
    amount_right: Decimal
    lower_tick: number
    upper_tick: number
    tick_spacing: number
    coin_type_a: string
    coin_type_b: string
    use_route?: boolean
    price_split_point?: number
    remain_rate: number
    max_loop_limit: number
  }) {
    const {
      clmm_pool,
      a2b,
      cur_sqrt_price,
      amount_a,
      amount_b,
      lower_tick,
      upper_tick,
      amount_left,
      amount_right,
      coin_type_a,
      coin_type_b,
      use_route,
      price_split_point,
      remain_rate,
      max_loop_limit = 5,
    } = params

    const calculateRebalanceRecursively = async (left: Decimal, right: Decimal, count: number): Promise<any> => {
      const mid = left.plus(right).div(2)
      // const preRes = await this.clmmPreSwap(clmm_pool, curSqrtPrice, a2b, mid, coinTypeA, coinTypeB, true, priceSplitPoint, useRoute)
      const preRes: any = await this.findRouters(clmm_pool, cur_sqrt_price, coin_type_a, coin_type_b, mid, a2b, [clmm_pool])

      if (preRes.amount_out === '0') {
        return preRes
      }

      if (!preRes.after_sqrt_price) {
        preRes.after_sqrt_price = cur_sqrt_price
      }

      if (preRes.is_exceed) {
        right = mid
        return calculateRebalanceRecursively(left, right, count + 1)
      }

      const after_a = a2b ? amount_a.sub(preRes.amount_in) : amount_a.add(preRes.amount_out)
      const after_b = a2b ? amount_b.add(preRes.amount_out) : amount_b.sub(preRes.amount_in)

      const liquidity_input = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
        lower_tick,
        upper_tick,
        new BN(after_a.toString()),
        true,
        true,
        1,
        new BN(preRes.after_sqrt_price)
      )

      const used_a = new Decimal(liquidity_input.coin_amount_a.toString())
      const used_b = new Decimal(liquidity_input.coin_amount_b.toString())

      if (used_a.toString() !== after_a.toString()) {
        throw new Error('used_a does not match after_a')
      }

      if (after_b.lessThan(used_b)) {
        if (a2b) {
          left = mid
        } else {
          right = mid
        }
      } else {
        if (a2b) {
          right = mid
        } else {
          left = mid
        }
        const remaining_b = after_b.sub(used_b)
        const max_remaining_b = after_b.mul(remain_rate)

        if (max_remaining_b.sub(remaining_b).greaterThanOrEqualTo(0) || count >= max_loop_limit) {
          return { ...preRes, remaining_b }
        }
      }
      if (left.greaterThan(right) || right.sub(left).lessThan(10)) {
        return preRes
      }
      return calculateRebalanceRecursively(left, right, count + 1)
    }
    if (amount_left.greaterThanOrEqualTo(amount_right)) {
      return calculateRebalanceRecursively(new Decimal(0), amount_left, 0)
    }
    return calculateRebalanceRecursively(amount_left, amount_right, 0)
  }

  private async calculateAmountFromBoth(params: CalculateAmountParams, round_up: boolean): Promise<CalculateAmountResult> {
    const { vault_id, input_amount, fix_amount_a, slippage } = params
    // Get vault information
    const { vault, pool } = await this.getVaultAndPool(vault_id)

    // Extract position details
    const { position } = vault
    const lower_tick = position.tick_lower_index
    const upper_tick = position.tick_upper_index

    const liquidity_input = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
      lower_tick,
      upper_tick,
      new BN(input_amount),
      fix_amount_a,
      round_up,
      slippage,
      new BN(pool.current_sqrt_price)
    )

    const ft_amount = VaultsUtils.getLpAmountByLiquidity(vault, liquidity_input.liquidity_amount.toString())

    return {
      request_id: params.input_amount,
      amount_a: liquidity_input.coin_amount_a.toString(),
      amount_b: liquidity_input.coin_amount_b.toString(),
      amount_limit_a: liquidity_input.coin_amount_limit_a.toString(),
      amount_limit_b: liquidity_input.coin_amount_limit_b.toString(),
      original_input_amount: params.input_amount,
      ft_amount,
      fix_amount_a,
      side: InputType.Both,
    }
  }

  public async estLiquidityAmountFromFtAmount(params: { vault_id: string; input_ft_amount: string; slippage: number }) {
    const { vault_id, input_ft_amount, slippage } = params
    const { vault, pool } = await this.getVaultAndPool(vault_id)
    // Extract position details
    const { position } = vault
    const lowerTick = position.tick_lower_index
    const upperTick = position.tick_upper_index
    const lowerSqrtPrice = TickMath.tickIndexToSqrtPriceX64(lowerTick)
    const upperSqrtPrice = TickMath.tickIndexToSqrtPriceX64(upperTick)

    const lpTokenAmount = new BN(input_ft_amount)
    const liquidity = VaultsUtils.getShareLiquidityByAmount(vault, lpTokenAmount.toString())
    const curSqrtPrice = new BN(pool.current_sqrt_price)

    const coinAmounts = ClmmPoolUtil.getCoinAmountFromLiquidity(new BN(liquidity), curSqrtPrice, lowerSqrtPrice, upperSqrtPrice, false)
    // const protocol_fee_amount_a = VaultsUtils.getProtocolFeeAmount(vault, coinAmounts.coinA.toString())
    // const protocol_fee_amount_b = VaultsUtils.getProtocolFeeAmount(vault, coinAmounts.coinB.toString())

    const minAmountA = d(coinAmounts.coin_amount_a.toString()).mul(d(1 - slippage))
    const minAmountB = d(coinAmounts.coin_amount_b.toString()).mul(d(1 - slippage))

    return {
      amount_a: coinAmounts.coin_amount_a.toString(),
      amount_b: coinAmounts.coin_amount_b.toString(),
      amount_limit_a: minAmountA.toFixed(0),
      amount_limit_b: minAmountB.toFixed(0),
    }
  }

  async deposit(params: DepositParams, tx: Transaction): Promise<TransactionObjectArgument | undefined> {
    const { vault_id, slippage, coin_object_a, coin_object_b, return_lp_token, deposit_result } = params
    const { swap_result, amount_a, amount_b, fix_amount_a, partner, side, original_input_amount } = deposit_result
    const { vault, pool } = await this.getVaultAndPool(vault_id, false)

    let primaryCoinAInputs
    let primaryCoinBInputs
    let in_coin
    if (side === InputType.OneSide && swap_result) {
      in_coin =
        (swap_result.a2b ? coin_object_a : coin_object_b) ||
        tx.add(coinWithBalance({ balance: BigInt(original_input_amount), type: swap_result.a2b ? pool.coin_type_a : pool.coin_type_b }))

      const spitAmounts = [
        swap_result.swap_in_amount,
        d(original_input_amount).sub(d(swap_result.swap_in_amount)).toFixed(0, Decimal.ROUND_DOWN),
      ]
      const [swap_in_coin, amount_coin] = tx.splitCoins(in_coin, spitAmounts)

      console.log('spitCoins spitAmounts:', spitAmounts)

      const { swap_out_coin } = await this.handleDepositSwap(
        {
          coin_type_a: pool.coin_type_a,
          coin_type_b: pool.coin_type_b,
          slippage,
          clmm_pool_address: pool.id,
          partner,
          swap_in_amount: swap_result.swap_in_amount,
          swap_in_coin,
          a2b: swap_result.a2b,
          route_obj: swap_result.route_obj,
        },
        tx
      )
      if (swap_result.a2b) {
        primaryCoinAInputs = amount_coin
        primaryCoinBInputs = swap_out_coin
      } else {
        primaryCoinAInputs = swap_out_coin
        primaryCoinBInputs = amount_coin
      }
    }

    let amount_a_limit = d(amount_a).mul(d(1).add(slippage)).toFixed(0, Decimal.ROUND_DOWN).toString()
    let amount_b_limit = d(amount_b).mul(d(1).add(slippage)).toFixed(0, Decimal.ROUND_DOWN).toString()
    let fix_amount = fix_amount_a ? amount_a : amount_b

    if (side === InputType.OneSide && swap_result) {
      amount_a_limit = '18446744073709551615'
      amount_b_limit = '18446744073709551615'
      if (swap_result.a2b) {
        fix_amount = d(fix_amount).mul(d(1).sub(0.001)).toFixed(0, Decimal.ROUND_DOWN).toString()
        primaryCoinAInputs =
          primaryCoinAInputs ||
          CoinAssist.buildCoinWithBalance(BigInt(fix_amount_a ? amount_a : deposit_result.amount_limit_a), pool.coin_type_a, tx)
      } else {
        fix_amount = d(fix_amount).mul(d(1).sub(0.001)).toFixed(0, Decimal.ROUND_DOWN).toString()
        primaryCoinBInputs =
          primaryCoinBInputs ||
          CoinAssist.buildCoinWithBalance(
            BigInt(fix_amount_a ? deposit_result.amount_limit_b : deposit_result.amount_b),
            pool.coin_type_b,
            tx
          )
      }
    } else {
      primaryCoinAInputs =
        coin_object_a || CoinAssist.buildCoinWithBalance(BigInt(fix_amount_a ? amount_a : amount_a_limit), pool.coin_type_a, tx)
      primaryCoinBInputs =
        coin_object_b || CoinAssist.buildCoinWithBalance(BigInt(fix_amount_a ? amount_b_limit : amount_b), pool.coin_type_b, tx)
    }

    const lpCoin = await this.depositInternal(
      {
        coin_type_a: pool.coin_type_a,
        coin_type_b: pool.coin_type_b,
        lp_token_type: vault.lp_token_type,
        farming_pool: vault.position.pool_id,
        clmm_pool: pool.id,
        primary_coin_a_inputs: primaryCoinAInputs,
        primary_coin_b_inputs: primaryCoinBInputs,
        vault_id,
        slippage: params.slippage,
        amount_a: fix_amount_a ? fix_amount : amount_a_limit,
        amount_b: fix_amount_a ? amount_b_limit : fix_amount,
        fix_amount_a,
        return_lp_token,
      },
      tx
    )

    if (swap_result && in_coin) {
      tx.transferObjects([in_coin], tx.pure.address(this._sdk.getSenderAddress()))
    }

    if (return_lp_token) {
      return lpCoin
    }

    return undefined
  }

  private async handleDepositSwap(
    params: {
      partner: any
      coin_type_a: string
      coin_type_b: string
      slippage: number
      clmm_pool_address: string
      swap_in_amount: string
      swap_in_coin: TransactionObjectArgument
      a2b: boolean
      route_obj?: any
    },
    tx: Transaction
  ) {
    const { partner, coin_type_a, coin_type_b, slippage, clmm_pool_address, swap_in_amount, a2b, route_obj, swap_in_coin } = params
    const { clmm_pool, integrate } = this._sdk.ClmmSDK.sdkOptions
    const swap_coin_input_from = swap_in_coin

    if (route_obj) {
      const routerParamsV2 = {
        router: route_obj,
        inputCoin: swap_coin_input_from,
        slippage,
        txb: tx,
        partner,
      }

      let client: AggregatorClient = this._sdk.AggregatorClient

      const toCoin = await client.fixableRouterSwapV3(routerParamsV2)

      return {
        swap_out_coin: toCoin,
      }
    }
    const swap_coin_input_to = CoinAssist.buildCoinWithBalance(BigInt(0), a2b ? coin_type_b : coin_type_a, tx)
    const sqrt_price_limit = getDefaultSqrtPriceLimit(a2b).toString()
    const coinABs = tx.moveCall({
      target: `${integrate.published_at}::${ClmmIntegrateRouterModule}::swap`,
      typeArguments: [coin_type_a, coin_type_b],
      arguments: [
        tx.object(getPackagerConfigs(clmm_pool).global_config_id),
        tx.object(clmm_pool_address),
        a2b ? swap_coin_input_from : swap_coin_input_to,
        a2b ? swap_coin_input_to : swap_coin_input_from,
        tx.pure.bool(a2b),
        tx.pure.bool(true),
        tx.pure.u64(swap_in_amount),
        tx.pure.u128(sqrt_price_limit),
        tx.pure.bool(false),
        tx.object(CLOCK_ADDRESS),
      ],
    })

    const swapOutCoin = a2b ? coinABs[1] : coinABs[0]
    const remainSwapInCoin = a2b ? coinABs[0] : coinABs[1]

    tx.transferObjects([remainSwapInCoin], tx.pure.address(this._sdk.getSenderAddress()))

    return {
      swap_out_coin: swapOutCoin,
    }
  }

  private async depositInternal(
    params: {
      vault_id: string
      coin_type_a: string
      coin_type_b: string
      amount_a: string
      amount_b: string
      slippage: number
      fix_amount_a: boolean
      lp_token_type: string
      farming_pool: string
      clmm_pool: string
      primary_coin_a_inputs?: TransactionObjectArgument
      primary_coin_b_inputs?: TransactionObjectArgument
      return_lp_token?: boolean
    },
    tx: Transaction
  ) {
    const { vaults } = this._sdk.sdkOptions
    const { clmm_pool } = this._sdk.ClmmSDK.sdkOptions
    const { farms } = this._sdk.FarmsSDK.sdkOptions

    const vaultsConfigs = getPackagerConfigs(vaults)
    const farmsConfigs = getPackagerConfigs(farms)
    const clmm_pool_configs = getPackagerConfigs(clmm_pool)

    let { primary_coin_a_inputs, primary_coin_b_inputs } = params

    if (primary_coin_a_inputs === undefined || primary_coin_b_inputs === undefined) {
      const all_coin_asset = await this._sdk.FullClient.getOwnerCoinAssets(this._sdk.getSenderAddress())
      primary_coin_a_inputs = PositionUtils.buildAddLiquidityFixTokenCoinInput(
        tx,
        !params.fix_amount_a,
        params.amount_a,
        params.slippage,
        params.coin_type_a,
        all_coin_asset,
        false
      )?.target_coin

      primary_coin_b_inputs = PositionUtils.buildAddLiquidityFixTokenCoinInput(
        tx,
        params.fix_amount_a,
        params.amount_b,
        params.slippage,
        params.coin_type_b,
        all_coin_asset,
        false
      )?.target_coin
    }

    const args = [
      tx.object(vaultsConfigs.vaults_manager_id),
      tx.object(params.vault_id),
      tx.object(farmsConfigs.rewarder_manager_id),
      tx.object(farmsConfigs.global_config_id),
      tx.object(params.farming_pool),
      tx.object(clmm_pool_configs.global_config_id),
      tx.object(params.clmm_pool),
      primary_coin_a_inputs,
      primary_coin_b_inputs,
      tx.pure.u64(params.amount_a),
      tx.pure.u64(params.amount_b),
      tx.pure.bool(params.fix_amount_a),
      tx.object(CLOCK_ADDRESS),
    ]

    const typeArguments = [params.coin_type_a, params.coin_type_b, params.lp_token_type]

    if (params.return_lp_token) {
      return tx.moveCall({
        target: `${vaults.published_at}::${VaultsVaultModule}::deposit`,
        typeArguments,
        arguments: args,
      })
    }
    tx.moveCall({
      target: `${vaults.published_at}::${VaultsRouterModule}::deposit`,
      typeArguments,
      arguments: args,
    })

    return undefined
  }

  async withdraw(
    params: WithdrawBothParams | WithdrawOneSideParams,
    tx: Transaction
  ): Promise<{ return_coin_a?: TransactionObjectArgument; return_coin_b?: TransactionObjectArgument }> {
    const isOneSide = 'is_ft_input' in params
    const { vault, pool } = await this.getVaultAndPool(params.vault_id, true)
    const isReturnCoin = params.return_coin ?? false

    let burn_ft_amount
    let min_amount_a
    let min_amount_b
    let oneSideRes: CalculateRemoveAmountResult | undefined
    if (isOneSide) {
      oneSideRes = await this._sdk.Vaults.calculateWithdrawAmount({
        ...params,
        side: InputType.OneSide,
      })
      min_amount_a = oneSideRes.amount_limit_a
      min_amount_b = oneSideRes.amount_limit_b
      burn_ft_amount = params.is_ft_input ? params.input_amount : oneSideRes.burn_ft_amount
    } else {
      const { vault_id, ft_amount, slippage } = params
      burn_ft_amount = ft_amount
      const res = await this.estLiquidityAmountFromFtAmount({
        vault_id,
        input_ft_amount: ft_amount,
        slippage,
      })

      min_amount_a = res.amount_limit_a
      min_amount_b = res.amount_limit_b
    }

    const { receive_coin_a, receive_coin_b } = await this.withdrawInternal(
      {
        coin_type_a: pool.coin_type_a,
        coin_type_b: pool.coin_type_b,
        lp_token_type: vault.lp_token_type,
        farming_pool: vault.position.pool_id,
        clmm_pool: pool.id,
        min_amount_a,
        min_amount_b,
        vault_id: params.vault_id,
        ft_amount: burn_ft_amount,
      },
      tx
    )

    if (isOneSide && oneSideRes) {
      const { a2b, swap_in_amount, route_obj } = oneSideRes.swap_result!
      if (route_obj) {
        const swap_coin_input_from: BuildCoinResult = {
          target_coin: a2b ? receive_coin_a : receive_coin_b,
          remain_coins: [],
          is_mint_zero_coin: false,
          target_coin_amount: '',
          selected_coins: [],
        }

        const routerParamsV2 = {
          router: route_obj,
          inputCoin: swap_coin_input_from.target_coin,
          slippage: params.slippage,
          txb: tx,
          partner: params.partner,
        }
        let client = this._sdk.AggregatorClient

        const to_coin = await client.fixableRouterSwapV3(routerParamsV2)
        const coin_abs = a2b ? [swap_coin_input_from.target_coin, to_coin] : [to_coin, swap_coin_input_from.target_coin]

        if (a2b) {
          tx.mergeCoins(coin_abs[1], [receive_coin_b])
        } else {
          tx.mergeCoins(coin_abs[0], [receive_coin_a])
        }
        if (isReturnCoin) {
          return {
            return_coin_a: a2b ? undefined : to_coin,
            return_coin_b: a2b ? to_coin : undefined,
          }
        }
        tx.transferObjects([to_coin], tx.pure.address(this._sdk.getSenderAddress()))
      } else {
        const { clmm_pool, integrate } = this._sdk.ClmmSDK.sdkOptions
        const sqrtPriceLimit = getDefaultSqrtPriceLimit(a2b).toString()
        const coinABs: TransactionObjectArgument[] = tx.moveCall({
          target: `${integrate.published_at}::${ClmmIntegrateRouterModule}::swap`,
          typeArguments: [pool.coin_type_a, pool.coin_type_b],
          arguments: [
            tx.object(getPackagerConfigs(clmm_pool).global_config_id),
            tx.object(pool.id),
            receive_coin_a,
            receive_coin_b,
            tx.pure.bool(a2b),
            tx.pure.bool(true),
            tx.pure.u64(swap_in_amount),
            tx.pure.u128(sqrtPriceLimit),
            tx.pure.bool(true),
            tx.object(CLOCK_ADDRESS),
          ],
        })
        if (isReturnCoin) {
          return {
            return_coin_a: coinABs[0],
            return_coin_b: coinABs[1],
          }
        }
        tx.transferObjects([coinABs[0], coinABs[1]], tx.pure.address(this._sdk.getSenderAddress()))
      }
    } else if (isReturnCoin) {
      return {
        return_coin_a: receive_coin_a,
        return_coin_b: receive_coin_b,
      }
    } else {
      tx.transferObjects([receive_coin_a, receive_coin_b], tx.pure.address(this._sdk.getSenderAddress()))
    }

    return {}
  }

  private async withdrawInternal(
    params: {
      vault_id: string
      farming_pool: string
      clmm_pool: string
      coin_type_a: string
      coin_type_b: string
      ft_amount: string
      min_amount_a: string
      min_amount_b: string
      lp_token_type: string
      primary_coin_inputs?: TransactionObjectArgument
    },
    tx: Transaction
  ): Promise<{ receive_coin_a: TransactionObjectArgument; receive_coin_b: TransactionObjectArgument }> {
    const { vaults } = this._sdk.sdkOptions
    const { farms } = this._sdk.FarmsSDK.sdkOptions
    const { clmm_pool } = this._sdk.ClmmSDK.sdkOptions

    const vaultsConfigs = getPackagerConfigs(vaults)
    const farmsConfigs = getPackagerConfigs(farms)
    const clmm_pool_configs = getPackagerConfigs(clmm_pool)

    let { primary_coin_inputs } = params

    if (primary_coin_inputs === undefined) {
      const all_coin_asset = await this._sdk.FullClient.getOwnerCoinAssets(this._sdk.getSenderAddress())
      primary_coin_inputs = CoinAssist.buildCoinForAmount(
        tx,
        all_coin_asset,
        BigInt(params.ft_amount),
        params.lp_token_type,
        false,
        true
      ).target_coin
    }

    const typeArguments = [params.coin_type_a, params.coin_type_b, params.lp_token_type]

    const remove_coin_abs: TransactionObjectArgument[] = tx.moveCall({
      target: `${vaults.published_at}::${VaultsVaultModule}::remove`,
      typeArguments,
      arguments: [
        tx.object(vaultsConfigs.vaults_manager_id),
        tx.object(params.vault_id),
        tx.object(farmsConfigs.rewarder_manager_id),
        tx.object(farmsConfigs.global_config_id),
        tx.object(params.farming_pool),
        tx.object(clmm_pool_configs.global_config_id),
        tx.object(params.clmm_pool),
        primary_coin_inputs,
        tx.pure.u64(params.ft_amount),
        tx.pure.u64(params.min_amount_a),
        tx.pure.u64(params.min_amount_b),
        tx.object(CLOCK_ADDRESS),
      ],
    })
    tx.transferObjects([primary_coin_inputs], tx.pure.address(this._sdk.getSenderAddress()))
    return {
      receive_coin_a: remove_coin_abs[0],
      receive_coin_b: remove_coin_abs[1],
    }
  }

  private async getVaultAndPool(vault_id: string, refresh_pool = false) {
    // Get vault information
    const vault = await this.sdk.Vaults.getVault(vault_id)

    if (vault === undefined) {
      throw new Error(`please check config and vault id`)
    }

    // Get pool information
    const pool = await this._sdk.ClmmSDK.Pool.getPool(vault.pool_id, refresh_pool)

    return {
      vault,
      pool,
    }
  }

  /**
   * Retrieve a list of Vaults.
   * This function allows users to retrieve a list of Vaults with optional pagination.
   * @param pagination_args Pagination arguments for retrieving a specific page or 'all' for all Vaults.
   * @returns A Promise that resolves to a DataPage containing the list of Vaults.
   */
  async getVaultList(pagination_args: PaginationArgs = 'all'): Promise<DataPage<Vault>> {
    // const res = await this._sdk.fullClient.queryEventsByPage({ MoveEventType: `${vaults.package_id}::vaults::CreateEvent` }, paginationArgs)
    const { vaults_pool_handle } = getPackagerConfigs(this._sdk.sdkOptions.vaults)
    const res = await this._sdk.FullClient.getDynamicFieldsByPage(vaults_pool_handle, pagination_args)
    const warpIds = res.data.map((item: any) => item.name.value)

    const objectList = await this._sdk.FullClient.batchGetObjects(warpIds, {
      showType: true,
      showContent: true,
      showDisplay: true,
      showOwner: true,
    })

    const poolList: Vault[] = []
    objectList.forEach((item: any) => {
      const pool = VaultsUtils.buildPool(item)
      if (pool) {
        this.savePoolToCache(pool)
        poolList.push(pool)
      }
    })

    res.data = poolList
    return res
  }

  async getAssignVaultList(poolIds: string[]): Promise<Vault[]> {
    const poolList: Vault[] = []
    if (poolIds.length > 0) {
      const objectList = await this._sdk.FullClient.batchGetObjects(poolIds, { showContent: true })
      objectList.forEach((item: any) => {
        const pool = VaultsUtils.buildPool(item)
        if (pool) {
          this.savePoolToCache(pool)
          poolList.push(pool)
        }
      })
    }
    return poolList
  }

  /**
   * Retrieve a specific Vault by its ID.
   * This function allows users to retrieve a specific Vault by providing its ID.
   * @param id The ID of the Vault to retrieve.
   * @param force_refresh Whether to force a refresh of the data from the server.
   * @returns A Promise that resolves to the retrieved Vault, or undefined if the Vault is not found.
   */
  async getVault(id: string, force_refresh = false): Promise<Vault | undefined> {
    const cache_pool = this.readPoolFromCache(id, force_refresh)
    if (cache_pool) {
      return cache_pool
    }
    try {
      const item: any = await this._sdk.FullClient.getObject({
        id,
        options: { showType: true, showContent: true, showDisplay: true, showOwner: true },
      })
      const pool = VaultsUtils.buildPool(item)
      if (pool) {
        this.savePoolToCache(pool)
        return pool
      }
    } catch (error) {
      console.log(error)
    }
    return undefined
  }

  private savePoolToCache(pool: Vault) {
    const cacheKey = `${pool.id}_mirrorPool`
    this._sdk.updateCache(cacheKey, pool, CACHE_TIME_24H)
  }

  private readPoolFromCache(id: string, force_refresh = false) {
    const cache_key = `${id}_mirror_pool`
    return this._sdk.getCache<Vault>(cache_key, force_refresh)
  }

  public getOwnerVaultsBalance = async (wallet_address: any) => {
    const { data } = await this.getVaultList()
    const result = []
    for (let i = 0; i < data.length; i++) {
      const vault = data[i]
      const lp_token_balance = await this._sdk.FullClient.getBalance({
        owner: wallet_address,
        coinType: vault.lp_token_type,
      })
      const clmm_pool = await this._sdk.ClmmSDK.Pool.getPool(vault.pool_id, true)
      const wrap_data = VaultsUtils.buildVaultBalance(wallet_address, vault, lp_token_balance, clmm_pool)
      if (wrap_data) {
        result.push(wrap_data)
      }
    }
    return result
  }

  async getVaultsConfigs(force_refresh = false): Promise<VaultsConfigs> {
    const { package_id } = this._sdk.sdkOptions.vaults
    const cache_key = `${package_id}_getMirrorPoolConfigs`
    const cache_data = this._sdk.getCache<VaultsConfigs>(cache_key, force_refresh)
    if (cache_data !== undefined) {
      return cache_data
    }

    const objects: any[] = (
      await this._sdk.FullClient.queryEventsByPage({
        MoveEventType: `${package_id}::vaults::InitEvent`,
      })
    ).data

    const config: VaultsConfigs = {
      admin_cap_id: '',
      vaults_manager_id: '',
      vaults_pool_handle: '',
    }

    if (objects.length > 0) {
      for (const item of objects) {
        const fields = item.parsedJson as any
        config.admin_cap_id = fields.admin_cap_id
        config.vaults_manager_id = fields.manager_id

        const masterObj = await this._sdk.FullClient.getObject({ id: config.vaults_manager_id, options: { showContent: true } })
        const masterFields = getObjectFields(masterObj)
        config.vaults_pool_handle = masterFields.vault_to_pool_maps.fields.id.id
        break
      }
      this._sdk.updateCache(cache_key, config, CACHE_TIME_24H)
    }

    return config
  }
}
