import { d, printTransaction } from '@cetusprotocol/common-sdk'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import Decimal from 'decimal.js'
import 'isomorphic-fetch'
import { CetusDcaSDK } from '../src/sdk'

describe('DCA Module', () => {
  const sdk = CetusDcaSDK.createSDK({ env: 'mainnet' })

  beforeAll(async () => {
    let send_key_pair = buildTestAccount()
    sdk.setSenderAddress(send_key_pair.getPublicKey().toSuiAddress())
  })

  test('openDcaOrder', async () => {
    const in_coin_type = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI'
    const out_coin_type = '0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::usdc::USDC'
    const cycle_count = 4
    const in_coin_amount = '40000000000'
    const cycle_count_amount = new Decimal(in_coin_amount).div(Math.pow(10, 9)).div(cycle_count)
    const min_price = 0.83854
    const max_price = 2.172898
    const per_cycle_max_out_amount = d(cycle_count_amount).div(d(min_price)).mul(Math.pow(10, 6)).toFixed(0).toString()
    const per_cycle_min_out_amount = d(cycle_count_amount).div(d(max_price)).mul(Math.pow(10, 6)).toFixed(0).toString()
    console.log('🚀🚀🚀 ~ file: dca.test.ts:36 ~ test ~ per_cycle_max_out_amount:', per_cycle_min_out_amount, per_cycle_max_out_amount)

    const payload = await sdk.Dca.dcaOpenOrderPayload({
      in_coin_type,
      out_coin_type,
      in_coin_amount,
      cycle_frequency: 600,
      cycle_count,
      per_cycle_min_out_amount: per_cycle_min_out_amount,
      per_cycle_max_out_amount: per_cycle_max_out_amount,
      per_cycle_in_amount_limit: '9744545921',
      fee_rate: 0,
      timestamp: 1723719298,
      signature:
        '004f1929446176bc982043113c7be68d3bf2b060de1876ca3d472df9bb7f19bcf8cbc4e9d3db8172902a4a60a08405b0acbc5d367b54714f3912aba5e92b7ae1009d14900643e10df9eb3b0fac154df75f1d38650b4a741f4fc6b70a3cf2a9f6be',
    })
    //   const res = await sdk.ClmmSDK.fullClient.devInspectTransactionBlock({ transactionBlock: payload, sender: send_key_pair.toSuiAddress() })
    // console.log('🚀🚀🚀 ~ file: xcetus.test.ts:208 ~ test ~ res:', res)
    printTransaction(payload)
    const result = await sdk.FullClient.sendTransaction(send_key_pair, payload)
    console.log('redeemDividendPayload: ', result)
  })

  test('1 getDcaOrders', async () => {
    const dcaOrderList = await sdk.Dca.getDcaOrders("0x163b88ad540252210b3aceeb37496ac05685f04a37d3c8b7cfa685a574086722")
    console.log('🚀🚀🚀 ~ file: dca.test.ts:61 ~ test ~ dcaOrderList:', dcaOrderList)
  })

  test('withdraw', async () => {
    const in_coin_type = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI'
    const out_coin_type = '0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::usdc::USDC'
    const order_id = '0xa60c763185a84b87380a0a1e7e677df7d102cbe43b8ae428c3b1572c21909ff4'
    const withdrawPayload = await sdk.Dca.withdrawPayload({
      in_coin_type,
      out_coin_type,
      order_id,
    })
    printTransaction(withdrawPayload)
    const result = await sdk.FullClient.sendTransaction(send_key_pair, withdrawPayload)
    console.log('redeemDividendPayload: ', result)
  })

  test('getDcaOrdersMakeDeal', async () => {
    const order_id = '0xfa349d63302951d075c8207376d4bf724b1ce4dab8f5870200a66da94acf5fbd'
    const dcaOrderList = await sdk.Dca.getDcaOrdersMakeDeal(order_id)
    console.log('🚀🚀🚀 ~ file: dca.test.ts:81 ~ test ~ dcaOrderList:', dcaOrderList)
  })

  test('getDcaGlobalConfig', async () => {
    const globalConfig = await sdk.Dca.getDcaGlobalConfig()
    console.log('🚀🚀🚀 ~ file: dca.test.ts:86 ~ test ~ globalConfig:', globalConfig)
  })

  test('getDcaConfigs', async () => {
    const config = await sdk.Dca.getDcaConfigs()
    console.log('🚀🚀🚀 ~ file: dca.test.ts:91 ~ test ~ config:', config)
  })

  test('dcaCloseOrderPayload', async () => {
    const order_id = '0xfc519e9cccf90f4dfdf3008e5294f9d1107e7177545f79c28f305dbd2e1bc07d'
    const in_coin_type = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI'
    const out_coin_type = '0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::usdc::USDC'
    const dcaCloseOrderPayload = await sdk.Dca.dcaCloseOrderPayload([
      {
        order_id,
        in_coin_type,
        out_coin_type,
      },
    ])
    printTransaction(dcaCloseOrderPayload)
    const result = await sdk.FullClient.sendTransaction(send_key_pair, dcaCloseOrderPayload)
    console.log('redeemDividendPayload: ', result)
  })

  test('getDcaCoinWhiteList', async () => {
    const data = await sdk.Dca.getDcaCoinWhiteList(3)
    console.log('🚀🚀🚀 ~ file: dca.test.ts:109 ~ test ~ inCoinList,outCoinList:', data)
  })
})
