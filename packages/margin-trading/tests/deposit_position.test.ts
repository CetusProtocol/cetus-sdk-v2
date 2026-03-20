import { buildTestAccount } from '@cetusprotocol/test-utils'
import CetusMarginTradingSDK from '../src'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { d, printTransaction } from '@cetusprotocol/common-sdk'

let send_key_pair: Ed25519Keypair

const SUI_COIN_TYPE = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI'
const USDC_COIN_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'
describe('deposit position test', () => {
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
    const res = await sdk.PositionModules.getPositionList('0x52bfafe1e1022f2ba070f638128f34e8a948eafe5ce778c0702507652cc3f033')
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('getPositionInfo', async () => {
    const res = await sdk.PositionModules.getPositionInfo('0xc6d39a5118cfbbfbc741ac7043e614c0dfd9b40cb07fe9f343c1373d137064ec')
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('long position calculatePositionDeposit', async () => {
    const res = await sdk.PositionModules.calculatePositionDeposit({
      market_id: '0x7c62cbfa1884c02eec32cfa6a1e4325550fb6dda9579b030c3bae3031b80e0e4',
      is_long: true,
      is_quote: false,
      amount: '1000000000',
      leverage: 1.40,
      slippage: 0.005,
      by_amount_in: true,
      base_token: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
      quote_token: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      is_open: false,
      position_id: '0x475f09ee05eff54fdcbaad64bf23ed8500a1cf4a68c496423daa6a475311c3ec',
    })
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('long position deposit with base', async () => {
    const payload = await sdk.PositionModules.positionDeposit({
      position_id: '0x475f09ee05eff54fdcbaad64bf23ed8500a1cf4a68c496423daa6a475311c3ec',
      is_quote: false,
      amount: d(1)
        .mul(10 ** 9)
        .toString(),
      slippage: 0.01,
      swap_clmm_pool: '',
      leverage: 1.5,
    })
    printTransaction(payload)
    const res = await sdk.FullClient.executeTx(send_key_pair, payload, false)
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('long position deposit with quote', async () => {
    const payload = await sdk.PositionModules.positionDeposit({
      position_id: '0xc6d39a5118cfbbfbc741ac7043e614c0dfd9b40cb07fe9f343c1373d137064ec',
      is_quote: true,
      amount: d(1)
        .mul(10 ** 6)
        .toString(),
      slippage: 0.01,
      swap_clmm_pool: '',
      leverage: 1.5,
    })
    // printTransaction(payload)
    const res = await sdk.FullClient.executeTx(send_key_pair, payload, true)
    // console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('short position deposit with quote', async () => {
    const payload = await sdk.PositionModules.positionDeposit({
      position_id: '0xfe163e9b79229c284dbcba0450aa4f1de62098cffd5cd5a97c526ca89411268d',
      is_quote: true,
      amount: d(0.5)
        .mul(10 ** 6)
        .toString(),
      slippage: 0.01,
      swap_clmm_pool: '',
      leverage: 1.5,
    })
    printTransaction(payload)
    const res = await sdk.FullClient.executeTx(send_key_pair, payload, true)
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('short position deposit with quote', async () => {
    const payload = await sdk.PositionModules.positionDeposit({
      position_id: '0xfe163e9b79229c284dbcba0450aa4f1de62098cffd5cd5a97c526ca89411268d',
      is_quote: false,
      amount: d(0.1)
        .mul(10 ** 9)
        .toString(),
      slippage: 0.01,
      swap_clmm_pool: '',
      leverage: 1.5,
    })
    printTransaction(payload)
    const res = await sdk.FullClient.executeTx(send_key_pair, payload, true)
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })
})
