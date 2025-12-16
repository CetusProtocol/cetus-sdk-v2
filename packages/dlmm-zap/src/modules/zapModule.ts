import { BuildRouterSwapParamsV3, FindRouterParams, PreSwapLpChangeParams } from '@cetusprotocol/aggregator-sdk'
import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions'
import BN from 'bn.js'
import {
  asUintN,
  ClmmPoolUtil,
  CLOCK_ADDRESS,
  CoinAsset,
  CoinAssist,
  convertScientificToDecimal,
  d,
  DETAILS_KEYS,
  fromDecimalsAmount,
  getPackagerConfigs,
  IModule,
  TickMath,
  toDecimalsAmount,
} from '@cetusprotocol/common-sdk'
import Decimal from 'decimal.js'
import { handleError, handleMessageError, ZapErrorCode } from '../errors/errors'
import {
  BaseDepositOptions,
  CalculationDepositResult,
  CalculationWithdrawAvailableAmountOptions,
  CalculationWithdrawOptions,
  CalculationWithdrawResult,
  defaultSwapSlippage,
  DepositOptions,
  OnlyCoinDepositOptions,
  SwapResult,
  WithdrawOptions,
} from '../types/zap'
import { calcExactSwapAmount, calculateLiquidityAmountEnough, calculateLiquidityAmountSide } from '../utils/zap'
import { CetusDlmmZapSDK } from '../sdk'
import {
  AddLiquidityOption,
  BinAmount,
  BinLiquidityInfo,
  BinUtils,
  CalculateAddLiquidityAutoFillOption,
  OpenAndAddLiquidityOption,
  RemoveLiquidityOption,
} from '@cetusprotocol/dlmm-sdk'
import e from 'cors'

/**
 * ZapModule handles interactions with clmm pools within the system.
 */
export class ZapModule implements IModule<CetusDlmmZapSDK> {
  protected _sdk: CetusDlmmZapSDK

  constructor(sdk: CetusDlmmZapSDK) {
    this._sdk = sdk
  }

  /**
   * Returns the associated SDK instance
   */
  get sdk() {
    return this._sdk
  }

  private async calculateBalanceSwapAmountWithoutActiveId(options: BaseDepositOptions, mode_options: OnlyCoinDepositOptions) {
    const { fix_amount_a, coin_amount } = mode_options
    const { bin_step, pool_id, active_id, lower_bin_id, upper_bin_id, active_bin_of_pool, strategy_type } = options
    const pool = await this._sdk.DlmmSDK.Pool.getPool(pool_id, false)

    let best_swap_result: SwapResult | undefined
    let _fix_amount_a = fix_amount_a
    let _coin_amount = coin_amount
    if (active_id > upper_bin_id) {
      _fix_amount_a = false
      if (fix_amount_a) {
        best_swap_result = await this.findRouters(pool.coin_type_a, pool.coin_type_b, coin_amount)
        _coin_amount = d(best_swap_result.swap_out_amount)
          .mul(1 - 0.001)
          .toFixed(0)
      } else {
        _coin_amount = coin_amount
      }
    } else if (active_id < lower_bin_id) {
      _fix_amount_a = true
      if (fix_amount_a) {
        _coin_amount = coin_amount
      } else {
        best_swap_result = await this.findRouters(pool.coin_type_b, pool.coin_type_a, coin_amount)
        _coin_amount = d(best_swap_result.swap_out_amount)
          .mul(1 - 0.001)
          .toFixed(0)
      }
    }

    const liquidity_info = await this._sdk.DlmmSDK.Position.calculateAddLiquidityInfo({
      pool_id,
      coin_amount: _coin_amount,
      fix_amount_a: _fix_amount_a,
      active_id,
      bin_step,
      lower_bin_id,
      upper_bin_id,
      active_bin_of_pool,
      strategy_type,
    })

    return {
      liquidity_info,
      swap_result: best_swap_result,
    }
  }

  private async calculateBalanceSwapAmount(options: BaseDepositOptions, mode_options: OnlyCoinDepositOptions) {
    const { fix_amount_a, coin_amount } = mode_options
    const { bin_step, pool_id, active_id, lower_bin_id, upper_bin_id, active_bin_of_pool, strategy_type } = options

    if (active_id > upper_bin_id || active_id < lower_bin_id) {
      return this.calculateBalanceSwapAmountWithoutActiveId(options, mode_options)
    }

    const liquidity_info = await this._sdk.DlmmSDK.Position.calculateAddLiquidityInfo({
      pool_id,
      coin_amount,
      fix_amount_a,
      active_id,
      bin_step,
      lower_bin_id,
      upper_bin_id,
      active_bin_of_pool,
      strategy_type,
    })
    const { amount_a, amount_b } = liquidity_info

    const target_rate = fix_amount_a ? d(amount_b).div(amount_a) : d(amount_a).div(amount_b)
    let real_price = fix_amount_a
      ? BinUtils.getPricePerLamportFromBinId(active_id, bin_step)
      : d(1).div(BinUtils.getPricePerLamportFromBinId(active_id, bin_step)).toString()

    const pool = await this._sdk.DlmmSDK.Pool.getPool(pool_id, false)

    try {
      const price_result = await this.findRouters(
        fix_amount_a ? pool.coin_type_a : pool.coin_type_b,
        fix_amount_a ? pool.coin_type_b : pool.coin_type_a,
        coin_amount
      )

      if (price_result) {
        real_price = d(price_result.swap_out_amount).div(price_result.swap_in_amount).toString()
      }
    } catch (error) {}

    const { swap_amount, final_amount_a, final_amount_b } = calcExactSwapAmount(
      coin_amount,
      fix_amount_a,
      real_price,
      target_rate.toString()
    )

    console.log('🚀 ~ ZapModule ~ swap_amount:', {
      swap_amount,
      final_amount_a,
      final_amount_b,
      target_rate,
      real_price,
      coin_amount,
      fix_amount_a,
    })

    let swap_amount_in = swap_amount || '0'
    let best_swap_result
    let best_liquidity_info: BinLiquidityInfo | undefined
    let temp_swap_result: SwapResult | undefined
    let count = 0
    const max_remain_rate = 0.02

    let cached_swap_result: SwapResult | undefined
    let cached_liquidity_info: BinLiquidityInfo | undefined
    let cached_real_remain_rate: Decimal | undefined

    do {
      const deposit_amount = d(coin_amount).sub(swap_amount_in).toFixed(0)

      temp_swap_result = await this.findRouters(
        fix_amount_a ? pool.coin_type_a : pool.coin_type_b,
        fix_amount_a ? pool.coin_type_b : pool.coin_type_a,
        swap_amount_in
      )
      const swap_out_amount = d(temp_swap_result.swap_out_amount).toFixed(0)

      const liquidity_info = await this._sdk.DlmmSDK.Position.calculateAddLiquidityInfo({
        pool_id,
        coin_amount: deposit_amount,
        fix_amount_a,
        active_id,
        bin_step,
        lower_bin_id,
        upper_bin_id,
        active_bin_of_pool,
        strategy_type,
      })
      const { amount_a, amount_b } = liquidity_info
      const deposit_amount_other = fix_amount_a ? amount_b : amount_a
      const real_remain_rate = d(swap_out_amount).sub(deposit_amount_other).div(swap_out_amount)

      if (real_remain_rate.gt(0) && (cached_real_remain_rate === undefined || real_remain_rate.lt(cached_real_remain_rate))) {
        cached_swap_result = temp_swap_result
        cached_liquidity_info = liquidity_info
        cached_real_remain_rate = real_remain_rate
      }

      if (d(swap_out_amount).gt(deposit_amount_other)) {
        if (d(real_remain_rate).gt(max_remain_rate)) {
          console.log('calculateBalanceSwapAmount -: ', {
            swap_amount_in,
            real_remain_rate: real_remain_rate.toString(),
            cached_real_remain_rate: cached_real_remain_rate?.toString(),
            temp_swap_result,
            deposit_amount_other,
            count,
          })
          swap_amount_in = d(swap_amount_in)
            .mul(1 - 0.01)
            .toFixed(0)

          count++
        } else {
          best_swap_result = temp_swap_result
          best_liquidity_info = liquidity_info
          break
        }
      } else {
        swap_amount_in = d(swap_amount_in)
          .mul(1 + 0.01)
          .toFixed(0)
        swap_amount_in = Math.min(
          Number(
            d(coin_amount)
              .mul(1 - 0.0001)
              .toFixed(0)
          ),
          Number(swap_amount_in)
        ).toString()
        console.log('calculateBalanceSwapAmount +: ', {
          swap_amount_in,
          real_remain_rate: real_remain_rate.toString(),
          cached_real_remain_rate: cached_real_remain_rate?.toString(),
          temp_swap_result,
          deposit_amount_other,
          count,
        })
        count++
      }
      if (count > 5) {
        break
      }
    } while (!best_swap_result && d(swap_amount_in).gt(0))

    if (best_swap_result === undefined && cached_swap_result) {
      best_swap_result = cached_swap_result
      best_liquidity_info = cached_liquidity_info
    }

    if (best_swap_result === undefined && temp_swap_result) {
      const { swap_out_amount } = temp_swap_result
      const liquidity_info = await this._sdk.DlmmSDK.Position.calculateAddLiquidityInfo({
        pool_id,
        coin_amount: d(swap_out_amount)
          .sub(1 - 0.001)
          .toFixed(0),
        fix_amount_a: !fix_amount_a,
        active_id,
        bin_step,
        lower_bin_id,
        upper_bin_id,
        active_bin_of_pool,
        strategy_type,
      })
      best_swap_result = temp_swap_result
      best_liquidity_info = liquidity_info
    }

    return {
      swap_result: best_swap_result,
      liquidity_info: best_liquidity_info,
    }
  }

  /**
   * Pre-calculates the deposit amount based on the selected mode.
   * @param options
   * @param mode_options
   * @returns
   */
  async preCalculateDepositAmount(options: BaseDepositOptions, mode_options: OnlyCoinDepositOptions): Promise<CalculationDepositResult> {
    const { fix_amount_a, coin_amount } = mode_options
    console.log('🚀 ~ ZapModule ~ preCalculateDepositAmount ~ options:', {
      options,
      mode_options,
    })

    const { liquidity_info: best_liquidity_info, swap_result: best_swap_result } = await this.calculateBalanceSwapAmount(
      options,
      mode_options
    )

    if (best_liquidity_info === undefined) {
      return handleMessageError(ZapErrorCode.SwapAmountError, 'Best  liquidity info is undefined', {
        [DETAILS_KEYS.METHOD_NAME]: 'preCalculateDepositAmount',
      }) as never
    }

    return {
      bin_infos: best_liquidity_info,
      swap_result: best_swap_result,
      fix_amount_a,
      coin_amount,
    }
  }

  public async buildDepositPayload(options: DepositOptions, tx?: Transaction): Promise<Transaction> {
    const {
      swap_slippage = defaultSwapSlippage,
      bin_step,
      pool_id,
      active_id,
      lower_bin_id,
      upper_bin_id,
      strategy_type,
      deposit_obj,
      slippage,
      pos_obj,
    } = options
    const { fix_amount_a, coin_amount, swap_result, bin_infos } = deposit_obj

    tx = tx || new Transaction()
    const pool = await this._sdk.DlmmSDK.Pool.getPool(pool_id, false)
    const { coin_type_a, coin_type_b } = pool

    let deposit_amount_a_coin
    let deposit_amount_b_coin
    if (swap_result) {
      const coin_type = fix_amount_a ? coin_type_a : coin_type_b
      const { swap_in_amount, route_obj } = swap_result
      const swap_amount_in_coin = CoinAssist.buildCoinWithBalance(BigInt(swap_in_amount), coin_type, tx)
      const routerParamsV3: BuildRouterSwapParamsV3 = {
        router: route_obj,
        slippage: swap_slippage,
        txb: tx,
        inputCoin: swap_amount_in_coin,
      }
      const swap_out_coin = await this._sdk.AggregatorClient.fixableRouterSwapV3(routerParamsV3)

      if (fix_amount_a) {
        deposit_amount_a_coin = CoinAssist.buildCoinWithBalance(BigInt(bin_infos.amount_a), coin_type_a, tx)
        deposit_amount_b_coin = swap_out_coin
      } else {
        deposit_amount_a_coin = swap_out_coin
        deposit_amount_b_coin = CoinAssist.buildCoinWithBalance(BigInt(bin_infos.amount_b), coin_type_b, tx)
      }
    }

    if (pos_obj) {
      const addOption: AddLiquidityOption = {
        pool_id,
        bin_infos: bin_infos,
        coin_type_a,
        coin_type_b,
        active_id,
        strategy_type,
        max_price_slippage: slippage,
        bin_step,
        use_bin_infos: false,
        position_id: pos_obj.pos_id as string,
        collect_fee: pos_obj.collect_fee,
        reward_coins: pos_obj.collect_rewarder_types,
        coin_object_id_a: deposit_amount_a_coin,
        coin_object_id_b: deposit_amount_b_coin,
      }
      this._sdk.DlmmSDK.Position.addLiquidityPayload(addOption, tx)
    } else {
      const addOption: OpenAndAddLiquidityOption = {
        pool_id,
        bin_infos: bin_infos,
        coin_type_a,
        coin_type_b,
        lower_bin_id,
        upper_bin_id,
        active_id,
        strategy_type,
        use_bin_infos: false,
        max_price_slippage: slippage,
        bin_step,
        coin_object_id_a: deposit_amount_a_coin,
        coin_object_id_b: deposit_amount_b_coin,
      }
      this._sdk.DlmmSDK.Position.addLiquidityPayload(addOption, tx)
    }

    return tx
  }

  public async findRouters(from: string, target: string, amount: string): Promise<SwapResult> {
    const { providers } = this._sdk.sdkOptions
    const client = this._sdk.AggregatorClient

    if (d(amount).lt(1)) {
      return handleMessageError(ZapErrorCode.SwapAmountError, 'Swap amount is less than the minimum precision', {
        [DETAILS_KEYS.METHOD_NAME]: 'findRouters',
      }) as never
    }

    try {
      // Construct parameters for route finding
      const findRouterParams: FindRouterParams = {
        from,
        target,
        amount: new BN(amount),
        byAmountIn: true,
        depth: 3,
        providers,
      }

      // Find the swap route
      const res = await client.findRouters(findRouterParams)
      if (res?.error) {
        return handleMessageError(ZapErrorCode.AggregatorError, `Aggregator findRouters error: ${res?.error}`, {
          [DETAILS_KEYS.METHOD_NAME]: 'findRouters',
          [DETAILS_KEYS.REQUEST_PARAMS]: findRouterParams,
        }) as never
      }
      if (!res?.paths || res?.paths?.length === 0) {
        return handleMessageError(ZapErrorCode.AggregatorError, 'Aggregator findRouters error: no router', {
          [DETAILS_KEYS.METHOD_NAME]: 'findRouters',
          [DETAILS_KEYS.REQUEST_PARAMS]: findRouterParams,
        }) as never
      }

      const swap_in_amount = res.amountIn.toString()
      const swap_out_amount = res.amountOut.toString()

      // Return the swap result
      const swapResult: SwapResult = {
        swap_in_amount,
        swap_out_amount,
        route_obj: res,
      }
      return swapResult
    } catch (error) {
      console.log('🚀 ~ ZapModule ~ error:', JSON.stringify(error, null, 2))
      return handleError(ZapErrorCode.AggregatorError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'swapInPools',
      })
    }
  }

  public calculateZapOutAvailableAmount(options: CalculationWithdrawAvailableAmountOptions) {
    const { is_receive_coin_a, mode, active_id, bin_step, remove_bin_range, prices, coin_decimal_a, coin_decimal_b } = options
    let price
    if (prices) {
      const { coin_a_price, coin_b_price } = prices
      price = d(coin_a_price).div(coin_b_price).toString()
    } else {
      price = BinUtils.getPriceFromBinId(active_id, bin_step, coin_decimal_a, coin_decimal_b)
    }

    let active_bin: BinAmount | undefined
    let user_total_amount_a = '0'
    let user_total_amount_b = '0'
    let available_amount = '0'

    remove_bin_range.forEach((bin) => {
      if (bin.bin_id === active_id) {
        active_bin = bin
      }
      user_total_amount_a = d(user_total_amount_a).add(bin.amount_a).toFixed(0)
      user_total_amount_b = d(user_total_amount_b).add(bin.amount_b).toFixed(0)
    })

    const user_total_amount_a_no_active = d(user_total_amount_a)
      .sub(active_bin?.amount_a || '0')
      .toFixed(0)
    const user_total_amount_b_no_active = d(user_total_amount_b)
      .sub(active_bin?.amount_b || '0')
      .toFixed(0)

    const transformToAmountB = d(
      toDecimalsAmount(d(fromDecimalsAmount(user_total_amount_a, coin_decimal_a)).mul(price).toString(), coin_decimal_b)
    ).toFixed(0)
    const transformToAmountA = d(
      toDecimalsAmount(d(fromDecimalsAmount(user_total_amount_b, coin_decimal_b)).div(price).toString(), coin_decimal_a)
    ).toFixed(0)
    if (mode === 'OnlyCoinA') {
      if (is_receive_coin_a) {
        available_amount = user_total_amount_a_no_active
      } else {
        available_amount = transformToAmountB
      }
    } else if (mode === 'OnlyCoinB') {
      user_total_amount_b = user_total_amount_b_no_active
      if (is_receive_coin_a) {
        available_amount = transformToAmountA
      } else {
        available_amount = user_total_amount_b
      }
    } else if (mode === 'Both') {
      if (is_receive_coin_a) {
        available_amount = d(transformToAmountA).add(user_total_amount_a).toFixed(0)
      } else {
        available_amount = d(transformToAmountB).add(user_total_amount_b).toFixed(0)
      }
    }
    return {
      available_amount,
      user_total_amount_a,
      user_total_amount_b,
      active_bin,
      is_receive_coin_a,
    }
  }

  public async preCalculateWithdrawAmount(options: CalculationWithdrawOptions): Promise<CalculationWithdrawResult> {
    const { is_receive_coin_a, remove_bin_range, coin_type_a, coin_type_b, mode, expected_receive_amount, active_id } = options

    const { available_amount, user_total_amount_a, user_total_amount_b, active_bin } = this.calculateZapOutAvailableAmount(options)
    if (d(available_amount).lt(d(expected_receive_amount))) {
      return handleMessageError(
        ZapErrorCode.SwapAmountError,
        `Available amount is less than the expected receive amount: ${available_amount} < ${expected_receive_amount}`,
        {
          [DETAILS_KEYS.METHOD_NAME]: 'preCalculateWithdrawAmount',
          [DETAILS_KEYS.REQUEST_PARAMS]: options,
        }
      ) as never
    }
    const remove_percent = d(expected_receive_amount).div(available_amount)

    let remove_liquidity_info: BinLiquidityInfo
    if (mode === 'Both') {
      const fix_amount_a = d(user_total_amount_a).gt(0)
      const coin_amount = fix_amount_a
        ? d(user_total_amount_a).mul(remove_percent).toFixed(0)
        : d(user_total_amount_b).mul(remove_percent).toFixed(0)
      remove_liquidity_info = this._sdk.DlmmSDK.Position.calculateRemoveLiquidityInfo({
        bins: remove_bin_range,
        active_id,
        fix_amount_a,
        coin_amount,
      })
    } else {
      const coin_amount =
        mode === 'OnlyCoinA' ? d(user_total_amount_a).mul(remove_percent).toFixed(0) : d(user_total_amount_b).mul(remove_percent).toFixed(0)
      remove_liquidity_info = this._sdk.DlmmSDK.Position.calculateRemoveLiquidityInfo({
        bins: remove_bin_range,
        active_id,
        is_only_a: mode === 'OnlyCoinA',
        coin_amount,
      })
    }

    const { amount_a, amount_b } = remove_liquidity_info

    let swap_result: SwapResult | undefined
    if (is_receive_coin_a && d(amount_b).gt(0)) {
      swap_result = await this.findRouters(coin_type_b, coin_type_a, amount_b)
    }

    if (!is_receive_coin_a && d(amount_a).gt(0)) {
      swap_result = await this.findRouters(coin_type_a, coin_type_b, amount_a)
    }

    return {
      remove_liquidity_info,
      swap_result,
      mode,
      is_receive_coin_a,
      expected_receive_amount,
      remove_percent: remove_percent.toString(),
    }
  }

  public async buildWithdrawPayload(options: WithdrawOptions): Promise<Transaction> {
    const tx = new Transaction()
    const {
      withdraw_obj,
      swap_slippage = defaultSwapSlippage,
      bin_step,
      pool_id,
      active_id,
      collect_fee,
      reward_coins,
      coin_type_a,
      coin_type_b,
      position_id,
      slippage,
      remove_percent,
      is_close_position,
    } = options

    const { remove_liquidity_info, swap_result, is_receive_coin_a } = withdraw_obj

    const removeOption: RemoveLiquidityOption = {
      pool_id,
      bin_infos: remove_liquidity_info,
      coin_type_a,
      coin_type_b,
      position_id,
      slippage,
      active_id,
      reward_coins,
      collect_fee,
      bin_step,
      remove_percent: Number(remove_percent),
    }
    const { coin_a_obj, coin_b_obj } = is_close_position
      ? this._sdk.DlmmSDK.Position.closePositionNoTransferPayload(removeOption, tx)
      : this._sdk.DlmmSDK.Position.removeLiquidityNoTransferPayload(removeOption, tx)

    if (swap_result) {
      const { route_obj } = swap_result
      const routerParamsV3: BuildRouterSwapParamsV3 = {
        router: route_obj,
        slippage: swap_slippage,
        txb: tx,
        inputCoin: is_receive_coin_a ? coin_b_obj : coin_a_obj,
      }
      const swap_out_coin = await this._sdk.AggregatorClient.fixableRouterSwapV3(routerParamsV3)
      if (is_receive_coin_a) {
        tx.transferObjects([coin_a_obj, swap_out_coin], this._sdk.getSenderAddress())
      } else {
        tx.transferObjects([coin_b_obj, swap_out_coin], this._sdk.getSenderAddress())
      }
    } else {
      tx.transferObjects([coin_a_obj, coin_b_obj], this._sdk.getSenderAddress())
    }

    return tx
  }
}
