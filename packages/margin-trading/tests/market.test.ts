import { buildTestAccount } from '@cetusprotocol/test-utils'
import CetusLeverageSDK from '../src'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { d, printTransaction } from '@cetusprotocol/common-sdk'
let send_key_pair: Ed25519Keypair

describe('market Module', () => {
  const sdk = CetusLeverageSDK.createSDK({
    env: 'mainnet',
    full_rpc_url: 'https://fullnode.mainnet.sui.io:443',
  })
  sdk.senderAddress = '0x13f54eaa1844636b2d16321f11b6e6a87b32ff94171ad26ba59c40b5f0e5fc0b'

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    sdk.setSenderAddress(send_key_pair.toSuiAddress())
  })

  test('createMarket', async () => {
    const tx = await sdk.MarketModules.createMarket({
      base_token: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
      quote_token: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      open_fee_rate: '0',
      close_fee_rate: '0',
    })
    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('🚀🚀🚀 ~ market.test.ts:31 ~ res:', res)
  })

  test('updateMarketFeeRate', async () => {
    const tx = await sdk.MarketModules.updateMarketFeeRate({
      market_id: '0xe87a2d7bfc425877d3b7a7d19447e46d05448a157147a2e04059ec9551e58586',
      open_fee_rate: '0',
      close_fee_rate: '600',
    })
    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('🚀🚀🚀 ~ market.test.ts:26 ~ res:', res)
  })

  test('claimMarketFees', async () => {
    const tx = await sdk.MarketModules.claimMarketFees('0x4c951aa269cd15d7640e8d832e1b53262b161df59f6a9d8d9d7342c26d81e03f')
    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('🚀🚀🚀 ~ market.test.ts:59 ~ res:', res)
  })

  test('claimAllMarketFees', async () => {
    const tx = await sdk.MarketModules.claimAllMarketFees(['0x4c951aa269cd15d7640e8d832e1b53262b161df59f6a9d8d9d7342c26d81e03f'])
    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('🚀🚀🚀 ~ market.test.ts:69 ~ res:', res)
  })

  test('getMarketList', async () => {
    const res = await sdk.MarketModules.getMarketList()
    console.log('🚀🚀🚀 ~ market.test.ts:49 ~ res:', res)
  })

  test('getMarketInfo', async () => {
    const res = await sdk.MarketModules.getMarketInfo('0x1979cb9d97355baf7c3cc628029335804a9e0e23167f1996adee06dd24812523')
    console.log('🚀🚀🚀 ~ market.test.ts:79 ~ res:', res)
  })

  test('getMarketSuilendInfo', async () => {
    const res = await sdk.MarketModules.getMarketSuilendInfo('0xa828a9057a4c0c9bdc034ded6e9164b52fd85c04d076e05158246302fd7eaccb')
    console.log('🚀🚀🚀 ~ market.test.ts:84 ~ res:', res)
  })
})
