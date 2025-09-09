import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { Pool, Position } from '@cetusprotocol/sui-clmm-sdk'
import { printTransaction, toDecimalsAmount } from '@cetusprotocol/common-sdk'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import { CetusZapSDK } from '../src/sdk'
const poolId = '0xb8a67c149fd1bc7f9aca1541c61e51ba13bdded64c273c278e50850ae3bff073'
const posId = '0x3c13008edd83d2ba9959dd64c1d77292d5cb51e0ace7c6d2ad3f6764e797cdc4'

describe(' withdraw test', () => {
  const sdk = CetusZapSDK.createSDK({ env: 'mainnet' })
  let send_key_pair: Ed25519Keypair
  let address: string
  let pool: Pool
  let pos: Position

  beforeAll(async () => {
    send_key_pair = buildTestAccount()
    address = send_key_pair.getPublicKey().toSuiAddress()
    sdk.setSenderAddress(address)

    pool = await sdk.ClmmSDK.Pool.getPool(poolId)

    console.log('🚀 ~ describe ~ pool:', pool)

    if (pool === undefined) {
      throw new Error('Pool not found')
    }

    pos = await sdk.ClmmSDK.Position.getPositionById(posId)

    console.log('🚀 ~ describe ~ pos:', pos)
    if (pos === undefined) {
      throw new Error('Position not found')
    }
  })

  test('Mode: FixedOneSide fixed_coin_a', async () => {
    const { current_sqrt_price, current_tick_index, tick_spacing, coin_type_a, coin_type_b } = pool!
    const tick_lower = pos.tick_lower_index
    const tick_upper = pos.tick_upper_index
    const slippage = 0.01

    const result = await sdk.Zap.preCalculateWithdrawAmount({
      mode: 'FixedOneSide',
      pool_id: poolId,
      tick_lower,
      tick_upper,
      current_sqrt_price: current_sqrt_price.toString(),
      fixed_amount: toDecimalsAmount(0.01, 6).toString(),
      fixed_coin_a: false,
      coin_type_a,
      coin_type_b,
      coin_decimal_a: 6,
      coin_decimal_b: 9,
    })

    console.log('🚀 ~ test ~ result:', result)

    const tx = await sdk.Zap.buildWithdrawPayload({
      withdraw_obj: result,
      pool_id: poolId,
      pos_id: posId,
      close_pos: false,
      collect_fee: true,
      collect_rewarder_types: [],
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
    const { current_sqrt_price, coin_type_a, coin_type_b } = pool!
    const tick_lower = pos.tick_lower_index
    const tick_upper = pos.tick_upper_index
    const slippage = 0.01

    const result = await sdk.Zap.preCalculateWithdrawAmount({
      mode: 'OnlyCoinA',
      pool_id: poolId,
      tick_lower,
      tick_upper,
      current_sqrt_price: current_sqrt_price.toString(),
      burn_liquidity: '200000',
      available_liquidity: pos.liquidity.toString(),
      coin_type_a,
      coin_type_b,
      coin_decimal_a: 6,
      coin_decimal_b: 9,
    })

    console.log('🚀 ~ test ~ result:', result)

    const tx = await sdk.Zap.buildWithdrawPayload({
      withdraw_obj: result,
      pool_id: poolId,
      pos_id: posId,
      close_pos: false,
      collect_fee: false,
      collect_rewarder_types: [],
      coin_type_a,
      coin_type_b,
      tick_lower,
      tick_upper,
      slippage,
    })

    printTransaction(tx)

    let isSimulation = false
    if (isSimulation) {
      const res = await sdk.FullClient.sendSimulationTransaction(tx, address)
      console.log('Deposit Transaction Simulation Result:', res?.effects?.status?.status === 'success' ? res?.events : res)
    } else {
      const res = await sdk.FullClient.sendTransaction(send_key_pair, tx)
      console.log('Deposit Transaction Simulation Result:', res?.events)
    }
  })

  test('Mode: OnlyCoinB ', async () => {
    const { current_sqrt_price, coin_type_a, coin_type_b } = pool!
    const tick_lower = pos.tick_lower_index
    const tick_upper = pos.tick_upper_index
    const slippage = 0.0

    const result = await sdk.Zap.preCalculateWithdrawAmount({
      mode: 'OnlyCoinB',
      pool_id: poolId,
      tick_lower,
      tick_upper,
      current_sqrt_price: current_sqrt_price.toString(),
      burn_liquidity: pos.liquidity.toString(),
      available_liquidity: pos.liquidity.toString(),
      coin_type_a,
      coin_type_b,
      coin_decimal_a: 6,
      coin_decimal_b: 6,
    })

    console.log('🚀 ~ test ~ result:', result)

    const tx = await sdk.Zap.buildWithdrawPayload({
      withdraw_obj: result,
      pool_id: poolId,
      pos_id: posId,
      close_pos: true,
      collect_fee: true,
      collect_rewarder_types: pool!.rewarder_infos.map((info) => info.coin_type),
      coin_type_a,
      coin_type_b,
      tick_lower,
      tick_upper,
      slippage,
    })

    // printTransaction(tx)

    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('Deposit Transaction Simulation Result:', res?.events)
  })
})
