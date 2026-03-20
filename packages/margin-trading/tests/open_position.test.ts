import { buildTestAccount } from '@cetusprotocol/test-utils'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { d, printTransaction } from '@cetusprotocol/common-sdk'
import { calcIncrementalLeverage } from '../src/utils/suiLend'
import { CetusMarginTradingSDK } from '../src/sdk'

let send_key_pair: Ed25519Keypair

describe('open position test', () => {
  const sdk = CetusMarginTradingSDK.createSDK({
    env: 'mainnet',
    full_rpc_url: 'https://fullnode.mainnet.sui.io:443',
  })

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    sdk.setSenderAddress(send_key_pair.toSuiAddress())

    sdk.setLeverageThresholdForMarket('0x7c62cbfa1884c02eec32cfa6a1e4325550fb6dda9579b030c3bae3031b80e0e4', {
      long_threshold: 1.65,
      short_threshold: 1.7,
    })
  })

  test('getPositionList', async () => {
    const res = await sdk.PositionModules.getPositionList('0xc5cea39da987d8fe16bf0c6db51bfbf4897aef0edf9588e035ae175ac416fdd1')
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('calcIncrementalLeverage', async () => {
    const res = calcIncrementalLeverage("15", "7.5", "10", "1.5", "1", "1.1")
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('open long position with base', async () => {
    const payload = await sdk.PositionModules.openPosition({
      market_id: '0x7c62cbfa1884c02eec32cfa6a1e4325550fb6dda9579b030c3bae3031b80e0e4',
      is_long: true,
      is_quote: true,
      amount: d(0.2)
        .mul(10 ** 6)
        .toString(),
      leverage: 1.2,
      slippage: 0.01,
    })
    printTransaction(payload)
    const res = await sdk.FullClient.executeTx(send_key_pair, payload, false)
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('open long position with quote', async () => {
    const payload = await sdk.PositionModules.openPosition({
      market_id: '0xb906d310417a2803187a575b0b7211e9fb11dc14decec60d1ec0762bd3b16ff4',
      is_long: true,
      is_quote: true,
      amount: d(1)
        .mul(10 ** 6)
        .toString(),
      leverage: 2.0,
      slippage: 0.01,
    })
    printTransaction(payload)
    const res = await sdk.FullClient.executeTx(send_key_pair, payload, true)
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('open short position with quote', async () => {
    const payload = await sdk.PositionModules.openPosition({
      market_id: '0xb906d310417a2803187a575b0b7211e9fb11dc14decec60d1ec0762bd3b16ff4',
      is_long: false,
      is_quote: true,
      amount: d(0.5)
        .mul(10 ** 6)
        .toString(),
      leverage: 1.5,
      slippage: 0.01,
    })
    printTransaction(payload)
    const res = await sdk.FullClient.executeTx(send_key_pair, payload, true)
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('open short position with base', async () => {
    const payload = await sdk.PositionModules.openPosition({
      market_id: '0xa828a9057a4c0c9bdc034ded6e9164b52fd85c04d076e05158246302fd7eaccb',
      is_long: false,
      is_quote: false,
      amount: d(10)
        .mul(10 ** 6)
        .toString(),
      leverage: 2.0,
      slippage: 0.01,
    })
    // printTransaction(payload)
    // const res = await sdk.FullClient.executeTx(send_key_pair, payload, true)
    // console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('getLendingMarketData', async () => {
    const res = await sdk.SuiLendModule.getLendingMarketData()
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })
})
