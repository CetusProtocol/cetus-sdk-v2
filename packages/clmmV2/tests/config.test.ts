// buildTestAccount
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import { CetusClmmV2SDK } from '../src/sdk'
import { Transaction } from '@mysten/sui/transactions'
import { CoinAssist, d, printTransaction } from '@cetusprotocol/common-sdk'
import { toB64, toBase64 } from '@mysten/sui/utils'
import BN from 'bn.js'
import { parseCurrentRewardPeriodEmission, parseRewardPeriodEmission } from '../src/utils/common'
import { get_base_fee, get_base_fee_by_period, get_max_base_fee, get_min_base_fee, get_variable_fee } from '../src/utils/fee'
// pnpm test -- packages/clmmV2/tests/config.test.ts -t getFeeTiers
describe('config', () => {
  const sdk = CetusClmmV2SDK.createSDK({ env: 'mainnet' })
  const sdk = CetusClmmV2SDK.createSDK({ env: 'mainnet' })
  let send_key_pair: Ed25519Keypair
  let account: string

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    account = send_key_pair.getPublicKey().toSuiAddress()
    sdk.setSenderAddress(account)
  })

  test('getClmmGlobalConfig', async () => {
    const res = await sdk.Config.getClmmGlobalConfig()
    console.log('🚀 ~ test ~ res:', res)
  })


  test('getFeeTiers', async () => {
    const res = await sdk.Config.getFeeTiersByTickSpacing("0x4779be840fb6b24674401b409eda37b45aef4e40cbcd311d760ba5e805e6b386")
    console.log('🚀 ~ test ~ res:', JSON.stringify(res, null, 2))
  })

  test('getClmmConfigs', async () => {
    const res = await sdk.Config.getClmmConfigs()
    console.log('🚀 ~ test ~ res:', res)
  })

  test('getDynamicFees', async () => {
    const res = await sdk.Config.getDynamicFees("0x4083e6093c4204620cc9c6a655117a2dd364169dd7a58f85f57a41bafcf42d4c")
    console.log('🚀 ~ test ~ res:', JSON.stringify(res, null, 2))
  })


  test('getRewardPeriodEmission', async () => {
    const currentTime = new Date().getTime() / 1000
    const res = await sdk.Rewarder.getRewardPeriodEmission(
      '0x59fbe11899d46c36b597b9899d86f62b880f0aa05727e25454a1158a52bf290d',
      '22080.13295225819507789012012891061154107319453032687306404113769',
      1756354616
    )
    console.log('🚀 ~ test ~ res:', JSON.stringify(res, null, 2))
    const result = parseRewardPeriodEmission(res, currentTime, currentTime + 60 * 60 * 24 * 20, 60 * 60 * 24)
    console.log('🚀 ~ test ~ result:', JSON.stringify(result, null, 2))
    const currentEmission = parseCurrentRewardPeriodEmission(res)
    console.log('🚀 ~ test ~ currentEmission:', currentEmission)
  })


  test('test_get_base_fee_linear_scheduler', async () => {
    const pool = await sdk.Pool.getPool('0x33c787c644d4d7a7db7112b5e0be6a6f014d41a7c4b786a40c615cfdd26d84a3')
    const feeScheduler = pool.fee_manager.fee_scheduler!
    const maxBaseFee = get_max_base_fee(feeScheduler)
    const minBaseFee = get_min_base_fee(feeScheduler)
    const feeTierRaw = get_base_fee_by_period(feeScheduler, Number(feeScheduler.number_of_period))
    const feeTier = d(feeTierRaw).div(1_000_000_000)
    const variableFee = get_variable_fee(pool.fee_manager.dynamic_fee!)

    console.log('🚀 ~ test ~ res:', pool, maxBaseFee, minBaseFee, feeTierRaw, feeTier, variableFee)
  })
})
