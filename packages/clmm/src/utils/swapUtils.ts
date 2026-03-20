import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions'
import BN from 'bn.js'
import {
  adjustForSlippage,
  BuildCoinResult,
  CLOCK_ADDRESS,
  CoinAsset,
  CoinAssist,
  getPackagerConfigs,
  MathUtil,
  MAX_SQRT_PRICE,
  MIN_SQRT_PRICE,
  U64_MAX,
  ZERO,
} from '@cetusprotocol/common-sdk'
import { ConfigErrorCode, handleError, handleMessageError, UtilsErrorCode } from '../errors/errors'
import { CetusClmmSDK, SdkOptions } from '../sdk'
import { SwapGasEstimateArg, SwapParams } from '../types/clmm_type'
import { ClmmIntegratePoolV2Module, ClmmIntegrateRouterModule, ClmmIntegrateRouterWithPartnerModule } from '../types/sui'
import { PositionUtils } from './positionUtils'

export class SwapUtils {
  /**
   * Get the default sqrt price limit for a swap.
   *
   * @param a2b - true if the swap is A to B, false if the swap is B to A.
   * @returns The default sqrt price limit for the swap.
   */
  static getDefaultSqrtPriceLimit(a2b: boolean): BN {
    return new BN(a2b ? MIN_SQRT_PRICE : MAX_SQRT_PRICE)
  }

  /**
   * Get the default values for the otherAmountThreshold in a swap.
   *
   * @param amount_specified_is_input - The direction of a swap
   * @returns The default values for the otherAmountThreshold parameter in a swap.
   */
  static getDefaultOtherAmountThreshold(amount_specified_is_input: boolean): BN {
    return amount_specified_is_input ? ZERO : U64_MAX
  }



  /**
   * build swap transaction
   * @param params
   * @param packageId
   * @returns
   */
  static buildSwapTransactionArgs(
    tx: Transaction,
    params: SwapParams,
    sdk_options: SdkOptions,
    primary_coin_input_a: TransactionObjectArgument,
    primary_coin_input_b: TransactionObjectArgument
  ): Transaction {
    const { clmm_pool, integrate } = sdk_options

    const sqrtPriceLimit = SwapUtils.getDefaultSqrtPriceLimit(params.a2b)
    const typeArguments = [params.coin_type_a, params.coin_type_b]
    const { global_config_id } = getPackagerConfigs(clmm_pool)

    if (global_config_id === undefined) {
      handleMessageError(ConfigErrorCode.InvalidConfig, 'clmm.config.global_config_id is undefined')
    }

    const hasSwapPartner = params.swap_partner !== undefined

    const functionName = hasSwapPartner
      ? params.a2b
        ? 'swap_a2b_with_partner'
        : 'swap_b2a_with_partner'
      : params.a2b
        ? 'swap_a2b'
        : 'swap_b2a'

    const args = hasSwapPartner
      ? [
        tx.object(global_config_id),
        tx.object(params.pool_id),
        tx.object(params.swap_partner!),
        primary_coin_input_a,
        primary_coin_input_b,
        tx.pure.bool(params.by_amount_in),
        tx.pure.u64(params.amount),
        tx.pure.u64(params.amount_limit),
        tx.pure.u128(sqrtPriceLimit.toString()),
        tx.object(CLOCK_ADDRESS),
      ]
      : [
        tx.object(global_config_id),
        tx.object(params.pool_id),
        primary_coin_input_a,
        primary_coin_input_b,
        tx.pure.bool(params.by_amount_in),
        tx.pure.u64(params.amount),
        tx.pure.u64(params.amount_limit),
        tx.pure.u128(sqrtPriceLimit.toString()),
        tx.object(CLOCK_ADDRESS),
      ]

    tx.moveCall({
      target: `${integrate.published_at}::${ClmmIntegratePoolV2Module}::${functionName}`,
      typeArguments,
      arguments: args,
    })
    return tx
  }

  /**
   * adjust transaction for gas
   * @param sdk
   * @param amount
   * @param tx
   * @returns
   */
  static async adjustTransactionForGas(
    sdk: CetusClmmSDK,
    all_coins: CoinAsset[],
    amount: bigint,
    tx: Transaction
  ): Promise<{ fixAmount: bigint; newTx?: Transaction }> {
    tx.setSender(sdk.getSenderAddress())
    // amount coins
    const amount_coins = CoinAssist.selectCoinAssetGreaterThanOrEqual(all_coins, amount).selected_coins
    const total_amount = CoinAssist.calculateTotalBalance(all_coins)

    if (amount_coins.length === 0) {
      handleMessageError(UtilsErrorCode.InsufficientBalance, `Insufficient balance exceed amount ${amount} real amount ${total_amount}`)
    }

    // If the remaining coin balance is greater than 1000000000, no gas fee correction will be done
    if (total_amount - amount > 1000000000) {
      return { fixAmount: amount }
    }

    // payload Estimated gas consumption
    const estimate_gas = await sdk.FullClient.calculationTxGas(tx)

    // Find estimateGas objectIds
    const gas_coins = CoinAssist.selectCoinAssetGreaterThanOrEqual(
      all_coins,
      BigInt(estimate_gas),
      amount_coins.map((item) => item.coin_object_id)
    ).selected_coins

    // There is not enough gas and the amount needs to be adjusted
    if (gas_coins.length === 0) {
      // Readjust the amount , Reserve 500 gas for the spit
      const new_gas = BigInt(estimate_gas) + BigInt(500)
      if (total_amount - amount < new_gas) {
        amount -= new_gas
        if (amount < 0) {
          handleMessageError(UtilsErrorCode.InsufficientBalance, `gas Insufficient balance`)
        }

        const newTx = new Transaction()
        return { fixAmount: amount, newTx }
      }
    }
    return { fixAmount: amount }
  }

  /**
   * build swap transaction
   * @param params
   * @param packageId
   * @returns
   */
  static buildSwapTransaction(sdk: CetusClmmSDK, params: SwapParams): Transaction {
    let tx = new Transaction()
    tx.setSender(sdk.getSenderAddress())

    const primaryCoinInputA = CoinAssist.buildCoinWithBalance(
      params.a2b ? BigInt(params.by_amount_in ? params.amount : params.amount_limit) : BigInt(0),
      params.coin_type_a,
      tx
    )

    const primaryCoinInputB = CoinAssist.buildCoinWithBalance(
      params.a2b ? BigInt(0) : BigInt(params.by_amount_in ? params.amount : params.amount_limit),
      params.coin_type_b,
      tx
    )

    tx = this.buildSwapTransactionArgs(tx, params, sdk.sdkOptions, primaryCoinInputA, primaryCoinInputB)
    return tx
  }

  static async fixSwapParams(sdk: CetusClmmSDK, params: SwapParams, gasEstimateArg: SwapGasEstimateArg): Promise<SwapParams> {
    const { current_pool } = gasEstimateArg
    try {
      const res: any = await sdk.Swap.preSwap({
        decimals_a: gasEstimateArg.decimals_a,
        decimals_b: gasEstimateArg.decimals_b,
        a2b: params.a2b,
        by_amount_in: params.by_amount_in,
        amount: params.amount,
        pool: current_pool,
        current_sqrt_price: current_pool.current_sqrt_price,
        coin_type_a: current_pool.coin_type_a,
        coin_type_b: current_pool.coin_type_b,
      })

      const to_amount = gasEstimateArg.by_amount_in ? res.estimated_amount_out : res.estimated_amount_in

      const amount_limit = adjustForSlippage(to_amount, gasEstimateArg.slippage, !gasEstimateArg.by_amount_in)
      params.amount_limit = amount_limit.toString()
    } catch (error) {
      handleError(ConfigErrorCode.InvalidConfig, error as Error)
    }

    return params
  }



  /**
   * build swap transaction and return swapped coin
   * @param params
   * @param packageId
   * @returns
   */
  static buildSwapTransactionWithoutTransferCoins(
    sdk: CetusClmmSDK,
    params: SwapParams,
  ): { tx: Transaction; coin_ab_s: TransactionObjectArgument[] } {
    const tx = new Transaction()
    tx.setSender(sdk.getSenderAddress())

    // Fix amount must set true, to support amount limit.
    const primaryCoinInputA = CoinAssist.buildCoinWithBalance(
      params.a2b ? BigInt(params.by_amount_in ? params.amount : params.amount_limit) : BigInt(0),
      params.coin_type_a,
      tx
    )

    const primaryCoinInputB = CoinAssist.buildCoinWithBalance(
      params.a2b ? BigInt(0) : BigInt(params.by_amount_in ? params.amount : params.amount_limit),
      params.coin_type_b,
      tx
    )

    const res = SwapUtils.buildSwapTransactionWithoutTransferCoinArgs(sdk, tx, params, sdk.sdkOptions, primaryCoinInputA, primaryCoinInputB)
    return { tx: res.tx, coin_ab_s: res.txRes }
  }

  /**
   * build swap transaction
   * @param params
   * @param packageId
   * @returns
   */
  static buildSwapTransactionWithoutTransferCoinArgs(
    sdk: CetusClmmSDK,
    tx: Transaction,
    params: SwapParams,
    sdk_options: SdkOptions,
    primary_coin_input_a: TransactionObjectArgument,
    primary_coin_input_b: TransactionObjectArgument
  ): { tx: Transaction; txRes: TransactionObjectArgument[] } {
    const { clmm_pool, integrate } = sdk_options

    const sqrtPriceLimit = SwapUtils.getDefaultSqrtPriceLimit(params.a2b)

    const { global_config_id } = getPackagerConfigs(clmm_pool)

    if (global_config_id === undefined) {
      handleMessageError(ConfigErrorCode.InvalidConfig, 'clmm.config.global_config_id is undefined')
    }

    const hasSwapPartner = params.swap_partner !== undefined

    const functionName = hasSwapPartner ? 'swap_with_partner' : 'swap'

    const moduleName = hasSwapPartner ? ClmmIntegrateRouterWithPartnerModule : ClmmIntegrateRouterModule

    const args = hasSwapPartner
      ? [
        tx.object(global_config_id),
        tx.object(params.pool_id),
        tx.object(params.swap_partner!),
        primary_coin_input_a,
        primary_coin_input_b,
        tx.pure.bool(params.a2b),
        tx.pure.bool(params.by_amount_in),
        tx.pure.u64(params.amount),
        tx.pure.u128(sqrtPriceLimit.toString()),
        tx.pure.bool(false), // use coin value always set false.
        tx.object(CLOCK_ADDRESS),
      ]
      : [
        tx.object(global_config_id),
        tx.object(params.pool_id),
        primary_coin_input_a,
        primary_coin_input_b,
        tx.pure.bool(params.a2b),
        tx.pure.bool(params.by_amount_in),
        tx.pure.u64(params.amount),
        tx.pure.u128(sqrtPriceLimit.toString()),
        tx.pure.bool(false), // use coin value always set false.
        tx.object(CLOCK_ADDRESS),
      ]

    const typeArguments = [params.coin_type_a, params.coin_type_b]
    const coinABs: TransactionObjectArgument[] = tx.moveCall({
      target: `${integrate.published_at}::${moduleName}::${functionName}`,
      typeArguments,
      arguments: args,
    })

    if (params.by_amount_in) {
      const toCoinType = params.a2b ? params.coin_type_b : params.coin_type_a
      const toCoin = params.a2b ? coinABs[1] : coinABs[0]
      const totalAmount = Number(params.amount_limit)
      PositionUtils.checkCoinThreshold(sdk, params.by_amount_in, tx, toCoin, totalAmount, toCoinType)
    }

    return { tx, txRes: coinABs }
  }
}

/**
 * Get lower sqrt price from token A.
 *
 * @param amount - The amount of tokens the user wanted to swap from.
 * @param liquidity - The liquidity of the pool.
 * @param sqrt_price_x64 - The sqrt price of the pool.
 * @returns LowerSqrtPriceX64
 */
export function getLowerSqrtPriceFromCoinA(amount: BN, liquidity: BN, sqrt_price_x64: BN): BN {
  const numerator = liquidity.mul(sqrt_price_x64).shln(64)
  const denominator = liquidity.shln(64).add(amount.mul(sqrt_price_x64))

  // always round up
  return MathUtil.divRoundUp(numerator, denominator)
}

/**
 * Get upper sqrt price from token A.
 *
 * @param amount - The amount of tokens the user wanted to swap from.
 * @param liquidity - The liquidity of the pool.
 * @param sqrt_price_x64 - The sqrt price of the pool.
 * @returns LowerSqrtPriceX64
 */
export function getUpperSqrtPriceFromCoinA(amount: BN, liquidity: BN, sqrt_price_x64: BN): BN {
  const numerator = liquidity.mul(sqrt_price_x64).shln(64)
  const denominator = liquidity.shln(64).sub(amount.mul(sqrt_price_x64))

  // always round up
  return MathUtil.divRoundUp(numerator, denominator)
}

/**
 * Get lower sqrt price from coin B.
 *
 * @param amount - The amount of coins the user wanted to swap from.
 * @param liquidity - The liquidity of the pool.
 * @param sqrt_price_x64 - The sqrt price of the pool.
 * @returns LowerSqrtPriceX64
 */
export function getLowerSqrtPriceFromCoinB(amount: BN, liquidity: BN, sqrt_price_x64: BN): BN {
  // always round down(rounding up a negative number)
  return sqrt_price_x64.sub(MathUtil.divRoundUp(amount.shln(64), liquidity))
}

/**
 * Get upper sqrt price from coin B.
 *
 * @param amount - The amount of coins the user wanted to swap from.
 * @param liquidity - The liquidity of the pool.
 * @param sqrtPriceX64 - The sqrt price of the pool.
 * @returns LowerSqrtPriceX64
 */
export function getUpperSqrtPriceFromCoinB(amount: BN, liquidity: BN, sqrt_price_x64: BN): BN {
  // always round down (rounding up a negative number)
  return sqrt_price_x64.add(amount.shln(64).div(liquidity))
}
