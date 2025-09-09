import type { TransactionObjectArgument } from '@mysten/sui/transactions'
import { Transaction } from '@mysten/sui/transactions'
import BN from 'bn.js'
import {
  asUintN,
  BuildCoinResult,
  ClmmPoolUtil,
  CLOCK_ADDRESS,
  CoinAsset,
  CoinAssist,
  CoinPairType,
  getPackagerConfigs,
  normalizeCoinType,
} from '@cetusprotocol/common-sdk'
import Decimal from 'decimal.js'
import { handleMessageError, UtilsErrorCode } from '../errors/errors'
import SDK, { AddLiquidityFixTokenParams, CollectRewarderParams } from '../index'
import { ClmmIntegratePoolV2Module, ClmmIntegrateRouterModule } from '../types/sui'

export type AdjustResult = {
  is_adjust_coin_a: boolean
  is_adjust_coin_b: boolean
}

/**
 * Adjust coinpair is sui
 * @param {CoinPairType} coinPair
 * @returns
 */
export function findAdjustCoin(coinPair: CoinPairType): AdjustResult {
  const is_adjust_coin_a = CoinAssist.isSuiCoin(coinPair.coin_type_a)
  const is_adjust_coin_b = CoinAssist.isSuiCoin(coinPair.coin_type_b)
  return { is_adjust_coin_a, is_adjust_coin_b }
}

/**
 *
 * @param {number} slippageAmount
 * @param slippage
 * @returns
 */
function raverSlippageAmount(slippageAmount: number | string, slippage: number): string {
  return Decimal.ceil(Decimal(slippageAmount).div(1 + slippage)).toString()
}

export class PositionUtils {
  static createCollectRewarderAndFeeParams(
    sdk: SDK,
    tx: Transaction,
    params: CollectRewarderParams,
    all_coin_asset: CoinAsset[],
    all_coin_asset_a?: CoinAsset[],
    all_coin_asset_b?: CoinAsset[]
  ) {
    if (all_coin_asset_a === undefined) {
      all_coin_asset_a = [...all_coin_asset]
    }
    if (all_coin_asset_b === undefined) {
      all_coin_asset_b = [...all_coin_asset]
    }
    const coin_type_a = normalizeCoinType(params.coin_type_a)
    const coin_type_b = normalizeCoinType(params.coin_type_b)
    if (params.collect_fee) {
      const primary_coin_a_input = CoinAssist.buildCoinForAmount(tx, all_coin_asset_a, BigInt(0), coin_type_a, false)
      all_coin_asset_a = primary_coin_a_input.remain_coins

      const primary_coin_b_input = CoinAssist.buildCoinForAmount(tx, all_coin_asset_b, BigInt(0), coin_type_b, false)
      all_coin_asset_b = primary_coin_b_input.remain_coins

      tx = sdk.Position.createCollectFeePayload(
        {
          pool_id: params.pool_id,
          pos_id: params.pos_id,
          coin_type_a: params.coin_type_a,
          coin_type_b: params.coin_type_b,
        },
        tx,
        primary_coin_a_input.target_coin,
        primary_coin_b_input.target_coin
      )
    }
    const primary_coin_inputs: TransactionObjectArgument[] = []
    params.rewarder_coin_types.forEach((type) => {
      switch (normalizeCoinType(type)) {
        case coin_type_a:
          primary_coin_inputs.push(CoinAssist.buildCoinForAmount(tx, all_coin_asset_a!, BigInt(0), type, false).target_coin)
          break
        case coin_type_b:
          primary_coin_inputs.push(CoinAssist.buildCoinForAmount(tx, all_coin_asset_b!, BigInt(0), type, false).target_coin)
          break
        default:
          primary_coin_inputs.push(CoinAssist.buildCoinForAmount(tx, all_coin_asset, BigInt(0), type, false).target_coin)
          break
      }
    })
    tx = sdk.Rewarder.createCollectRewarderPayload(params, tx, primary_coin_inputs)
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
    sdk: SDK,
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
    const estimate_gas = await sdk.FullClient.calculationTxGas(Transaction.from(tx))

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

  // -----------------------------------------liquidity-----------------------------------------------//
  /**
   * build add liquidity transaction
   * @param params
   * @param slippage
   * @param curSqrtPrice
   * @returns
   */
  static async buildAddLiquidityFixTokenForGas(
    sdk: SDK,
    all_coins: CoinAsset[],
    params: AddLiquidityFixTokenParams,
    gas_estimate_arg: {
      slippage: number
      cur_sqrt_price: BN
    },
    tx?: Transaction,
    input_coin_a?: TransactionObjectArgument,
    input_coin_b?: TransactionObjectArgument
  ): Promise<Transaction> {
    tx = await this.buildAddLiquidityFixToken(sdk, all_coins, params, tx, input_coin_a, input_coin_b)

    const { is_adjust_coin_a } = findAdjustCoin(params)

    const sui_amount = is_adjust_coin_a ? params.amount_a : params.amount_b

    const newResult = await this.adjustTransactionForGas(
      sdk,
      CoinAssist.getCoinAssets(is_adjust_coin_a ? params.coin_type_a : params.coin_type_b, all_coins),
      BigInt(sui_amount),
      tx
    )

    const { fixAmount } = newResult
    let newTx = newResult.newTx

    if (newTx != null) {
      let primaryCoinAInputs: BuildCoinResult
      let primaryCoinBInputs: BuildCoinResult

      if (is_adjust_coin_a) {
        params.amount_a = Number(fixAmount)
        primaryCoinAInputs = this.buildAddLiquidityFixTokenCoinInput(
          newTx,
          !params.fix_amount_a,
          fixAmount.toString(),
          params.slippage,
          params.coin_type_a,
          all_coins,
          false,
          true
        )
        primaryCoinBInputs = this.buildAddLiquidityFixTokenCoinInput(
          newTx,
          params.fix_amount_a,
          params.amount_b,
          params.slippage,
          params.coin_type_b,
          all_coins,
          false,
          true
        )
      } else {
        params.amount_b = Number(fixAmount)
        primaryCoinAInputs = this.buildAddLiquidityFixTokenCoinInput(
          newTx,
          !params.fix_amount_a,
          params.amount_a,
          params.slippage,
          params.coin_type_a,
          all_coins,
          false,
          true
        )
        primaryCoinBInputs = this.buildAddLiquidityFixTokenCoinInput(
          newTx,
          params.fix_amount_a,
          fixAmount.toString(),
          params.slippage,
          params.coin_type_b,
          all_coins,
          false,
          true
        )
        params = this.fixAddLiquidityFixTokenParams(params, gas_estimate_arg.slippage, gas_estimate_arg.cur_sqrt_price)

        return this.buildAddLiquidityFixTokenArgs(newTx, sdk, all_coins, params, primaryCoinAInputs, primaryCoinBInputs)
      }
    }
    return tx
  }

  /**
   * build add liquidity transaction
   * @param params
   * @param packageId
   * @returns
   */
  static async buildAddLiquidityFixToken(
    sdk: SDK,
    all_coins: CoinAsset[],
    params: AddLiquidityFixTokenParams,
    tx?: Transaction,
    input_coin_a?: TransactionObjectArgument,
    input_coin_b?: TransactionObjectArgument
  ): Promise<Transaction> {
    tx = tx || new Transaction()

    let primaryCoinAInputs: BuildCoinResult
    let primaryCoinBInputs: BuildCoinResult
    if (input_coin_a == null || input_coin_b == null) {
      primaryCoinAInputs = this.buildAddLiquidityFixTokenCoinInput(
        tx,
        !params.fix_amount_a,
        params.amount_a,
        params.slippage,
        params.coin_type_a,
        all_coins,
        false,
        true
      )
      primaryCoinBInputs = this.buildAddLiquidityFixTokenCoinInput(
        tx,
        params.fix_amount_a,
        params.amount_b,
        params.slippage,
        params.coin_type_b,
        all_coins,
        false,
        true
      )
    } else {
      primaryCoinAInputs = {
        target_coin: input_coin_a,
        remain_coins: [],
        is_mint_zero_coin: false,
        target_coin_amount: '0',
        selected_coins: [],
      }
      primaryCoinBInputs = {
        target_coin: input_coin_b,
        remain_coins: [],
        is_mint_zero_coin: false,
        target_coin_amount: '0',
        selected_coins: [],
      }
    }

    tx = this.buildAddLiquidityFixTokenArgs(
      tx,
      sdk,
      all_coins,
      params as AddLiquidityFixTokenParams,
      primaryCoinAInputs,
      primaryCoinBInputs
    )
    return tx
  }

  public static buildAddLiquidityFixTokenCoinInput(
    tx: Transaction,
    need_interval_amount: boolean,
    amount: number | string,
    slippage: number,
    coin_type: string,
    all_coins: CoinAsset[],
    build_vector = true,
    fix_amount = true
  ): BuildCoinResult {
    return need_interval_amount
      ? CoinAssist.buildCoinForAmountInterval(
          tx,
          all_coins,
          { amount_second: BigInt(raverSlippageAmount(amount, slippage)), amount_first: BigInt(amount) },
          coin_type,
          build_vector,
          fix_amount
        )
      : CoinAssist.buildCoinForAmount(tx, all_coins, BigInt(amount), coin_type, build_vector, fix_amount)
  }

  /**
   * fix add liquidity fix token for coin amount
   * @param params
   * @param slippage
   * @param curSqrtPrice
   * @returns
   */
  static fixAddLiquidityFixTokenParams(params: AddLiquidityFixTokenParams, slippage: number, curSqrtPrice: BN): AddLiquidityFixTokenParams {
    const coinAmount = params.fix_amount_a ? params.amount_a : params.amount_b
    const liquidityInput = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
      Number(params.tick_lower),
      Number(params.tick_upper),
      new BN(coinAmount),
      params.fix_amount_a,
      true,
      slippage,
      curSqrtPrice
    )

    params.amount_a = params.fix_amount_a ? params.amount_a : liquidityInput.coin_amount_limit_a
    params.amount_b = params.fix_amount_a ? liquidityInput.coin_amount_limit_b : params.amount_b

    return params
  }

  private static buildAddLiquidityFixTokenArgs(
    tx: Transaction,
    sdk: SDK,
    all_coins: CoinAsset[],
    params: AddLiquidityFixTokenParams,
    primary_coina_inputs: BuildCoinResult,
    primary_coinb_inputs: BuildCoinResult
  ) {
    const typeArguments = [params.coin_type_a, params.coin_type_b]
    const functionName = params.is_open ? 'open_position_with_liquidity_by_fix_coin' : 'add_liquidity_by_fix_coin'
    const { clmm_pool, integrate } = sdk.sdkOptions

    if (!params.is_open) {
      tx = this.createCollectRewarderAndFeeParams(
        sdk,
        tx,
        params,
        all_coins,
        primary_coina_inputs.remain_coins,
        primary_coinb_inputs.remain_coins
      )
    }

    const clmmConfig = getPackagerConfigs(clmm_pool)
    const args = params.is_open
      ? [
          tx.object(clmmConfig.global_config_id),
          tx.object(params.pool_id),
          tx.pure.u32(Number(asUintN(BigInt(params.tick_lower)).toString())),
          tx.pure.u32(Number(asUintN(BigInt(params.tick_upper)).toString())),
          primary_coina_inputs.target_coin,
          primary_coinb_inputs.target_coin,
          tx.pure.u64(params.amount_a),
          tx.pure.u64(params.amount_b),
          tx.pure.bool(params.fix_amount_a),
          tx.object(CLOCK_ADDRESS),
        ]
      : [
          tx.object(clmmConfig.global_config_id),
          tx.object(params.pool_id),
          tx.object(params.pos_id),
          primary_coina_inputs.target_coin,
          primary_coinb_inputs.target_coin,
          tx.pure.u64(params.amount_a),
          tx.pure.u64(params.amount_b),
          tx.pure.bool(params.fix_amount_a),
          tx.object(CLOCK_ADDRESS),
        ]

    tx.moveCall({
      target: `${integrate.published_at}::${ClmmIntegratePoolV2Module}::${functionName}`,
      typeArguments,
      arguments: args,
    })
    return tx
  }

  static checkCoinThreshold(
    sdk: SDK,
    by_amount_in: boolean,
    tx: Transaction,
    coin: TransactionObjectArgument,
    amount_limit: number,
    coin_type: string
  ) {
    if (by_amount_in) {
      tx.moveCall({
        target: `${sdk.sdkOptions.integrate.published_at}::${ClmmIntegrateRouterModule}::check_coin_threshold`,
        typeArguments: [coin_type],
        arguments: [coin, tx.pure.u64(amount_limit)],
      })
    }
  }
}
