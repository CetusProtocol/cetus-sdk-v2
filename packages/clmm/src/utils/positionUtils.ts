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



export class PositionUtils {
  static createCollectRewarderAndFeeParams(
    sdk: SDK,
    tx: Transaction,
    params: CollectRewarderParams,
  ) {

    if (params.collect_fee) {
      tx = sdk.Position.createCollectFeePayload(
        {
          pool_id: params.pool_id,
          pos_id: params.pos_id,
          coin_type_a: params.coin_type_a,
          coin_type_b: params.coin_type_b,
        },
        tx,
        CoinAssist.buildCoinWithBalance(BigInt(0), params.coin_type_a, tx),
        CoinAssist.buildCoinWithBalance(BigInt(0), params.coin_type_b, tx),
      )
    }
    const primary_coin_inputs: TransactionObjectArgument[] = []
    params.rewarder_coin_types.forEach((type) => {
      primary_coin_inputs.push(CoinAssist.buildCoinWithBalance(BigInt(0), type, tx))
    })
    tx = sdk.Rewarder.createCollectRewarderPayload(params, tx, primary_coin_inputs)
    return tx
  }



  // -----------------------------------------liquidity-----------------------------------------------//


  /**
   * build add liquidity transaction
   * @param params
   * @param packageId
   * @returns
   */
  static async buildAddLiquidityFixToken(
    sdk: SDK,
    params: AddLiquidityFixTokenParams,
    tx?: Transaction,
    input_coin_a?: TransactionObjectArgument,
    input_coin_b?: TransactionObjectArgument
  ): Promise<Transaction> {
    tx = tx || new Transaction()

    let primaryCoinAInputs: TransactionObjectArgument = input_coin_a || CoinAssist.buildCoinWithBalance(BigInt(params.amount_a), params.coin_type_a, tx)
    let primaryCoinBInputs: TransactionObjectArgument = input_coin_b || CoinAssist.buildCoinWithBalance(BigInt(params.amount_b), params.coin_type_b, tx)

    const typeArguments = [params.coin_type_a, params.coin_type_b]
    const functionName = params.is_open ? 'open_position_with_liquidity_by_fix_coin' : 'add_liquidity_by_fix_coin'
    const { clmm_pool, integrate } = sdk.sdkOptions

    if (!params.is_open) {
      tx = this.createCollectRewarderAndFeeParams(
        sdk,
        tx,
        params,
      )
    }

    const clmmConfig = getPackagerConfigs(clmm_pool)
    const args = params.is_open
      ? [
        tx.object(clmmConfig.global_config_id),
        tx.object(params.pool_id),
        tx.pure.u32(Number(asUintN(BigInt(params.tick_lower)).toString())),
        tx.pure.u32(Number(asUintN(BigInt(params.tick_upper)).toString())),
        primaryCoinAInputs,
        primaryCoinBInputs,
        tx.pure.u64(params.amount_a),
        tx.pure.u64(params.amount_b),
        tx.pure.bool(params.fix_amount_a),
        tx.object(CLOCK_ADDRESS),
      ]
      : [
        tx.object(clmmConfig.global_config_id),
        tx.object(params.pool_id),
        tx.object(params.pos_id),
        primaryCoinAInputs,
        primaryCoinBInputs,
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
