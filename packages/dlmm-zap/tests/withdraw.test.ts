import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { d, printTransaction, toDecimalsAmount } from '@cetusprotocol/common-sdk'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import { CetusDlmmZapSDK } from '../src/sdk'
import { DlmmPool, DlmmPosition, parseLiquidityShares } from '@cetusprotocol/dlmm-sdk'
const poolId = '0x64e590b0e4d4f7dfc7ae9fae8e9983cd80ad83b658d8499bf550a9d4f6667076'
const posId = '0xd5b2a425c36f6afa899ebcd56681e682d37d59b36c0b7e6836289ec6b2cb18ba'

describe(' withdraw test', () => {
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

  test('calculateZapOutAvailableAmount', async () => {
    const { bin_step, bin_manager, active_id } = pool!
    const position = await sdk.DlmmSDK.Position.getPosition(posId)
    const { lower_bin_id, liquidity_shares } = position
    console.log('🚀  ~ position:', position)

    const is_receive_coin_a = true
    const mode = 'Both'

    const active_bin = await sdk.DlmmSDK.Pool.getBinInfo(bin_manager.bin_manager_handle, active_id, bin_step)
    const liquidity_shares_data = parseLiquidityShares(liquidity_shares, bin_step, lower_bin_id, active_bin)

    const available_obj = sdk.Zap.calculateZapOutAvailableAmount({
      remove_bin_range: liquidity_shares_data.bins,
      active_id,
      bin_step,
      is_receive_coin_a,
      mode,
      coin_decimal_a: 6,
      coin_decimal_b: 9,
      prices: {
        coin_a_price: '0.99984912',
        coin_b_price: '1.59574885',
      },
    })

    console.log('🚀  ~ available_obj:', available_obj)
  })

  test('Mode: Both ', async () => {
    const { coin_type_a, coin_type_b, bin_step, bin_manager, active_id, reward_manager } = pool!
    const slippage = 0.01
    const position = await sdk.DlmmSDK.Position.getPosition(posId)
    const { lower_bin_id, liquidity_shares } = position
    console.log('🚀  ~ position:', position)

    const is_receive_coin_a = false
    const expected_receive_amount = toDecimalsAmount(0.05, 9).toString()
    const mode = 'Both'

    const active_bin = await sdk.DlmmSDK.Pool.getBinInfo(bin_manager.bin_manager_handle, active_id, bin_step)
    const liquidity_shares_data = parseLiquidityShares(liquidity_shares, bin_step, lower_bin_id, active_bin)

    const result = await sdk.Zap.preCalculateWithdrawAmount({
      remove_bin_range: liquidity_shares_data.bins,
      active_id,
      bin_step,
      expected_receive_amount,
      is_receive_coin_a,
      mode,
      coin_type_a,
      coin_type_b,
      coin_decimal_a: 6,
      coin_decimal_b: 9,
    })

    console.log('🚀 ~ test ~ result:', result)

    const tx = await sdk.Zap.buildWithdrawPayload({
      withdraw_obj: result,
      swap_slippage: 0.01,
      pool_id: poolId,
      position_id: posId,
      active_id,
      bin_step,
      slippage,
      reward_coins: reward_manager.rewards.map((reward) => reward.reward_coin),
      collect_fee: true,
      remove_percent: Number(result.remove_percent),
      coin_type_a,
      coin_type_b,
      is_close_position: true,
    })

    printTransaction(tx)

    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('Deposit Transaction Simulation Result:', res)
  })

  test('Mode: OnlyCoinB ', async () => {
    const { coin_type_a, coin_type_b, bin_step, bin_manager, active_id, reward_manager } = pool!
    const slippage = 0.01
    const position = await sdk.DlmmSDK.Position.getPosition(posId)
    const { lower_bin_id, liquidity_shares } = position
    console.log('🚀  ~ position:', position)

    const is_receive_coin_a = false
    const expected_receive_amount = toDecimalsAmount(0.05, 9).toString()
    const mode = 'OnlyCoinB'

    const active_bin = await sdk.DlmmSDK.Pool.getBinInfo(bin_manager.bin_manager_handle, active_id, bin_step)
    const liquidity_shares_data = parseLiquidityShares(liquidity_shares, bin_step, lower_bin_id, active_bin)

    const result = await sdk.Zap.preCalculateWithdrawAmount({
      remove_bin_range: liquidity_shares_data.bins,
      active_id,
      bin_step,
      expected_receive_amount,
      is_receive_coin_a,
      mode,
      coin_type_a,
      coin_type_b,
      coin_decimal_a: 6,
      coin_decimal_b: 9,
    })

    console.log('🚀 ~ test ~ result:', result)

    const tx = await sdk.Zap.buildWithdrawPayload({
      withdraw_obj: result,
      swap_slippage: 0.01,
      pool_id: poolId,
      position_id: posId,
      active_id,
      bin_step,
      slippage,
      reward_coins: reward_manager.rewards.map((reward) => reward.reward_coin),
      collect_fee: true,
      remove_percent: Number(result.remove_percent),
      coin_type_a,
      coin_type_b,
      is_close_position: false,
    })

    // printTransaction(tx)

    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('Deposit Transaction Simulation Result:', res)
  })

  test('Mode: OnlyCoinA ', async () => {
    const { coin_type_a, coin_type_b, bin_step, bin_manager, active_id, reward_manager } = pool!
    const slippage = 0.01
    const position = await sdk.DlmmSDK.Position.getPosition(posId)
    const { lower_bin_id, liquidity_shares } = position
    console.log('🚀  ~ position:', position)

    const is_receive_coin_a = false
    const expected_receive_amount = toDecimalsAmount(0.02, 9).toString()
    const mode = 'OnlyCoinA'

    const active_bin = await sdk.DlmmSDK.Pool.getBinInfo(bin_manager.bin_manager_handle, active_id, bin_step)
    const liquidity_shares_data = parseLiquidityShares(liquidity_shares, bin_step, lower_bin_id, active_bin)

    const result = await sdk.Zap.preCalculateWithdrawAmount({
      remove_bin_range: liquidity_shares_data.bins,
      active_id,
      bin_step,
      expected_receive_amount,
      is_receive_coin_a,
      mode,
      coin_type_a,
      coin_type_b,
      coin_decimal_a: 6,
      coin_decimal_b: 9,
    })

    console.log('🚀 ~ test ~ result:', result)

    const tx = await sdk.Zap.buildWithdrawPayload({
      withdraw_obj: result,
      swap_slippage: 0.01,
      pool_id: poolId,
      position_id: posId,
      active_id,
      bin_step,
      slippage,
      reward_coins: reward_manager.rewards.map((reward) => reward.reward_coin),
      collect_fee: true,
      remove_percent: Number(result.remove_percent),
      coin_type_a,
      coin_type_b,
      is_close_position: false,
    })

    // printTransaction(tx)

    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('Deposit Transaction Simulation Result:', res)
  })
})
