import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import BN from 'bn.js'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import { CetusClmmV2SDK } from '../src/sdk'
import { BaseDepositOptions, FixedOneSideOptions, FlexibleBothOptions, OnlyCoinAOptions, OnlyCoinBOptions } from '../src/types/zap'
import { Pool } from '../src/types/clmm_type'
import { ClmmPoolUtil, printTransaction, TickMath, toDecimalsAmount } from '@cetusprotocol/common-sdk'
const poolId = '0xbeaaf89a1aa4469b2d5a760801c1c5d65d1b26f14051b0692e2a8c7392fcb1da'
const posId = '0x4b16cd28d74f93653cc44e45edf929811b29302f9ff286c7ee9cab77dce4dda8'

describe('deposit test', () => {
  const sdk = CetusClmmV2SDK.createSDK({ env: 'testnet' })
  let send_key_pair: Ed25519Keypair
  let address: string
  let pool: Pool

  beforeAll(async () => {
    send_key_pair = buildTestAccount()
    sdk.setSenderAddress(send_key_pair.getPublicKey().toSuiAddress())

    pool = await sdk.Pool.getPool(poolId)

    console.log('🚀 ~ describe ~ pool:', pool)

    if (pool === undefined) {
      throw new Error('Pool not found')
    }
  })

  test('Mode: FixedOneSide fixed_coin_a', async () => {
    const { current_sqrt_price, current_tick_index, tick_spacing, coin_type_a, coin_type_b } = pool!
    const tick_lower = TickMath.getInitializeTickIndex(current_tick_index - 200, Number(tick_spacing))
    const tick_upper = TickMath.getInitializeTickIndex(current_tick_index + 200, Number(tick_spacing))
    const slippage = 0.01

    const options: BaseDepositOptions = {
      pool_id: poolId,
      tick_lower,
      tick_upper,
      current_sqrt_price: current_sqrt_price.toString(),
      slippage,
    }

    const modeOptions: FixedOneSideOptions = {
      mode: 'FixedOneSide',
      fixed_amount: toDecimalsAmount(1, 6).toString(),
      fixed_coin_a: true,
    }

    const result = await sdk.Zap.preCalculateDepositAmount(options, modeOptions)

    console.log('🚀 ~ test ~ result:', result)

    const tx = await sdk.Zap.buildDepositPayload({
      deposit_obj: result,
      pool_id: poolId,
      coin_type_a,
      coin_type_b,
      tick_lower,
      tick_upper,
      slippage,
    })

    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('res:', res)
  })


  test('Mode: OnlyCoinA ', async () => {
    const { current_sqrt_price, current_tick_index, tick_spacing, coin_type_a, coin_type_b } = pool!
    const pos = await sdk.Position.getPositionById(posId)

    const tick_lower = pos.tick_lower_index
    const tick_upper = pos.tick_upper_index

    const slippage = 0.005
    const swap_slippage = 0.01

    const options: BaseDepositOptions = {
      pool_id: poolId,
      tick_lower,
      tick_upper,
      current_sqrt_price: current_sqrt_price.toString(),
      slippage,
      swap_slippage,
    }

    const modeOptions: OnlyCoinAOptions = {
      mode: 'OnlyCoinA',
      coin_amount: toDecimalsAmount(2, 6).toString(),
      coin_type_a,
      coin_type_b,
      coin_decimal_a: 6,
      coin_decimal_b: 6,
    }

    const result = await sdk.Zap.preCalculateDepositAmount(options, modeOptions)

    console.log('🚀 ~ test ~ result:', result)
    const tx = await sdk.Zap.buildDepositPayload({
      deposit_obj: result,
      pool_id: poolId,
      coin_type_a,
      coin_type_b,
      tick_lower,
      tick_upper,
      slippage,
      swap_slippage,
    })

    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('res:', res)
  })

  test('Mode: OnlyCoinB ', async () => {
    const { current_sqrt_price, current_tick_index, tick_spacing, coin_type_a, coin_type_b } = pool!
    const pos: any = undefined //await sdk.CetusClmmSDK.Position.getPositionById(posId)

    const tick_lower = -2 // TickMath.getInitializeTickIndex(current_tick_index - 2000, Number(tick_spacing))
    const tick_upper = 6 // TickMath.getInitializeTickIndex(current_tick_index + 2000, Number(tick_spacing))
    const slippage = 0.01

    const options: BaseDepositOptions = {
      pool_id: poolId,
      tick_lower,
      tick_upper,
      current_sqrt_price: current_sqrt_price.toString(),
      slippage,
    }

    const modeOptions: OnlyCoinBOptions = {
      mode: 'OnlyCoinB',
      coin_amount: toDecimalsAmount('10', 6).toString(),
      coin_type_a,
      coin_type_b,
      coin_decimal_a: 6,
      coin_decimal_b: 6,
    }

    const result = await sdk.Zap.preCalculateDepositAmount(options, modeOptions)

    console.log('🚀 ~ test ~ result:', result)

    // const tx = await sdk.Zap.buildDepositPayload({
    //   deposit_obj: result,
    //   pool_id: poolId,
    //   coin_type_a,
    //   coin_type_b,
    //   tick_lower,
    //   tick_upper,
    //   slippage,
    // })

    // // printTransaction(tx)

    // let isSimulation = true
    // if (isSimulation) {
    //   const res = await sdk.FullClient.sendSimulationTransaction(tx, address)
    //   console.log('Deposit Transaction Simulation Result:', res?.effects?.status?.status === 'success' ? res?.events : res)
    // } else {
    //   const res = await sdk.FullClient.sendTransaction(send_key_pair, tx)
    //   console.log('Deposit Transaction Simulation Result:', res?.events)
    // }
  })
})
