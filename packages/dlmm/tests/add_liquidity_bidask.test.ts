// buildTestAccount
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import { CetusDlmmSDK } from '../src/sdk'
import {
  AddLiquidityOption,
  CalculateAddLiquidityAutoFillOption,
  CalculateAddLiquidityOption,
  DlmmPool,
  OpenAndAddLiquidityOption,
  StrategyType,
} from '../src/types/dlmm'
import { printTransaction } from '@cetusprotocol/common-sdk'

const pool_id = '0x6ae0b7d9fe4f3ed5ea187c357a4c6c5a192a199d899a58d1f559a6501082f3bf'
const position_id = '0x85f39912b4eca99e076a925749552fe7a4b2dc882005e21070ba3f2e43b11f3d'

describe('dlmm add liquidity bid ask', () => {
  const sdk = CetusDlmmSDK.createSDK({ env: 'testnet', full_rpc_url: 'https://rpc-testnet.suiscan.xyz' })
  let send_key_pair: Ed25519Keypair
  let account: string
  let pool: DlmmPool

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    account = send_key_pair.getPublicKey().toSuiAddress()
    sdk.setSenderAddress(account)
  })

  test('1 bid ask  both amounts open and add liquidity', async () => {
    pool = await sdk.Pool.getPool(pool_id)
    console.log('🚀 ~ beforeEach ~ pool:', pool)
    const { active_id, bin_step } = pool
    const amount_a = '1000000'
    const amount_b = '1200000'
    const lower_bin_id = -10
    const upper_bin_id = 10

    const amounts_in_active_bin = await sdk.Position.getActiveBinIfInRange(
      pool.bin_manager.bin_manager_handle,
      lower_bin_id,
      upper_bin_id,
      active_id,
      bin_step
    )

    const calculateOption: CalculateAddLiquidityOption = {
      pool_id,
      amount_a,
      amount_b,
      active_id,
      bin_step,
      lower_bin_id,
      upper_bin_id,
      active_bin_of_pool: amounts_in_active_bin,
      strategy_type: StrategyType.BidAsk,
    }
    const bin_infos = await sdk.Position.calculateAddLiquidityInfo(calculateOption)
    console.log('🚀 ~ test ~ bin_infos:', bin_infos)

    const addOption: OpenAndAddLiquidityOption = {
      pool_id,
      bin_infos: bin_infos,
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      lower_bin_id,
      upper_bin_id,
      active_id,
      use_bin_infos: false,
      strategy_type: StrategyType.BidAsk,
      max_price_slippage: 0.01,
      bin_step,
    }
    const tx = sdk.Position.addLiquidityPayload(addOption)

    // printTransaction(tx)

    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('🚀 ~ test ~ res:', res)
  })

  test('2 bid ask  strategy  both amounts add liquidity', async () => {
    pool = await sdk.Pool.getPool(pool_id)
    const { active_id, bin_step, bin_manager, coin_type_a, coin_type_b } = pool
    console.log('🚀 ~ pool:', pool)

    const position = await sdk.Position.getPosition(position_id)
    const { lower_bin_id, upper_bin_id } = position
    console.log('🚀  ~ position:', position)

    const amounts_in_active_bin = await sdk.Position.getActiveBinIfInRange(
      bin_manager.bin_manager_handle,
      lower_bin_id,
      upper_bin_id,
      active_id,
      bin_step
    )

    const amount_a = '100000000'
    const amount_b = '120000000'

    const calculateOption: CalculateAddLiquidityOption = {
      pool_id,
      amount_a,
      amount_b,
      active_id,
      bin_step,
      lower_bin_id,
      upper_bin_id,
      active_bin_of_pool: amounts_in_active_bin,
      strategy_type: StrategyType.BidAsk,
    }
    const bin_infos = await sdk.Position.calculateAddLiquidityInfo(calculateOption)
    console.log('🚀 ~ test ~ bin_infos:', bin_infos)

    const addOption: AddLiquidityOption = {
      pool_id,
      bin_infos: bin_infos,
      coin_type_a,
      coin_type_b,
      active_id,
      position_id,
      collect_fee: true,
      reward_coins: [],
      strategy_type: StrategyType.BidAsk,
      use_bin_infos: false,
      max_price_slippage: 0.01,
      bin_step,
    }
    const tx = sdk.Position.addLiquidityPayload(addOption)

    printTransaction(tx)

    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('🚀 ~ test ~ res:', res)
  })

  test('3 bid ask  strategy  fix coin a add liquidity', async () => {
    pool = await sdk.Pool.getPool(pool_id)
    const { active_id, bin_step, bin_manager, coin_type_a, coin_type_b } = pool
    console.log('🚀 ~ pool:', pool)

    const position = await sdk.Position.getPosition(position_id)
    const { lower_bin_id, upper_bin_id } = position
    console.log('🚀  ~ position:', position)

    const amounts_in_active_bin = await sdk.Position.getActiveBinIfInRange(
      bin_manager.bin_manager_handle,
      lower_bin_id,
      upper_bin_id,
      active_id,
      bin_step
    )

    const coin_amount = '2000000'

    const calculateOption: CalculateAddLiquidityAutoFillOption = {
      pool_id,
      coin_amount,
      fix_amount_a: true,
      active_id,
      bin_step,
      lower_bin_id,
      upper_bin_id,
      active_bin_of_pool: amounts_in_active_bin,
      strategy_type: StrategyType.BidAsk,
    }
    const bin_infos = await sdk.Position.calculateAddLiquidityInfo(calculateOption)
    console.log('🚀 ~ test ~ bin_infos:', bin_infos)

    const addOption: AddLiquidityOption = {
      pool_id,
      bin_infos: bin_infos,
      coin_type_a,
      coin_type_b,
      active_id,
      position_id,
      collect_fee: true,
      reward_coins: [],
      strategy_type: StrategyType.BidAsk,
      use_bin_infos: false,
      max_price_slippage: 0.01,
      bin_step,
    }
    const tx = sdk.Position.addLiquidityPayload(addOption)

    printTransaction(tx)

    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('🚀 ~ test ~ res:', res)
  })
})
