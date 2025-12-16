import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import BN from 'bn.js'
import { ClmmPoolUtil, printTransaction, TickMath, toDecimalsAmount } from '@cetusprotocol/common-sdk'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import { CetusDlmmZapSDK } from '../src/sdk'
import { BaseDepositOptions, OnlyCoinDepositOptions } from '../src/types/zap'
import { DlmmPool, StrategyType } from '@cetusprotocol/dlmm-sdk'
import { calcExactSwapAmount } from '../src/utils/zap'
const poolId = '0x8fd240c6488d7e4f29481fbe6e498f37add3bf7c46d3022d81eb4f4f8e51269b'
const posId = '0xac7d19a9526546a6bb9ab9b2a94225dbc4fa400343a61f2c3e8fe5e59bdaab56'

describe('deposit test', () => {
  const sdk = CetusDlmmZapSDK.createSDK({ env: 'mainnet' })
  let send_key_pair: Ed25519Keypair
  let address: string
  let pool: DlmmPool

  beforeAll(async () => {
    send_key_pair = buildTestAccount()
    address = send_key_pair.getPublicKey().toSuiAddress()
    sdk.setSenderAddress(address)

    pool = await sdk.DlmmSDK.Pool.getPool(poolId)

    console.log('🚀 ~ describe ~ pool:', pool)

    if (pool === undefined) {
      throw new Error('Pool not found')
    }
  })

  test('1: Create new position within range', async () => {
    const { active_id, bin_step, bin_manager } = pool!

    const lower_bin_id = active_id
    const upper_bin_id = active_id + 2

    const amounts_in_active_bin = await sdk.DlmmSDK.Position.getActiveBinIfInRange(
      bin_manager.bin_manager_handle,
      lower_bin_id,
      upper_bin_id,
      active_id,
      bin_step
    )

    const options: BaseDepositOptions = {
      pool_id: poolId,
      strategy_type: StrategyType.Spot,
      active_bin_of_pool: amounts_in_active_bin,
      lower_bin_id,
      upper_bin_id,
      active_id: pool.active_id,
      bin_step: pool.bin_step,
    }

    const modeOptions: OnlyCoinDepositOptions = {
      fix_amount_a: false,
      coin_amount: toDecimalsAmount(0.1, 9).toString(),
    }

    const deposit_obj = await sdk.Zap.preCalculateDepositAmount(options, modeOptions)

    console.log('deposit_obj: ', deposit_obj)
    // const tx = await sdk.Zap.buildDepositPayload({
    //   ...options,
    //   slippage: 0.01,
    //   deposit_obj,
    // })
    // printTransaction(tx)

    // const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    // console.log('🚀 ~ test ~ res:', res)
  })

  test('2: Add liquidity ', async () => {
    const { active_id, bin_step, bin_manager } = pool!
    const position = await sdk.DlmmSDK.Position.getPosition(posId)
    const { lower_bin_id, upper_bin_id } = position

    const amounts_in_active_bin = await sdk.DlmmSDK.Position.getActiveBinIfInRange(
      bin_manager.bin_manager_handle,
      lower_bin_id,
      upper_bin_id,
      active_id,
      bin_step
    )

    const options: BaseDepositOptions = {
      pool_id: poolId,
      strategy_type: StrategyType.Spot,
      active_bin_of_pool: amounts_in_active_bin,
      lower_bin_id,
      upper_bin_id,
      active_id: pool.active_id,
      bin_step: pool.bin_step,
    }

    const modeOptions: OnlyCoinDepositOptions = {
      fix_amount_a: false,
      coin_amount: toDecimalsAmount(0.1, 9).toString(),
    }

    const deposit_obj = await sdk.Zap.preCalculateDepositAmount(options, modeOptions)

    console.log('deposit_obj: ', deposit_obj)
    const tx = await sdk.Zap.buildDepositPayload({
      ...options,
      slippage: 0.01,
      deposit_obj,
      pos_obj: {
        pos_id: posId,
        collect_fee: false,
        collect_rewarder_types: [],
      },
    })
    printTransaction(tx)

    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('🚀 ~ test ~ res:', res)
  })

  test('4  only test ', async () => {
    const poolId = '0x8fd240c6488d7e4f29481fbe6e498f37add3bf7c46d3022d81eb4f4f8e51269b'
    const active_id = 1949
    const lower_bin_id = 1956
    const upper_bin_id = 1970
    const bin_step = 50

    const amounts_in_active_bin = {
      bin_id: 1946,
      amount_a: '26260242',
      amount_b: '6221615916576',
      liquidity: '122712703402244366095027939883747',
      price_per_lamport: '16411.79857544645947431833634885811612491579580819234251976013183',
    }

    const options: BaseDepositOptions = {
      pool_id: poolId,
      strategy_type: StrategyType.Spot,
      active_bin_of_pool: amounts_in_active_bin,
      lower_bin_id,
      upper_bin_id,
      active_id: active_id,
      bin_step: bin_step,
    }

    const modeOptions: OnlyCoinDepositOptions = {
      fix_amount_a: true,
      coin_amount: toDecimalsAmount(0.501759, 6).toString(),
    }

    const deposit_obj = await sdk.Zap.preCalculateDepositAmount(options, modeOptions)

    console.log('deposit_obj: ', deposit_obj)
    const tx = await sdk.Zap.buildDepositPayload({
      ...options,
      slippage: 0.8,
      deposit_obj,
    })
    printTransaction(tx)

    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('🚀 ~ test ~ res:', res)
  })
})
