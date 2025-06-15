import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { Pool } from '@cetusprotocol/sui-clmm-sdk'
import { printTransaction, toDecimalsAmount } from '@cetusprotocol/common-sdk'
import { FarmsPositionNFT } from '@cetusprotocol/farms-sdk'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import { CetusZapSDK } from '../src/sdk'
const poolId = '0x871d8a227114f375170f149f7e9d45be822dd003eba225e83c05ac80828596bc'
const farmsPoolId = '0x9f5fd63b2a2fd8f698ff6b7b9720dbb2aa14bedb9fc4fd6411f20e5b531a4b89'
const posId = '0xf64f3fbc5e465b7abec2f4e5b03ecc4be99d88db16e03f63d38c8ceec6303e74'

describe('withdraw test', () => {
  const sdk = CetusZapSDK.createSDK({ env: 'mainnet' })
  let send_key_pair: Ed25519Keypair
  let address: string
  let pool: Pool
  let pos: FarmsPositionNFT | undefined

  beforeAll(async () => {
    send_key_pair = buildTestAccount()
    address = send_key_pair.getPublicKey().toSuiAddress()
    sdk.setSenderAddress(address)

    pool = await sdk.ClmmSDK.Pool.getPool(poolId)

    console.log('🚀 ~ describe ~ pool:', pool)

    if (pool === undefined) {
      throw new Error('Pool not found')
    }

    pos = await sdk.FarmsSDK.Farms.getFarmsPositionNFT(posId)

    console.log('🚀 ~ describe ~ pos:', pos)
    if (pos === undefined) {
      throw new Error('Position not found')
    }
  })

  test('Mode: FixedOneSide fixed_coin_a', async () => {
    const { current_sqrt_price, current_tick_index, tick_spacing, coin_type_a, coin_type_b } = pool!
    const tick_lower = pos!.tick_lower_index
    const tick_upper = pos!.tick_upper_index
    const slippage = 0.01

    const result = await sdk.Zap.preCalculateWithdrawAmount({
      mode: 'FixedOneSide',
      pool_id: poolId,
      tick_lower,
      tick_upper,
      current_sqrt_price: current_sqrt_price.toString(),
      fixed_amount: toDecimalsAmount(0.1, 9).toString(),
      fixed_coin_a: false,
      coin_type_a,
      coin_type_b,
      coin_decimal_a: 9,
      coin_decimal_b: 9,
    })

    console.log('🚀 ~ test ~ result:', result)

    const tx = await sdk.Zap.buildWithdrawPayload({
      withdraw_obj: result,
      pool_id: poolId,
      farms_pool_id: farmsPoolId,
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
    const tick_lower = pos!.tick_lower_index
    const tick_upper = pos!.tick_upper_index
    const slippage = 0.01

    const result = await sdk.Zap.preCalculateWithdrawAmount({
      mode: 'OnlyCoinA',
      pool_id: poolId,
      tick_lower,
      tick_upper,
      current_sqrt_price: current_sqrt_price.toString(),
      burn_liquidity: '200000',
      available_liquidity: pos!.liquidity.toString(),
      coin_type_a,
      coin_type_b,
      coin_decimal_a: 9,
      coin_decimal_b: 9,
    })

    console.log('🚀 ~ test ~ result:', result)

    const tx = await sdk.Zap.buildWithdrawPayload({
      withdraw_obj: result,
      pool_id: poolId,
      farms_pool_id: farmsPoolId,
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

    let isSimulation = true
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
    const tick_lower = pos!.tick_lower_index
    const tick_upper = pos!.tick_upper_index
    const slippage = 0.01

    const result = await sdk.Zap.preCalculateWithdrawAmount({
      mode: 'OnlyCoinB',
      pool_id: poolId,
      tick_lower,
      tick_upper,
      current_sqrt_price: current_sqrt_price.toString(),
      burn_liquidity: pos!.liquidity.toString(),
      available_liquidity: pos!.liquidity.toString(),
      coin_type_a,
      coin_type_b,
      coin_decimal_a: 9,
      coin_decimal_b: 9,
    })

    console.log('🚀 ~ test ~ result:', result)

    const tx = await sdk.Zap.buildWithdrawPayload({
      withdraw_obj: result,
      pool_id: poolId,
      pos_id: posId,
      farms_pool_id: farmsPoolId,
      close_pos: true,
      collect_fee: true,
      collect_rewarder_types: pool.rewarder_infos.map((info) => info.coin_type),
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
})
