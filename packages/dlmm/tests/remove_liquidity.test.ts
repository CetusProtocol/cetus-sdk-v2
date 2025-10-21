// buildTestAccount
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import { CetusDlmmSDK } from '../src/sdk'
import {
  CalculateRemoveLiquidityBothOption,
  CalculateRemoveLiquidityOnlyOption,
  ClosePositionOption,
  DlmmPool,
  RemoveLiquidityOption,
} from '../src/types/dlmm'
import { printTransaction } from '@cetusprotocol/common-sdk'
import { parseLiquidityShares } from '../src/utils/parseData'

const pool_id = '0x0bec57bb33a99d0a999a3257c047c8ab35e611acd59d7a2b7a0fb5d89aaffe9e'
const position_id = '0xa99890fa6a8d4be06413759d04351d712377e5fda3cc03daf7f4815d99477d77'

describe('dlmm remove liquidity ', () => {
  const sdk = CetusDlmmSDK.createSDK({ env: 'testnet', full_rpc_url: 'https://rpc-testnet.suiscan.xyz' })
  let send_key_pair: Ed25519Keypair
  let account: string
  let pool: DlmmPool

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    account = send_key_pair.getPublicKey().toSuiAddress()
    sdk.setSenderAddress(account)
  })

  test('1 remove liquidity with both amounts ', async () => {
    pool = await sdk.Pool.getPool(pool_id)
    const { active_id, bin_step, bin_manager, coin_type_a, coin_type_b } = pool
    console.log('🚀 ~ pool:', pool)

    const position = await sdk.Position.getPosition(position_id)
    const { lower_bin_id, liquidity_shares } = position
    // console.log('🚀  ~ position:', position)

    const active_bin = await sdk.Pool.getBinInfo(bin_manager.bin_manager_handle, active_id, bin_step)
    const liquidity_shares_data = parseLiquidityShares(liquidity_shares, bin_step, lower_bin_id, active_bin)

    console.log('🚀 ~ test ~ liquidity_shares_data:', liquidity_shares_data)

    const calculateOption: CalculateRemoveLiquidityBothOption = {
      // bins: liquidity_shares_data.bins.slice(0, -500),
      bins: liquidity_shares_data.bins,
      active_id,
      fix_amount_a: false,
      coin_amount: '200000000',
    }
    const bin_infos = sdk.Position.calculateRemoveLiquidityInfo(calculateOption)
    console.log('🚀 ~ test ~ bin_infos:', bin_infos)

    const removeOption: RemoveLiquidityOption = {
      pool_id,
      bin_infos,
      coin_type_a,
      coin_type_b,
      position_id,
      slippage: 0.01,
      active_id,
      collect_fee: true,
      reward_coins: [],
      bin_step,
      remove_percent: 0.5,
    }
    const tx = sdk.Position.removeLiquidityPayload(removeOption)
    tx.setGasBudget(10000000000)
    printTransaction(tx)

    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('🚀 ~ test ~ res:', res)
  })

  test('2 remove liquidity with only coin a ', async () => {
    pool = await sdk.Pool.getPool(pool_id)
    const { active_id, bin_step, bin_manager, coin_type_a, coin_type_b } = pool
    console.log('🚀 ~ pool:', pool)

    const position = await sdk.Position.getPosition(position_id)
    const { lower_bin_id, liquidity_shares } = position
    console.log('🚀  ~ position:', position)

    const active_bin = await sdk.Pool.getBinInfo(bin_manager.bin_manager_handle, active_id, bin_step)
    const liquidity_shares_data = parseLiquidityShares(liquidity_shares, bin_step, lower_bin_id, active_bin)

    console.log('🚀 ~ test ~ liquidity_shares_data:', liquidity_shares_data)

    const calculateOption: CalculateRemoveLiquidityOnlyOption = {
      bins: liquidity_shares_data.bins,
      active_id,
      is_only_a: true,
      coin_amount: '100000',
    }
    const bin_infos = sdk.Position.calculateRemoveLiquidityInfo(calculateOption)
    console.log('🚀 ~ test ~ bin_infos:', bin_infos)

    const removeOption: RemoveLiquidityOption = {
      pool_id,
      bin_infos,
      coin_type_a,
      coin_type_b,
      position_id,
      slippage: 0.01,
      active_id,
      reward_coins: [],
      collect_fee: true,
      bin_step,
    }
    const tx = sdk.Position.removeLiquidityPayload(removeOption)

    printTransaction(tx)

    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('🚀 ~ test ~ res:', res)
  })

  test('3 close position ', async () => {
    pool = await sdk.Pool.getPool(pool_id)
    const { reward_manager, coin_type_a, coin_type_b } = pool
    console.log('🚀 ~ pool:', pool)

    const closeOption: ClosePositionOption = {
      pool_id,
      coin_type_a,
      coin_type_b,
      position_id,
      reward_coins: reward_manager.rewards.map((reward) => reward.reward_coin),
    }
    const tx = sdk.Position.closePositionPayload(closeOption)

    printTransaction(tx)

    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('🚀 ~ test ~ res:', res)
  })
})
