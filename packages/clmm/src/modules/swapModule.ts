import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions'
import { normalizeSuiAddress } from '@mysten/sui/utils'
import BN from 'bn.js'
import { d, DETAILS_KEYS, extractStructTagFromType, IModule, TickMath, U64_MAX, ZERO } from '@cetusprotocol/common-sdk'
import Decimal from 'decimal.js'
import { ConfigErrorCode, handleMessageError, SwapErrorCode } from '../errors/errors'
import { CetusClmmSDK } from '../sdk'
import {
  CalculateRatesParams,
  CalculateRatesResult,
  PreSwapParams,
  PreSwapWithMultiPoolParams,
  SwapGasEstimateArg,
  SwapParams,
  TransPreSwapWithMultiPoolParams,
} from '../types/clmm_type'
import { computeSwap, SplitPath, transClmmpoolDataWithoutTicks } from '../types/clmmpool'
import { ClmmFetcherModule } from '../types/sui'
import { findAdjustCoin } from '../utils/positionUtils'
import { SwapUtils } from '../utils/swapUtils'
export const AMM_SWAP_MODULE = 'amm_swap'
export const POOL_STRUCT = 'Pool'

/**
 * Helper class to help interact with clmm pool swap with a swap router interface.
 */
export class SwapModule implements IModule<CetusClmmSDK> {
  protected _sdk: CetusClmmSDK

  constructor(sdk: CetusClmmSDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  calculateSwapFee(paths: SplitPath[]) {
    let fee = d(0)
    paths.forEach((item) => {
      const pathCount = item.base_paths.length
      if (pathCount > 0) {
        const path = item.base_paths[0]
        const fee_rate = path.label === 'Cetus' ? new Decimal(path.fee_rate).div(10 ** 6) : new Decimal(path.fee_rate).div(10 ** 9)
        const feeAmount = d(path.input_amount)
          .div(10 ** path.from_decimal)
          .mul(fee_rate)
        fee = fee.add(feeAmount)
        if (pathCount > 1) {
          const path2 = item.base_paths[1]
          const price1 = path.direction ? path.current_price : new Decimal(1).div(path.current_price)
          const price2 = path2.direction ? path2.current_price : new Decimal(1).div(path2.current_price)
          const feeRate2 = path2.label === 'Cetus' ? new Decimal(path2.fee_rate).div(10 ** 6) : new Decimal(path2.fee_rate).div(10 ** 9)

          const feeAmount2 = d(path2.output_amount)
            .div(10 ** path2.to_decimal)
            .mul(feeRate2)
          const fee2 = feeAmount2.div(price1.mul(price2))
          fee = fee.add(fee2)
        }
      }
    })

    return fee.toString()
  }

  calculateSwapPriceImpact(paths: SplitPath[]) {
    let impactValue = d(0)
    paths.forEach((item) => {
      const pathCount = item.base_paths.length
      if (pathCount === 1) {
        const path = item.base_paths[0]
        const output_amount = d(path.output_amount).div(10 ** path.to_decimal)
        const input_amount = d(path.input_amount).div(10 ** path.from_decimal)
        const rate = output_amount.div(input_amount)
        const cprice = path.direction ? new Decimal(path.current_price) : new Decimal(1).div(path.current_price)
        impactValue = impactValue.add(this.calculateSingleImpact(rate, cprice))
      }
      if (pathCount === 2) {
        const path = item.base_paths[0]
        const path2 = item.base_paths[1]
        const cprice1 = path.direction ? new Decimal(path.current_price) : new Decimal(1).div(path.current_price)
        const cprice2 = path2.direction ? new Decimal(path2.current_price) : new Decimal(1).div(path2.current_price)
        const cprice = cprice1.mul(cprice2)
        const output_amount = new Decimal(path2.output_amount).div(10 ** path2.to_decimal)
        const input_amount = new Decimal(path.input_amount).div(10 ** path.from_decimal)
        const rate = output_amount.div(input_amount)
        impactValue = impactValue.add(this.calculateSingleImpact(rate, cprice))
      }
    })

    return impactValue.toString()
  }

  private calculateSingleImpact = (rate: Decimal, c_price: Decimal) => {
    // ((cprice - rate)/cprice)*100
    return c_price.minus(rate).div(c_price).mul(100)
  }

  /**
   * Performs a pre-swap with multiple pools.
   *
   * @param {PreSwapWithMultiPoolParams} params The parameters for the pre-swap.
   * @returns {Promise<SwapWithMultiPoolData>} A promise that resolves to the swap data.
   */
  async preSwapWithMultiPool(params: PreSwapWithMultiPoolParams) {
    const { integrate } = this.sdk.sdkOptions
    const tx = new Transaction()

    const typeArguments = [params.coin_type_a, params.coin_type_b]
    for (let i = 0; i < params.pool_ids.length; i += 1) {
      const args = [tx.object(params.pool_ids[i]), tx.pure.bool(params.a2b), tx.pure.bool(params.by_amount_in), tx.pure.u64(params.amount)]
      tx.moveCall({
        target: `${integrate.published_at}::${ClmmFetcherModule}::calculate_swap_result`,
        arguments: args,
        typeArguments,
      })
    }

    const simulateRes = await this.sdk.FullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: normalizeSuiAddress('0x0'),
    })
    if (simulateRes.error != null) {
      handleMessageError(
        ConfigErrorCode.InvalidConfig,
        `pre swap with multi pools error code: ${simulateRes.error ?? 'unknown error'}, please check config and params`,
        {
          [DETAILS_KEYS.METHOD_NAME]: 'preSwapWithMultiPool',
          [DETAILS_KEYS.REQUEST_PARAMS]: {
            params,
          },
        }
      )
    }

    const valueData: any = simulateRes.events?.filter((item: any) => {
      return extractStructTagFromType(item.type).name === `CalculatedSwapResultEvent`
    })
    if (valueData.length === 0) {
      return null
    }

    if (valueData.length !== params.pool_ids.length) {
      handleMessageError(SwapErrorCode.ParamsLengthNotEqual, 'valueData.length !== params.pools.length', {
        [DETAILS_KEYS.METHOD_NAME]: 'preSwapWithMultiPool',
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          params,
        },
      })
    }
    let tempMaxAmount = params.by_amount_in ? ZERO : U64_MAX
    let tempIndex = 0
    for (let i = 0; i < valueData.length; i += 1) {
      if (valueData[i].parsedJson.data.is_exceed) {
        continue
      }

      if (params.by_amount_in) {
        const amount = new BN(valueData[i].parsedJson.data.amount_out)
        if (amount.gt(tempMaxAmount)) {
          tempIndex = i
          tempMaxAmount = amount
        }
      } else {
        const amount = new BN(valueData[i].parsedJson.data.amount_out)
        if (amount.lt(tempMaxAmount)) {
          tempIndex = i
          tempMaxAmount = amount
        }
      }
    }

    return this.transformSwapWithMultiPoolData(
      {
        pool_address: params.pool_ids[tempIndex],
        a2b: params.a2b,
        by_amount_in: params.by_amount_in,
        amount: params.amount,
        coin_type_a: params.coin_type_a,
        coin_type_b: params.coin_type_b,
      },
      valueData[tempIndex].parsedJson
    )
  }

  /**
   * Performs a pre-swap.
   *
   * @param {PreSwapParams} params The parameters for the pre-swap.
   * @returns {Promise<PreSwapParams>} A promise that resolves to the swap data.
   */
  async preSwap(params: PreSwapParams) {
    const { integrate } = this.sdk.sdkOptions

    const tx = new Transaction()

    const typeArguments = [params.coin_type_a, params.coin_type_b]
    const args = [tx.object(params.pool.id), tx.pure.bool(params.a2b), tx.pure.bool(params.by_amount_in), tx.pure.u64(params.amount)]

    tx.moveCall({
      target: `${integrate.published_at}::${ClmmFetcherModule}::calculate_swap_result`,
      arguments: args,
      typeArguments,
    })

    const simulateRes = await this.sdk.FullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: normalizeSuiAddress('0x0'),
    })
    if (simulateRes.error != null) {
      return handleMessageError(
        ConfigErrorCode.InvalidConfig,
        `preSwap error code: ${simulateRes.error ?? 'unknown error'}, please check config and params`,
        {
          [DETAILS_KEYS.METHOD_NAME]: 'preSwap',
          [DETAILS_KEYS.REQUEST_PARAMS]: {
            params,
          },
        }
      )
    }

    const valueData: any = simulateRes.events?.filter((item: any) => {
      return extractStructTagFromType(item.type).name === `CalculatedSwapResultEvent`
    })
    if (valueData.length === 0) {
      return handleMessageError(
        ConfigErrorCode.InvalidConfig,
        `preSwap error code: ${simulateRes.error ?? 'unknown error'}, please check config and params`,
        {
          [DETAILS_KEYS.METHOD_NAME]: 'preSwap',
          [DETAILS_KEYS.REQUEST_PARAMS]: {
            params,
          },
        }
      )
    }
    return this.transformSwapData(params, valueData[0].parsedJson.data)
  }

  private transformSwapData(params: PreSwapParams, data: any) {
    const estimatedAmountIn = data.amount_in && data.fee_amount ? new BN(data.amount_in).add(new BN(data.fee_amount)).toString() : ''
    return {
      pool_address: params.pool.id,
      current_sqrt_price: params.current_sqrt_price,
      estimated_amount_in: estimatedAmountIn,
      estimated_amount_out: data.amount_out,
      estimated_end_sqrt_price: data.after_sqrt_price,
      estimated_fee_amount: data.fee_amount,
      is_exceed: data.is_exceed,
      amount: params.amount,
      a2b: params.a2b,
      by_amount_in: params.by_amount_in,
    }
  }

  private transformSwapWithMultiPoolData(params: TransPreSwapWithMultiPoolParams, json_data: any) {
    const { data } = json_data

    console.log('json data. ', data)

    const estimatedAmountIn = data.amount_in && data.fee_amount ? new BN(data.amount_in).add(new BN(data.fee_amount)).toString() : ''
    return {
      pool_address: params.pool_address,
      estimated_amount_in: estimatedAmountIn,
      estimated_amount_out: data.amount_out,
      estimated_end_sqrt_price: data.after_sqrt_price,
      estimated_start_sqrt_price: data.step_results[0].current_sqrt_price,
      estimated_fee_amount: data.fee_amount,
      is_exceed: data.is_exceed,
      amount: params.amount,
      a2b: params.a2b,
      by_amount_in: params.by_amount_in,
    }
  }

  /**
   * Calculates the rates for a swap.
   * @param {CalculateRatesParams} params The parameters for the calculation.
   * @returns {CalculateRatesResult} The results of the calculation.
   */
  calculateRates(params: CalculateRatesParams): CalculateRatesResult {
    const { current_pool } = params
    const poolData = transClmmpoolDataWithoutTicks(current_pool)

    let ticks
    if (params.a2b) {
      ticks = params.swap_ticks.sort((a, b) => {
        return b.index - a.index
      })
    } else {
      ticks = params.swap_ticks.sort((a, b) => {
        return a.index - b.index
      })
    }

    const swapResult = computeSwap(params.a2b, params.by_amount_in, params.amount, poolData, ticks)

    let isExceed = false
    if (params.by_amount_in) {
      isExceed = swapResult.amount_in.lt(params.amount)
    } else {
      isExceed = swapResult.amount_out.lt(params.amount)
    }
    const sqrtPriceLimit = SwapUtils.getDefaultSqrtPriceLimit(params.a2b)
    if (params.a2b && swapResult.next_sqrt_price.lt(sqrtPriceLimit)) {
      isExceed = true
    }

    if (!params.a2b && swapResult.next_sqrt_price.gt(sqrtPriceLimit)) {
      isExceed = true
    }

    let extraComputeLimit = 0
    if (swapResult.cross_tick_num > 6 && swapResult.cross_tick_num < 40) {
      extraComputeLimit = 22000 * (swapResult.cross_tick_num - 6)
    }

    if (swapResult.cross_tick_num > 40) {
      isExceed = true
    }

    const prePrice = TickMath.sqrtPriceX64ToPrice(poolData.current_sqrt_price, params.decimals_a, params.decimals_b).toNumber()
    const afterPrice = TickMath.sqrtPriceX64ToPrice(swapResult.next_sqrt_price, params.decimals_a, params.decimals_b).toNumber()

    const priceImpactPct = (Math.abs(prePrice - afterPrice) / prePrice) * 100

    return {
      estimated_amount_in: swapResult.amount_in,
      estimated_amount_out: swapResult.amount_out,
      estimated_end_sqrt_price: swapResult.next_sqrt_price,
      estimated_fee_amount: swapResult.fee_amount,
      is_exceed: isExceed,
      extra_compute_limit: extraComputeLimit,
      amount: params.amount,
      a2b: params.a2b,
      by_amount_in: params.by_amount_in,
      price_impact_pct: priceImpactPct,
    }
  }

  /**
   * create swap transaction payload
   * @param params
   * @param gas_estimate_arg When the fix input amount is SUI, gasEstimateArg can control whether to recalculate the number of SUI to prevent insufficient gas.
   * If this parameter is not passed, gas estimation is not performed
   * @returns
   */
  async createSwapPayload(params: SwapParams): Promise<Transaction> {


    return SwapUtils.buildSwapTransaction(this.sdk, params)
  }

  /**
   * create swap transaction without transfer coins payload
   * @param params
   * @param gas_estimate_arg When the fix input amount is SUI, gasEstimateArg can control whether to recalculate the number of SUI to prevent insufficient gas.
   * If this parameter is not passed, gas estimation is not performed
   * @returns tx and coin ABs
   */
  async createSwapWithoutTransferCoinsPayload(
    params: SwapParams,
  ): Promise<{ tx: Transaction; coin_ab_s: TransactionObjectArgument[] }> {


    return SwapUtils.buildSwapTransactionWithoutTransferCoins(this.sdk, params)
  }
}
