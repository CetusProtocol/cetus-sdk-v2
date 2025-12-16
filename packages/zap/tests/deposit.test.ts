import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import BN from 'bn.js'
import { Pool } from '@cetusprotocol/sui-clmm-sdk'
import { ClmmPoolUtil, printTransaction, TickMath, toDecimalsAmount } from '@cetusprotocol/common-sdk'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import { CetusZapSDK } from '../src/sdk'
import { BaseDepositOptions, FixedOneSideOptions, FlexibleBothOptions, OnlyCoinAOptions, OnlyCoinBOptions } from '../src/types/zap'
const poolId = '0xb8a67c149fd1bc7f9aca1541c61e51ba13bdded64c273c278e50850ae3bff073'
const posId = '0xcf995f40b0f9c40a8b03e0b9d9554fea2bc12a18fe63db3a04c59c46be5c10be'

describe('deposit test', () => {
  const sdk = CetusZapSDK.createSDK({ env: 'mainnet' })
  let send_key_pair: Ed25519Keypair
  let address: string
  let pool: Pool

  beforeAll(async () => {
    send_key_pair = buildTestAccount()
    // address = send_key_pair.getPublicKey().toSuiAddress()
    address = ''
    sdk.setSenderAddress(address)

    pool = await sdk.ClmmSDK.Pool.getPool(poolId)

    console.log('🚀 ~ describe ~ pool:', pool)

    if (pool === undefined) {
      throw new Error('Pool not found')
    }
  })

  test('Mode: FixedOneSide fixed_coin_a', async () => {
    const { current_sqrt_price, current_tick_index, tick_spacing, coin_type_a, coin_type_b } = pool!
    const tick_lower = TickMath.getInitializeTickIndex(current_tick_index - 2000, Number(tick_spacing))
    const tick_upper = TickMath.getInitializeTickIndex(current_tick_index + 2000, Number(tick_spacing))
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
      fixed_coin_a: false,
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

    let isSimulation = true
    if (isSimulation) {
      const res = await sdk.FullClient.sendSimulationTransaction(tx, address)
      console.log('Deposit Transaction Simulation Result:', res?.effects?.status?.status === 'success' ? res?.events : res)
    } else {
      const res = await sdk.FullClient.sendTransaction(send_key_pair, tx)
      console.log('Deposit Transaction Simulation Result:', res?.events)
    }
  })

  test('Mode: FlexibleBoth ', async () => {
    const { current_sqrt_price, current_tick_index, tick_spacing, coin_type_a, coin_type_b } = pool!
    console.log("1010🚀 ~ tick_spacing:", tick_spacing)
    console.log("1010🚀 ~ current_tick_index:", current_tick_index)
    const tick_lower = TickMath.getInitializeTickIndex(current_tick_index - 2000, Number(tick_spacing))
    const tick_upper = TickMath.getInitializeTickIndex(current_tick_index + 2000, Number(tick_spacing))
    const slippage = 0.01

    const options: BaseDepositOptions = {
      pool_id: poolId,
      tick_lower,
      tick_upper,
      current_sqrt_price: current_sqrt_price.toString(),
      slippage,
    }

    const modeOptions: FlexibleBothOptions = {
      mode: 'FlexibleBoth',
      coin_amount_a: toDecimalsAmount(0.1, 6).toString(),
      coin_amount_b: toDecimalsAmount(1, 9).toString(),
      coin_type_a,
      coin_type_b,
      coin_decimal_a: 6,
      coin_decimal_b: 9,
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

    let isSimulation = true
    if (isSimulation) {
      const res = await sdk.FullClient.sendSimulationTransaction(tx, address)
      console.log('Deposit Transaction Simulation Result:', res?.effects?.status?.status === 'success' ? res?.events : res)
    } else {
      const res = await sdk.FullClient.sendTransaction(send_key_pair, tx)
      console.log('Deposit Transaction Simulation Result:', res?.events)
    }
  })

  test('Mode: OnlyCoinA ', async () => {
    const { current_sqrt_price, current_tick_index, tick_spacing, coin_type_a, coin_type_b } = pool!
    sdk.setSenderAddress('0x935029ca5219502a47ac9b69f556ccf6e2198b5e7815cf50f68846f723739cbd')
    const pos: any = undefined //ß await sdk.CetusClmmSDK.Position.getPositionById(posId)

    const tick_lower = TickMath.getInitializeTickIndex(current_tick_index - 2000, Number(tick_spacing))
    const tick_upper = TickMath.getInitializeTickIndex(current_tick_index + 2000, Number(tick_spacing))

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
      coin_amount: toDecimalsAmount(200, 6).toString(),
      coin_type_a,
      coin_type_b,
      coin_decimal_a: 6,
      coin_decimal_b: 9,
    }

    const result = await sdk.Zap.preCalculateDepositAmount(options, modeOptions)

    console.log('🚀 ~ test ~ result:', result)
    await new Promise((resolve) => setTimeout(resolve, 2000))
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

    // printTransaction(tx)

    let isSimulation = true
    if (isSimulation) {
      const res = await sdk.FullClient.sendSimulationTransaction(tx, sdk.getSenderAddress())
      console.log('Deposit Transaction Simulation Result:', res?.effects?.status?.status === 'success' ? res?.events : res)

      const reResult = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
        tick_lower,
        tick_upper,
        result.fixed_liquidity_coin_a ? new BN(result.amount_a) : new BN(result.amount_b),
        result.fixed_liquidity_coin_a,
        false,
        slippage,
        new BN(current_sqrt_price)
      )
      console.log('🚀 ~ test ~ reResult:', reResult)
    } else {
      const res = await sdk.FullClient.sendTransaction(send_key_pair, tx)
      console.log('Deposit Transaction Simulation Result:', res?.events)
    }
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
