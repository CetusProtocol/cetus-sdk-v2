// buildTestAccount
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import { CetusDlmmSDK } from '../src/sdk'
import { parseCurrentRewardPeriodEmission, parseRewardPeriodEmission } from '../src/utils/parseData'
import { Transaction } from '@mysten/sui/transactions'
import { CoinAssist, printTransaction } from '@cetusprotocol/common-sdk'
import { toB64, toBase64 } from '@mysten/sui/utils'
import BN from 'bn.js'

describe('config', () => {
  const sdk = CetusDlmmSDK.createSDK({ env: 'testnet' })
  let send_key_pair: Ed25519Keypair
  let account: string

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    account = send_key_pair.getPublicKey().toSuiAddress()
    sdk.setSenderAddress(account)
  })

  test('getDlmmGlobalConfig', async () => {
    const res = await sdk.Config.getDlmmGlobalConfig()
    console.log('🚀 ~ test ~ res:', res)
  })

  test('build rawBytes', async () => {
    const tx = new Transaction()

    const zeroCoin = CoinAssist.buildCoinWithBalance(
      BigInt(100),
      '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      tx
    )
    tx.transferObjects([zeroCoin], tx.pure.address(account))
    tx.setSender(account)

    printTransaction(tx)
    // build rawBytes
    const data = await tx.build({ client: sdk.FullClient })
    const rawBytes = toBase64(data)
    console.log('rawBytes: ', rawBytes)
  })

  test('getBinStepConfigList', async () => {
    const res = await sdk.Config.getBinStepConfigList('0xaf104c430fba556e51395aae4088eaee74982eec6b5599ae3302e18878151f74')
    console.log('🚀 ~ test ~ res:', res)
  })

  test('fetchDlmmSdkConfigs', async () => {
    const res = await sdk.Config.fetchDlmmSdkConfigs()
    console.log('🚀 ~ test ~ res:', res)
  })

  test('getPool', async () => {
    const pool = await sdk.Pool.getPool('0x8b131bccc1b4da0b463c19fa8cacdb71fc9f2ff632841769650886db2f0995f8')
    console.log('🚀 ~ test ~ pool:', JSON.stringify(pool, null, 2))
  })

  test('getRewardPeriodEmission', async () => {
    const currentTime = new Date().getTime() / 1000
    const res = await sdk.Reward.getRewardPeriodEmission(
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
})
