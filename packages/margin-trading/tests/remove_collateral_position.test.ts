import { buildTestAccount } from "@cetusprotocol/test-utils"
import CetusMarginTradingSDK from "../src"
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519"
import { d, printTransaction } from "@cetusprotocol/common-sdk"

let send_key_pair: Ed25519Keypair

describe('top up collateral position test', () => {
  const sdk = CetusMarginTradingSDK.createSDK({
    env: 'mainnet',
    full_rpc_url: 'https://fullnode.mainnet.sui.io:443',
  })

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    sdk.setSenderAddress(send_key_pair.toSuiAddress())
  })

  test('getPositionList', async () => {
    const res = await sdk.PositionModules.getPositionList('0x52bfafe1e1022f2ba070f638128f34e8a948eafe5ce778c0702507652cc3f033')
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })


  test('long position top up collateral with base', async () => {
    const payload = await sdk.PositionModules.positionWithdrawCToken({
      position_id: '0xc6d39a5118cfbbfbc741ac7043e614c0dfd9b40cb07fe9f343c1373d137064ec',
      is_quote: true,
      amount: d(0.01).mul(10 ** 6).toString(),
      slippage: 0.05,
      swap_clmm_pool: '',
    })
    printTransaction(payload)
    const res = await sdk.FullClient.executeTx(send_key_pair, payload, false)
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('long position top up collateral with quote', async () => {
    const payload = await sdk.PositionModules.positionWithdrawCToken({
      position_id: '0xc6d39a5118cfbbfbc741ac7043e614c0dfd9b40cb07fe9f343c1373d137064ec',
      is_quote: true,
      amount: d(0.1).mul(10 ** 6).toString(),
      slippage: 0.05,
      swap_clmm_pool: '',
    })
    printTransaction(payload)
    const res = await sdk.FullClient.executeTx(send_key_pair, payload, true)
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('short position top up collateral with quote', async () => {
    const payload = await sdk.PositionModules.positionWithdrawCToken({
      position_id: '0xfe163e9b79229c284dbcba0450aa4f1de62098cffd5cd5a97c526ca89411268d',
      is_quote: true,
      amount: d(0.1).mul(10 ** 6).toString(),
      slippage: 0.05,
      swap_clmm_pool: '',
    })
    printTransaction(payload)
    const res = await sdk.FullClient.executeTx(send_key_pair, payload, true)
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('short position top up collateral with base', async () => {
    const payload = await sdk.PositionModules.positionWithdrawCToken({
      position_id: '0xfe163e9b79229c284dbcba0450aa4f1de62098cffd5cd5a97c526ca89411268d',
      is_quote: false,
      amount: d(0.1).mul(10 ** 9).toString(),
      slippage: 0.05,
      swap_clmm_pool: '',
    })
    printTransaction(payload)
    const res = await sdk.FullClient.executeTx(send_key_pair, payload, true)
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

})