import { ClmmPoolUtil, CoinAssist, IModule, TickMath, d, fixCoinType } from '@cetusprotocol/common-sdk'
import { CetusVaultsSDK } from '../sdk'
import {
  CalculateMigrateWithdrawOptions,
  CalculateMigrateWithdrawResult,
  MigrateWithdrawOptions,
  RebalanceSwapResult,
  SwapCoinOptions,
  SwapCoinResult,
  SwapResult,
} from '../types/migrate'
import BN from 'bn.js'
import { calcExactSwapAmount } from '../utils/vaults'
import { InputType } from '../types/vaults'
import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions'
import { BuildCoinResult, BuildRouterSwapParamsV3 } from '@cetusprotocol/aggregator-sdk'
import Decimal from 'decimal.js'
/**
 * Helper class to help interact with  Migrate interface.
 */
export class MigrateModule implements IModule<CetusVaultsSDK> {
  protected _sdk: CetusVaultsSDK

  constructor(sdk: CetusVaultsSDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  /**
   * Build the migrate withdraw transaction
   * @param options MigrateWithdrawOptions
   * @param tx Transaction
   * @returns TransactionObjectArgument | undefined
   * @description
   * 1. Withdraw from the from vault
   * 2. Swap assets
   * 3. Calculate the swap amount needed for rebalancing
   * 4. Calculate the amount of the to vault
   * 5. Return the result
   */
  async buildMigrateWithdrawTx(options: MigrateWithdrawOptions, tx: Transaction): Promise<TransactionObjectArgument | undefined> {
    const { withdraw_result, return_ft_coin } = options
    const {
      fix_amount_a,
      deposit_amount_a,
      deposit_amount_b,
      from_vault_id,
      to_vault_id,
      burn_ft_amount,
      liquidity_slippage,
      from_swap_result,
      rebalance_swap_result,
    } = withdraw_result

    const { vault: fromVault, pool: fromPool } = await this.sdk.Vaults.getVaultAndPool(from_vault_id)
    const { vault: toVault, pool: toPool } = await this.sdk.Vaults.getVaultAndPool(to_vault_id)

    const { coin_type_a: fromCoinTypeA, coin_type_b: fromCoinTypeB } = fromPool
    const { coin_type_a: toCoinTypeA, coin_type_b: toCoinTypeB } = toPool

    // Step 1: Withdraw from the from vault
    const { return_coin_a, return_coin_b } = await this.sdk.Vaults.withdraw(
      {
        vault_id: from_vault_id,
        ft_amount: burn_ft_amount,
        slippage: liquidity_slippage,
        return_coin: true,
      },
      tx
    )
    const withdrawCoinMap = {
      [fixCoinType(fromCoinTypeA, false)]: return_coin_a,
      [fixCoinType(fromCoinTypeB, false)]: return_coin_b,
    }

    // Step 2: Swap assets
    const { coin_output_a, coin_output_b } = from_swap_result
    const { from_coin_type, from_coin_amount, route_obj, to_coin_type } = coin_output_a
    if (route_obj) {
      const { to_coin } = await this.buildSwapAssetsTx({
        from_coin_type,
        swap_in_amount: from_coin_amount,
        liquidity_slippage,
        route_obj: route_obj.route_obj,
        tx,
        from_coin_object_id: withdrawCoinMap[fixCoinType(from_coin_type, false)],
      })
      withdrawCoinMap[fixCoinType(to_coin_type, false)] = to_coin
    }

    if (coin_output_b.route_obj) {
      const { from_coin_type, from_coin_amount, route_obj, to_coin_type } = coin_output_b
      const { to_coin } = await this.buildSwapAssetsTx({
        from_coin_type,
        swap_in_amount: from_coin_amount,
        liquidity_slippage,
        route_obj: route_obj.route_obj,
        tx,
        from_coin_object_id: withdrawCoinMap[fixCoinType(from_coin_type, false)],
      })
      withdrawCoinMap[fixCoinType(to_coin_type, false)] = to_coin
    }
    const deposit_coin_a = withdrawCoinMap[fixCoinType(toCoinTypeA, false)]!
    const deposit_coin_b = withdrawCoinMap[fixCoinType(toCoinTypeB, false)]!

    // Step 3: Calculate the swap amount needed for rebalancing
    if (rebalance_swap_result?.route_obj) {
      const { swap_direction, swap_in_amount, route_obj } = rebalance_swap_result.route_obj
      const from_coin_type = swap_direction === 'A_TO_B' ? toCoinTypeA : toCoinTypeB
      let from_coin_object_id = tx.splitCoins(swap_direction === 'A_TO_B' ? deposit_coin_a : deposit_coin_b, [tx.pure.u64(swap_in_amount)])
      const { to_coin } = await this.buildSwapAssetsTx({
        from_coin_type,
        swap_in_amount,
        liquidity_slippage,
        route_obj,
        tx,
        from_coin_object_id,
      })
      tx.mergeCoins(swap_direction === 'A_TO_B' ? deposit_coin_b : deposit_coin_a, [to_coin])
    }

    // step 4: calculate the amount of the to vault
    const amount_a_limit = '18446744073709551615'
    const amount_b_limit = '18446744073709551615'

    const min_deposit_amount_a = d(deposit_amount_a).mul(d(1).sub(0.001)).toFixed(0, Decimal.ROUND_DOWN).toString()
    const min_deposit_amount_b = d(deposit_amount_b).mul(d(1).sub(0.001)).toFixed(0, Decimal.ROUND_DOWN).toString()

    const lpCoin = await this._sdk.Vaults.depositInternal(
      {
        vault_id: to_vault_id,
        coin_type_a: toCoinTypeA,
        coin_type_b: toCoinTypeB,
        lp_token_type: toVault.lp_token_type,
        farming_pool: toVault.position.pool_id,
        primary_coin_a_inputs: deposit_coin_a,
        primary_coin_b_inputs: deposit_coin_b,
        clmm_pool: toPool.id,
        amount_a: fix_amount_a ? min_deposit_amount_a : amount_a_limit,
        amount_b: fix_amount_a ? amount_b_limit : min_deposit_amount_b,
        slippage: liquidity_slippage,
        fix_amount_a,
        return_lp_token: return_ft_coin,
      },
      tx
    )
    return lpCoin
  }

  /**
   * Calculate the migrate withdraw amount
   * @param options CalculateMigrateWithdrawOptions
   * @returns CalculateMigrateWithdrawResult
   * @description
   * 1. Extract liquidity from the from vault
   * 2. Swap assets
   * 3. Calculate the swap amount needed for rebalancing
   * 4. Calculate the amount of the to vault
   * 5. Return the result
   */
  async calculateMigrateWithdraw(options: CalculateMigrateWithdrawOptions): Promise<CalculateMigrateWithdrawResult> {
    const { from_vault_id, to_vault_id, burn_ft_amount, liquidity_slippage } = options
    const { vault: fromVault, pool: fromPool } = await this.sdk.Vaults.getVaultAndPool(from_vault_id)
    const { vault: toVault, pool: toPool } = await this.sdk.Vaults.getVaultAndPool(to_vault_id)

    // Step 1: Extract liquidity from the from vault
    const fromLiquidityAmount = await this.sdk.Vaults.estLiquidityAmountFromFtAmount({
      vault_id: from_vault_id,
      input_ft_amount: burn_ft_amount,
      slippage: liquidity_slippage,
    })

    // Step 2: Swap assets
    const { coin_type_a: fromCoinTypeA, coin_type_b: fromCoinTypeB } = fromPool
    const { coin_type_a: toCoinTypeA, coin_type_b: toCoinTypeB } = toPool
    const matchSwapResult = await this.matchSwapCoins({
      from: {
        coin_type_a: fromCoinTypeA,
        coin_amount_a: fromLiquidityAmount.amount_a,
        coin_type_b: fromCoinTypeB,
        coin_amount_b: fromLiquidityAmount.amount_b,
      },
      to: {
        coin_type_a: toCoinTypeA,
        coin_type_b: toCoinTypeB,
      },
    })
    const { coin_output_a, coin_output_b } = matchSwapResult

    // Step 3: Calculate the swap amount needed for rebalancing
    const rebalanceSwapResult = await this.calculateRebalanceSwapAmount({
      toPool,
      toVault,
      coin_amount_a: coin_output_a.to_coin_amount,
      coin_amount_b: coin_output_b.to_coin_amount,
      coin_type_a: coin_output_a.to_coin_type,
      coin_type_b: coin_output_b.to_coin_type,
    })

    // step 4: calculate the amount of the to vault
    const { deposit_amount_a, deposit_amount_b, obtained_ft_amount, fix_amount_a } = await this.calculateToVaultAmount({
      to_vault_id,
      final_amount_a: rebalanceSwapResult.final_amount_a,
      final_amount_b: rebalanceSwapResult.final_amount_b,
      liquidity_slippage,
    })

    const result: CalculateMigrateWithdrawResult = {
      from_vault_id,
      to_vault_id,
      burn_ft_amount,
      liquidity_slippage,
      deposit_amount_a,
      deposit_amount_b,
      fix_amount_a,
      obtained_ft_amount,
      from_swap_result: matchSwapResult,
      rebalance_swap_result: rebalanceSwapResult,
    }

    return result
  }

  /**
   * Calculate the swap amount needed for rebalancing
   * @param options Parameters containing target pool, target vault and coin information
   * @returns Returns swap amount, final coin A and B amounts
   */
  private async calculateRebalanceSwapAmount(options: {
    toPool: { current_sqrt_price: number }
    toVault: { position: { tick_lower_index: number; tick_upper_index: number } }
    coin_amount_a: string
    coin_amount_b: string
    coin_type_a: string
    coin_type_b: string
  }): Promise<RebalanceSwapResult> {
    const { toPool, toVault, coin_amount_a, coin_amount_b, coin_type_a, coin_type_b } = options
    const { current_sqrt_price } = toPool
    let swap_price
    try {
      const swapCoinResult = await this._sdk.Vaults.findRouters('', '', coin_type_a, coin_type_b, d(coin_amount_a), true, [])
      if (swapCoinResult) {
        swap_price = d(swapCoinResult?.amount_out).div(swapCoinResult?.amount_in).toString()
      }
    } catch (error) {}
    if (!swap_price) {
      swap_price = TickMath.priceToSqrtPriceX64(d(current_sqrt_price.toString()), 6, 6).toString()
    }
    const { tick_lower_index, tick_upper_index } = toVault.position
    const liquidity_info = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
      tick_lower_index,
      tick_upper_index,
      new BN(coin_amount_a),
      true,
      false,
      1,
      new BN(current_sqrt_price)
    )

    const target_rate = d(liquidity_info.coin_amount_b).div(liquidity_info.coin_amount_a)

    const { swap_amount, final_amount_a, final_amount_b, swap_direction } = calcExactSwapAmount(
      coin_amount_a,
      coin_amount_b,
      swap_price,
      target_rate.toString()
    )

    if (d(swap_amount).gt(0)) {
      const swap_coin_type_in = swap_direction === 'A_TO_B' ? coin_type_a : coin_type_b
      const swap_coin_type_out = swap_direction === 'A_TO_B' ? coin_type_b : coin_type_a
      const swapCoinResult = await this._sdk.Vaults.findRouters('', '', swap_coin_type_in, swap_coin_type_out, d(swap_amount), true, [])
      if (!swapCoinResult) {
        throw Error('Aggregator no router')
      }
      return {
        final_amount_a,
        final_amount_b,
        route_obj: {
          swap_direction: swap_direction as 'A_TO_B' | 'B_TO_A',
          swap_in_amount: swapCoinResult.amount_in,
          swap_out_amount: swapCoinResult.amount_out,
          route_obj: swapCoinResult.route_obj,
        },
      }
    }
    return {
      final_amount_a,
      final_amount_b,
    }
  }

  private async buildSwapAssetsTx(options: {
    from_coin_type: string
    swap_in_amount: string
    liquidity_slippage: number
    route_obj: any
    tx: Transaction
    from_coin_object_id?: TransactionObjectArgument
  }): Promise<{
    to_coin: TransactionObjectArgument
  }> {
    const { from_coin_type, liquidity_slippage, tx, from_coin_object_id, swap_in_amount, route_obj } = options
    const inputCoin = from_coin_object_id || CoinAssist.buildCoinWithBalance(BigInt(swap_in_amount), from_coin_type, tx)

    const routerParams: BuildRouterSwapParamsV3 = {
      router: route_obj,
      inputCoin,
      slippage: liquidity_slippage,
      txb: tx,
    }
    const to_coin = await this._sdk.AggregatorClient.fixableRouterSwapV3(routerParams)
    return {
      to_coin,
    }
  }

  /**
   * Calculate the deposit amounts for the target vault
   * @param options Parameters containing target vault id, final amounts and slippage
   * @returns Returns deposit amounts for coin A and B, and obtained FT amount
   */
  private async calculateToVaultAmount(options: {
    to_vault_id: string
    final_amount_a: string
    final_amount_b: string
    liquidity_slippage: number
  }): Promise<{
    deposit_amount_a: string
    deposit_amount_b: string
    obtained_ft_amount: string
    fix_amount_a: boolean
  }> {
    const { to_vault_id, final_amount_a, final_amount_b, liquidity_slippage } = options
    let input_amount = final_amount_a
    let fix_amount_a = true
    let deposit_amount_b = final_amount_b
    let deposit_amount_a = final_amount_a
    let obtained_ft_amount = '0'

    let countFlag = 0
    while (countFlag < 2) {
      const { amount_a, amount_b, ft_amount } = await this._sdk.Vaults.calculateAmountFromBoth(
        {
          vault_id: to_vault_id,
          input_amount,
          slippage: liquidity_slippage,
          fix_amount_a,
          side: InputType.Both,
        },
        false
      )

      if (fix_amount_a) {
        if (d(amount_b).lt(final_amount_b)) {
          deposit_amount_b = amount_b
          obtained_ft_amount = ft_amount
          break
        } else {
          fix_amount_a = false
          input_amount = final_amount_b
        }
      } else {
        deposit_amount_a = amount_a
        obtained_ft_amount = ft_amount
      }
      countFlag++
    }

    return {
      deposit_amount_a,
      deposit_amount_b,
      obtained_ft_amount,
      fix_amount_a,
    }
  }

  /**
   * Matching algorithm: Match liquidity extracted from the from pool to the coin types of the to pool
   *
   * Matching process:
   * 1. Determine which from coin should match toCoinTypeA and which should match toCoinTypeB
   *    - Prioritize matching coins of the same type (to minimize swaps)
   *    - coinOutputA always represents toCoinTypeA, coinOutputB always represents toCoinTypeB
   *    - from_coin_type can be adjusted based on which from coin matches the corresponding to coin type
   * 2. For coins that don't match, find swap route and calculate the amount after swap
   * 3. Return matching result, including swap route and final coin amounts
   *
   * @param options SwapCoinOptions - Contains coin types and amounts from the from pool, and coin types from the to pool
   * @returns SwapCoinResult - Matching result, including swap route and final coin amounts
   */
  async matchSwapCoins(options: SwapCoinOptions): Promise<SwapCoinResult> {
    const { from, to } = options
    const fromCoinTypeA = fixCoinType(from.coin_type_a, false)
    const fromCoinTypeB = fixCoinType(from.coin_type_b, false)
    const toCoinTypeA = fixCoinType(to.coin_type_a, false)
    const toCoinTypeB = fixCoinType(to.coin_type_b, false)

    // Step 1: Determine matching relationship: which from coin should match toCoinTypeA, which should match toCoinTypeB
    // Prioritize matching coins of the same type to minimize swaps
    const fromAMatchesToA = fromCoinTypeA === toCoinTypeA
    const fromAMatchesToB = fromCoinTypeA === toCoinTypeB
    const fromBMatchesToA = fromCoinTypeB === toCoinTypeA
    const fromBMatchesToB = fromCoinTypeB === toCoinTypeB

    // Determine which from coin matches toCoinTypeA and which matches toCoinTypeB
    let fromCoinForToA: 'A' | 'B' // From coin used to match toCoinTypeA
    let fromCoinForToB: 'A' | 'B' // From coin used to match toCoinTypeB

    // Prioritize perfect match or cross match
    if (fromAMatchesToA && fromBMatchesToB) {
      // Perfect match: from A -> to A, from B -> to B
      fromCoinForToA = 'A'
      fromCoinForToB = 'B'
    } else if (fromAMatchesToB && fromBMatchesToA) {
      // Cross match: from A -> to B, from B -> to A
      fromCoinForToA = 'B'
      fromCoinForToB = 'A'
    } else if (fromAMatchesToA) {
      // from A matches to A, from B needs to match to B (even if not matching, need to swap to to B)
      fromCoinForToA = 'A'
      fromCoinForToB = 'B'
    } else if (fromAMatchesToB) {
      // from A matches to B, from B needs to match to A
      fromCoinForToA = 'B'
      fromCoinForToB = 'A'
    } else if (fromBMatchesToA) {
      // from B matches to A, from A needs to match to B
      fromCoinForToA = 'B'
      fromCoinForToB = 'A'
    } else if (fromBMatchesToB) {
      // from B matches to B, from A needs to match to A
      fromCoinForToA = 'A'
      fromCoinForToB = 'B'
    } else {
      // None match, need to swap all
      // Default allocation: from A -> to A, from B -> to B
      fromCoinForToA = 'A'
      fromCoinForToB = 'B'
    }

    // Step 2: Initialize output structure
    // coinOutputA always represents toCoinTypeA, from_coin_type comes from the from coin that matches toCoinTypeA
    const coinOutputA: SwapCoinResult['coin_output_a'] = {
      from_coin_type: fromCoinForToA === 'A' ? fromCoinTypeA : fromCoinTypeB,
      from_coin_amount: fromCoinForToA === 'A' ? from.coin_amount_a : from.coin_amount_b,
      to_coin_type: toCoinTypeA, // Always toCoinTypeA
      to_coin_amount: '0',
    }

    // coinOutputB always represents toCoinTypeB, from_coin_type comes from the from coin that matches toCoinTypeB
    const coinOutputB: SwapCoinResult['coin_output_b'] = {
      from_coin_type: fromCoinForToB === 'A' ? fromCoinTypeA : fromCoinTypeB,
      from_coin_amount: fromCoinForToB === 'A' ? from.coin_amount_a : from.coin_amount_b,
      to_coin_type: toCoinTypeB, // Always toCoinTypeB
      to_coin_amount: '0',
    }

    // Step 3: For coins that need swap, find swap route and calculate the amount after swap
    // Case where coin_output_a needs swap
    if (coinOutputA.from_coin_type !== coinOutputA.to_coin_type && d(coinOutputA.from_coin_amount).gt(0)) {
      try {
        const routerResult = await this.sdk.Vaults.findRouters(
          '',
          '',
          coinOutputA.from_coin_type,
          coinOutputA.to_coin_type,
          d(coinOutputA.from_coin_amount),
          true, // by_amount_in,
          []
        )

        if (routerResult) {
          coinOutputA.to_coin_amount = routerResult.amount_out
          coinOutputA.route_obj = {
            swap_in_amount: routerResult.amount_in,
            swap_out_amount: routerResult.amount_out,
            route_obj: routerResult.route_obj,
          }
        } else {
          throw Error('Aggregator no router')
        }
      } catch (error) {
        throw error
      }
    } else {
      // No swap needed, use original amount directly
      coinOutputA.to_coin_amount = coinOutputA.from_coin_amount
    }

    // Case where coin_output_b needs swap
    if (coinOutputB.from_coin_type !== coinOutputB.to_coin_type && d(coinOutputB.from_coin_amount).gt(0)) {
      try {
        const routerResult = await this.sdk.Vaults.findRouters(
          '',
          '',
          coinOutputB.from_coin_type,
          coinOutputB.to_coin_type,
          d(coinOutputB.from_coin_amount),
          true, // by_amount_in
          []
        )

        if (routerResult) {
          coinOutputB.to_coin_amount = routerResult.amount_out
          coinOutputB.route_obj = {
            swap_in_amount: routerResult.amount_in,
            swap_out_amount: routerResult.amount_out,
            route_obj: routerResult.route_obj,
          }
        } else {
          throw Error('Aggregator no router')
        }
      } catch (error) {
        throw error
      }
    } else {
      // No swap needed, use original amount directly
      coinOutputB.to_coin_amount = coinOutputB.from_coin_amount
    }

    return {
      coin_output_a: coinOutputA,
      coin_output_b: coinOutputB,
    }
  }
}
