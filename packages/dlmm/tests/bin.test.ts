// buildTestAccount
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import { CetusDlmmSDK } from '../src/sdk'
import { BinUtils } from '../src/utils/binUtils'
import { Transaction } from '@mysten/sui/transactions'
import { asUintN, d, printTransaction } from '@cetusprotocol/common-sdk'
import { CalculateAddLiquidityOption, StrategyType } from '../src/types/dlmm'
import { safeMulAmount } from '../src/utils'

describe('dlmm bin', () => {
  const sdk = CetusDlmmSDK.createSDK({ env: 'mainnet' })
  let send_key_pair: Ed25519Keypair
  let account: string

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    account = send_key_pair.getPublicKey().toSuiAddress()
    sdk.setSenderAddress(account)
  })

  test('getBinIdFromPrice', async () => {
    const binId = BinUtils.getBinIdFromPrice(d(1).div('0.0013360404960738484928').toString(), 20, false, 9, 6)
    console.log('🚀 ~ test ~ binId:', binId)
  })

  test('getPriceFromBinId', async () => {
    const price = BinUtils.getPriceFromBinId(1113, 400, 6, 6)
    console.log('🚀 ~ test ~ price:', price)
  })

  test('getPricePerLamportFromQPrice', async () => {
    const q_price = BinUtils.getQPriceFromId(-4400, 100)
    console.log('🚀 ~ test ~ q_price:', q_price)
    const price_per_lamport = BinUtils.getPricePerLamportFromQPrice(q_price)
    console.log('🚀 ~ test ~ price_per_lamport:', price_per_lamport)
  })

  test('getPositionCount', async () => {
    const positionCount = BinUtils.getPositionCount(-750, 845)
    console.log('🚀 ~ test ~ positionCount:', positionCount)
  })

  test('getLiquidity', async () => {
    const liquidity = BinUtils.getLiquidity('0', '266666', '18431994054197767090')
    console.log('🚀 ~ test ~ liquidity:', liquidity)
  })

  test('getAmountAFromLiquidity', async () => {
    const amountA = BinUtils.getAmountAFromLiquidity('4101094304427826916657468', '18461505896777422276')
    console.log('🚀 ~ test ~ amountA:', amountA)
  })

  test('getAmountBFromLiquidity', async () => {
    const amountB = BinUtils.getAmountBFromLiquidity('4919119455159831291232256')
    console.log('🚀 ~ test ~ amountB:', amountB)
  })

  test('calculateAddLiquidityInfo', async () => {
    // const calculateOption: CalculateAddLiquidityOption = {
    //   amount_a: '100000000',
    //   amount_b: '100000000',
    //   active_id: 0,
    //   bin_step: 2,
    //   lower_bin_id: 0,
    //   upper_bin_id: 70,
    //   amount_a_in_active_bin: '0',
    //   amount_b_in_active_bin: '0',
    //   strategy_type: StrategyType.Spot,
    // }
    // const bin_infos = sdk.Position.calculateAddLiquidityInfo(calculateOption)
    // console.log('🚀 ~ test ~ split_bin_infos:', bin_infos.bins.length)
    // const split_bin_infos = BinUtils.splitBinLiquidityInfo(bin_infos, 0, 70)
    // console.log('🚀 ~ test ~ split_bin_infos:', split_bin_infos.length)

    const calculateOption = {
      active_bin_of_pool: undefined,
      active_id: 2290,
      pool_id: '0x556d4a393ce033ba4ee77980b70b63ca7b824752583e51103c15e4038cc96e44',
      amount_a: '0',
      amount_b: '1000000000',
      bin_step: 25,
      lower_bin_id: 2273,
      strategy_type: 0,
      upper_bin_id: 2273
    }

    const bin_infos = await sdk.Position.calculateAddLiquidityInfo(calculateOption)
    console.log("🚀 ~ bin_infos:", JSON.stringify(bin_infos, null, 2))
  })

  test('findMinMaxBinId', async () => {
    console.log('bin step 10 : ', BinUtils.findMinMaxBinId(10))
  })
})
