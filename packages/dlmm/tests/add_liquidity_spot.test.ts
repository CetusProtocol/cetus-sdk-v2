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
  OpenAndAddLiquidityWithPriceOption,
  StrategyType,
} from '../src/types/dlmm'
import { printTransaction, toDecimalsAmount } from '@cetusprotocol/common-sdk'
import { BinUtils } from '../src/utils/binUtils'

const pool_id = '0x2ebd6828bc7a952f6e3a884800f70c3ad658964fa9a103bea953835d73873e68'
const position_id = '0xf5139870fbc926d1ca1afdc536b4ab457a9c2a696440d10955572f04b95d9e29'

describe('dlmm add liquidity spot', () => {
  const sdk = CetusDlmmSDK.createSDK({ env: 'mainnet' })
  let send_key_pair: Ed25519Keypair
  let account: string
  let pool: DlmmPool

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    account = send_key_pair.getPublicKey().toSuiAddress()
    sdk.setSenderAddress(account)
  })

  test('0 spot  both amounts open and add liquidity with price', async () => {
    pool = await sdk.Pool.getPool(pool_id)
    console.log('🚀 ~ beforeEach ~ pool:', pool)
    const { active_id, bin_step } = pool
    const amount_a = '1000000'
    const amount_b = '1200000'

    const lower_price = '0.99'
    const upper_price = '1.01'
    const price = BinUtils.getPriceFromBinId(active_id, bin_step, 6, 6)

    const lower_bin_id = BinUtils.getBinIdFromPrice(lower_price, bin_step, true, 6, 6)
    const upper_bin_id = BinUtils.getBinIdFromPrice(upper_price, bin_step, true, 6, 6)

    console.log('🚀 ~ test ~ lower_bin_id:', lower_bin_id)
    console.log('🚀 ~ test ~ upper_bin_id:', upper_bin_id)

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
      strategy_type: StrategyType.Spot,
    }
    const bin_infos = await sdk.Position.calculateAddLiquidityInfo(calculateOption)
    //  console.log('🚀 ~ test ~ bin_infos:', bin_infos)

    const addOption: OpenAndAddLiquidityWithPriceOption = {
      pool_id,
      bin_infos: bin_infos,
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      price_base_coin: 'coin_a',
      price: price.toString(),
      lower_price,
      upper_price,
      bin_step,
      active_bin_of_pool: amounts_in_active_bin,
      strategy_type: StrategyType.Spot,
      decimals_a: 6,
      decimals_b: 6,
      max_price_slippage: 0.01,
      active_id,
    }
    const tx = await sdk.Position.addLiquidityWithPricePayload(addOption)

    printTransaction(tx)

    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('🚀 ~ test ~ res:', res)
  })

  test('1 spot  both amounts open and add liquidity', async () => {
    pool = await sdk.Pool.getPool(pool_id)
    console.log('🚀 ~ beforeEach ~ pool:', pool)
    const { active_id, bin_step } = pool
    const amount_a = '10000000'
    const amount_b = '20000000'
    const lower_bin_id = active_id - 10
    const upper_bin_id = active_id + 10

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
      strategy_type: StrategyType.Spot,
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
      strategy_type: StrategyType.Spot,
      use_bin_infos: false,
      max_price_slippage: 0.01,
      bin_step,
    }
    const tx = sdk.Position.addLiquidityPayload(addOption)
    tx.setGasBudget(10000000000)
    // printTransaction(tx)

    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('🚀 ~ test ~ res:', res)
  })

  test('2 spot strategy  both amounts add liquidity', async () => {
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

    const amount_a = '1000000'
    const amount_b = '0'

    const calculateOption: CalculateAddLiquidityOption = {
      pool_id,
      amount_a,
      amount_b,
      active_id,
      bin_step,
      lower_bin_id,
      upper_bin_id,
      active_bin_of_pool: amounts_in_active_bin,
      strategy_type: StrategyType.Spot,
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
      strategy_type: StrategyType.Spot,
      use_bin_infos: false,
      max_price_slippage: 0.01,
      bin_step,
    }
    const tx = sdk.Position.addLiquidityPayload(addOption)

    printTransaction(tx)

    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('🚀 ~ test ~ res:', res)
  })

  test('3 spot strategy  fix coin a add liquidity', async () => {
    pool = await sdk.Pool.getPool(pool_id)
    const { active_id, bin_step, bin_manager, coin_type_a, coin_type_b } = pool
    console.log('🚀 ~ pool:', pool)

    const position = await sdk.Position.getPosition(position_id)
    const { lower_bin_id, upper_bin_id } = position
    console.log('🚀  ~ position:', position)

    // const lower_bin_id = active_id + 1
    // const upper_bin_id = active_id + 1

    const amounts_in_active_bin = await sdk.Position.getActiveBinIfInRange(
      bin_manager.bin_manager_handle,
      lower_bin_id,
      upper_bin_id,
      active_id,
      bin_step
    )

    const coin_amount = toDecimalsAmount(1, 9)

    const calculateOption: CalculateAddLiquidityAutoFillOption = {
      pool_id,
      coin_amount,
      fix_amount_a: true,
      active_id,
      bin_step,
      lower_bin_id,
      upper_bin_id,
      active_bin_of_pool: amounts_in_active_bin,
      strategy_type: StrategyType.Spot,
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
      collect_fee: false,
      reward_coins: [],
      use_bin_infos: false,
      strategy_type: StrategyType.Spot,
      max_price_slippage: 0.01,
      bin_step,
    }
    const tx = sdk.Position.addLiquidityPayload(addOption)
    tx.setGasBudget(10000000000)
    printTransaction(tx)

    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('🚀 ~ test ~ res:', res)
  })

  test('4 spot strategy  fix coin a open add liquidity', async () => {
    pool = await sdk.Pool.getPool(pool_id)
    const { active_id, bin_step, bin_manager, coin_type_a, coin_type_b } = pool
    console.log('🚀 ~ pool:', pool)

    const lower_bin_id = active_id
    const upper_bin_id = active_id

    const amounts_in_active_bin = await sdk.Position.getActiveBinIfInRange(
      bin_manager.bin_manager_handle,
      lower_bin_id,
      upper_bin_id,
      active_id,
      bin_step
    )

    const coin_amount = toDecimalsAmount(1, 6)

    const calculateOption: CalculateAddLiquidityAutoFillOption = {
      pool_id,
      coin_amount,
      fix_amount_a: true,
      active_id,
      bin_step,
      lower_bin_id,
      upper_bin_id,
      active_bin_of_pool: amounts_in_active_bin,
      strategy_type: StrategyType.Spot,
    }
    const bin_infos = await sdk.Position.calculateAddLiquidityInfo(calculateOption)
    console.log('🚀 ~ test ~ bin_infos:', bin_infos)

    const addOption: OpenAndAddLiquidityOption = {
      pool_id,
      bin_infos: bin_infos,
      coin_type_a,
      coin_type_b,
      active_id,
      use_bin_infos: false,
      strategy_type: StrategyType.Spot,
      max_price_slippage: 0.01,
      bin_step,
      lower_bin_id,
      upper_bin_id,
    }
    const tx = sdk.Position.addLiquidityPayload(addOption)
    tx.setGasBudget(10000000000)
    printTransaction(tx)

    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('🚀 ~ test ~ res:', res)
  })
})
