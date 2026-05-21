import { describe, expect, test, vi, beforeEach } from 'vitest'
import { Transaction } from '@mysten/sui/transactions'
import { BinUtils, DlmmPool, DlmmPosition, parseLiquidityShares, StrategyType } from '@cetusprotocol/dlmm-sdk'
import { CompoundModule } from '../src/modules/compoundModule'
import { CetusDlmmZapSDK } from '../src/sdk'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import { d, printTransaction, toDecimalsAmount } from '@cetusprotocol/common-sdk'
import Decimal from 'decimal.js'
const poolId = '0x9bac4942e8d9aa699c8bd83d5bf7e8db97e25c29dd09bae63169472aab7b45b2'
const posId = '0xd5f3663ca0899eb3a6824cbeb8cc26cd0023df05cff1e1cb864c877b28ace7eb'


describe('Compound test', () => {
  const sdk = CetusDlmmZapSDK.createSDK({ env: 'mainnet' })
  let send_key_pair: Ed25519Keypair
  let pool: DlmmPool
  let position: DlmmPosition

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    sdk.setSenderAddress("****")
    pool = await sdk.DlmmSDK.Pool.getPool(poolId)
    console.log("🚀 ~ pool:", pool)
    position = await sdk.DlmmSDK.Position.getPosition(posId)
    console.log("🚀 ~ position:", position)

  })


  test('Mode: Rebalance', async () => {
    const active_bin = await sdk.DlmmSDK.Pool.getBinInfo(pool.bin_manager.bin_manager_handle, pool.active_id, pool.bin_step)

    const result = await sdk.Compound.calculateRebalance({
      pool_id: poolId,
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      coin_decimal_a: 6,
      coin_decimal_b: 9,
      amount_a: toDecimalsAmount(6, 6).toString(),
      amount_b: toDecimalsAmount(9, 9).toString(),
      lower_bin_id: pool.active_id - 10,
      upper_bin_id: pool.active_id + 12,
      active_id: pool.active_id,
      bin_step: pool.bin_step,
      active_bin_of_pool: active_bin,
      strategy_type: StrategyType.Spot,
      slippage: 0.01,
    })

    console.log("🚀 ~ result:", result)
  })

  test('createClaimMergePayload', async () => {

    const rewarder_types = pool.reward_manager.rewards.map((info) => info.reward_coin)
    const target_coin_type = "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS"
    const not_merge_coins = ['0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS']

    const result = await sdk.Compound.calculateClaimMerge({
      pool_id: poolId,
      position_id: posId,
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      rewarder_types,
      target_coin_type,
      not_merge_coins,
    })

    console.log("🚀 ~ result:", result)


    const tx = await sdk.Compound.createClaimMergePayload({
      pool_id: poolId,
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      target_coin_type,
      rewarder_coin_types: rewarder_types,
      not_merge_coins,
      merge_routers: result,
      slippage: 0.05,
      pos_id: posId,
    })
    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log("🚀 ~ res:", res)
  })


  test('createCompoundRebalanceAddPayload', async () => {
    const rewarder_types = pool.reward_manager.rewards.map((info) => info.reward_coin)
    const active_bin = await sdk.DlmmSDK.Pool.getBinInfo(pool.bin_manager.bin_manager_handle, pool.active_id, pool.bin_step)
    const feeAndRewardResult = await sdk.Compound.getFeeAndReward({
      pool_id: poolId,
      position_id: posId,
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      rewarder_types,
      merge_swap_target_coin_type: pool.coin_type_a,
      not_merge_coins: [pool.coin_type_b]
    })

    const baseParams = {
      pool_id: poolId,
      pos_id: posId,
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      rewarder_coin_types: rewarder_types,
      active_id: pool.active_id,
      bin_step: pool.bin_step,
      strategy_type: StrategyType.Spot,
      active_bin_of_pool: active_bin,
    }

    const rewarderMergeOption = {
      merge_routers: feeAndRewardResult?.merge_routers,
      slippage: 0.01,
      not_merge_coins: [pool.coin_type_b]
    }

    const rebalancePreParams = {
      pool_id: poolId,
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      coin_decimal_a: 6,
      coin_decimal_b: 9,
      amount_a: feeAndRewardResult.coin_amount_a,
      amount_b: feeAndRewardResult.coin_amount_b,
      lower_bin_id: position.lower_bin_id,
      upper_bin_id: position.upper_bin_id,
      active_id: pool.active_id,
      bin_step: pool.bin_step,
      active_bin_of_pool: active_bin,
      strategy_type: StrategyType.Spot,
      slippage: 0.01,
    }
    console.log("🚀 ~ rebalancePreParams:", rebalancePreParams)
    const rebalancePre = await sdk.Compound.calculateRebalance(rebalancePreParams)
    console.log("🚀 ~ rebalancePre:", rebalancePre)
    // return

    const tx = new Transaction()

    console.log('createCompoundRebalanceAddPayload params: ', { baseParams, rebalancePre, rewarderMergeOption, tx })
    await sdk.Compound.createCompoundRebalanceAddPayload({ baseParams, rebalancePre, rewarderMergeOption, tx })

    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log("🚀 ~ res:", res)
  })


  test('createMovePositionPayload: closes old position and add liquidity for new range', async () => {
    const module = new CompoundModule(sdk as any)
    const tx = new Transaction()
    const rewarder_types = pool.reward_manager.rewards.map((info) => info.reward_coin)
    const active_bin = await sdk.DlmmSDK.Pool.getBinInfo(pool.bin_manager.bin_manager_handle, pool.active_id, pool.bin_step)
    const liquidity_shares_data = parseLiquidityShares(position.liquidity_shares, pool.bin_step, position.lower_bin_id, active_bin)

    let rebalanceAmountA = '0'
    let rebalanceAmountB = '0'
    rebalanceAmountA = d(liquidity_shares_data.amount_a).mul(0.99).toFixed(0, Decimal.ROUND_DOWN)
    rebalanceAmountB = d(liquidity_shares_data.amount_b).mul(0.99).toFixed(0, Decimal.ROUND_DOWN)

    const have_claim = false
    let rewarderMergeOption
    if (!have_claim) {
      const feeAndRewardResult = await sdk.Compound.getFeeAndReward({
        pool_id: poolId,
        position_id: posId,
        coin_type_a: pool.coin_type_a,
        coin_type_b: pool.coin_type_b,
        rewarder_types,
        merge_swap_target_coin_type: pool.coin_type_a,
        not_merge_coins: [pool.coin_type_b]
      })
      console.log("🚀 ~ feeAndRewardResult:", feeAndRewardResult)

      if (feeAndRewardResult?.merge_routers && !feeAndRewardResult?.merge_routers?.error) {
        rewarderMergeOption = {
          merge_routers: feeAndRewardResult?.merge_routers,
          slippage: 0.01,
          not_merge_coins: []
        }
      } else {
        rewarderMergeOption = {
          merge_routers: undefined,
          slippage: 0.01,
          not_merge_coins: [...rewarder_types]
        }
      }

      rebalanceAmountA = d(rebalanceAmountA).add(feeAndRewardResult.coin_amount_a).toFixed(0, Decimal.ROUND_DOWN)
      rebalanceAmountB = d(rebalanceAmountB).add(feeAndRewardResult.coin_amount_b).toFixed(0, Decimal.ROUND_DOWN)
    }



    const rebalancePreParams = {
      pool_id: poolId,
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      coin_decimal_a: 6,
      coin_decimal_b: 9,
      amount_a: rebalanceAmountA,
      amount_b: rebalanceAmountB,
      lower_bin_id: pool.active_id - 10,
      upper_bin_id: pool.active_id + 10,
      active_id: pool.active_id,
      bin_step: pool.bin_step,
      active_bin_of_pool: active_bin,
      strategy_type: StrategyType.Spot,
      slippage: 0.01,
    }
    console.log("🚀 ~ rebalancePreParams:", rebalancePreParams)
    const rebalancePre = await sdk.Compound.calculateRebalance(rebalancePreParams)
    console.log("🚀 ~ rebalancePre:", rebalancePre)

    await module.createMovePositionPayload(
      {
        oldPos: {
          pool_id: poolId,
          pos_id: posId,
          coin_type_a: pool.coin_type_a,
          coin_type_b: pool.coin_type_b,
          rewarder_coin_types: rewarder_types,
          active_id: pool.active_id,
          bin_step: pool.bin_step,
          slippage: 0.01,
          bin_infos: liquidity_shares_data,
          remove_percent: 1,
          close_position: true,
        },
        newPos: {
          lower_bin_id: rebalancePreParams.lower_bin_id,
          upper_bin_id: rebalancePreParams.upper_bin_id,
          active_id: pool.active_id,
          bin_step: pool.bin_step,
          strategy_type: rebalancePreParams.strategy_type,
        },
        rebalancePre,
        slippage: 0.01,
        have_claim: true,
        rewarderMergeOption
      },
      tx
    )
    //   printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log("🚀 ~ res:", res)
  })
})

