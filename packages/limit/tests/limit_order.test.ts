import { buildTestAccount } from '@cetusprotocol/test-utils'
import 'isomorphic-fetch'
import { LimitOrderStatus, LimitOrderUtils } from '../src'
import { CetusLimitOrderSDK } from '../src/sdk'

const pool = {
  pay_coin_type: '0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::usdc::USDC',
  target_coin_type: '0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::usdt::USDT',
  indexer_id: '0xc420fb32c3dd279d20b55daeb08973e577df5fed1b758b839d4eec22da54bde8',
}

describe('Limit Order Module', () => {
  const sdk = CetusLimitOrderSDK.createSDK({ env: 'mainnet' })

  beforeAll(async () => {
    const send_key_pair = buildTestAccount()
    sdk.setSenderAddress(send_key_pair.getPublicKey().toSuiAddress())
  })

  test('getLimitOrderTokenList', async () => {
    const tokenList = await sdk.LimitOrder.getLimitOrderTokenList()
    console.log('getLimitOrderTokenList: ', tokenList)
  })

  test('getLimitOrderPoolList', async () => {
    const poolList = await sdk.LimitOrder.getLimitOrderPoolList()
    console.log('getLimitOrderPoolList: ', poolList)
  })

  test('1 getLimitOrderPool', async () => {
    const pool = await sdk.LimitOrder.getLimitOrderPool(
      '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN',
      '0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN'
    )
    console.log('getLimitOrderPool: ', pool)
  })

  test('getPoolIndexerId', async () => {
    const id = await sdk.LimitOrder.getPoolIndexerId(
      '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN',
      '0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN'
    )
    console.log('getPoolIndexerId: ', id)
  })

  test('getOwnerLimitOrderList', async () => {
    const orderList = await sdk.LimitOrder.getOwnerLimitOrderList(sdk.getSenderAddress())
    console.log('getOwnerLimitOrderList: ', orderList)
  })

  test('getLimitOrderConfigs', async () => {
    const configs = await sdk.LimitOrder.getLimitOrderConfigs()
    console.log('getLimitOrderConfigs: ', configs)
  })

  test('22 getLimitOrder', async () => {
    const order = await sdk.LimitOrder.getLimitOrder('0xc83fc8deadc78f9b37fd76feb95cffca27719723739f2e04ee43113ead23bff9')
    console.log('order: ', order)
  })

  test('getLimitOrderLogs', async () => {
    const order = await sdk.LimitOrder.getLimitOrderLogs('0xc83fc8deadc78f9b37fd76feb95cffca27719723739f2e04ee43113ead23bff9')
    console.log('order: ', order)
  })

  test('getLimitOrderClaimLogs', async () => {
    const order = await sdk.LimitOrder.getLimitOrderClaimLogs('0x36beadec8493bc637c215978fab01a75e1f81609626af7b0958c7e5eb410dc25')
    console.log('order: ', order)
  })

  test('placeLimitOrder', async () => {
    const pay_coin_amount = 2000000
    const price = 1.7
    const expired_ts = Date.parse(new Date().toString()) + 7 * 24 * 60 * 60 * 1000

    const payload = await sdk.LimitOrder.placeLimitOrder({
      pay_coin_amount,
      price,
      expired_ts,
      pay_coin_type: pool.pay_coin_type,
      target_coin_type: pool.target_coin_type,
      target_decimal: 6,
      pay_decimal: 6,
    })

    const txResult = await sdk.FullClient.executeTx(send_key_pair, payload, false)
    console.log('txResult: ', txResult)
  })

  test('claimTargetCoin', async () => {
    const order = await sdk.LimitOrder.getLimitOrder('0x24aaffb2f9785c110da3b670e0f50e8a30ba679e8dbdc6c15321b46834877818')
    console.log('order: ', order)
    if (order && order.status === LimitOrderStatus.Running) {
      const payload = await sdk.LimitOrder.claimTargetCoin({
        order_id: order.id,
        pay_coin_type: order.pay_coin_type,
        target_coin_type: order.target_coin_type,
      })
      const txResult = await sdk.FullClient.executeTx(send_key_pair, payload, false)
      console.log('txResult: ', txResult)
    }
  })

  test('cancelOrdersByOwner', async () => {
    const order = await sdk.LimitOrder.getLimitOrder('0xcadb63c2ffabd9ef7112cacb92304e660e2ef59af43b30fcf23503444c506ff8')
    console.log('order: ', order)
    if (order && order.status === LimitOrderStatus.Running) {
      const payload = await sdk.LimitOrder.cancelOrdersByOwner([
        {
          order_id: order.id,
          pay_coin_type: order.pay_coin_type,
          target_coin_type: order.target_coin_type,
        },
      ])
      const txResult = await sdk.FullClient.executeTx(send_key_pair, payload, false)
      console.log('txResult: ', txResult)
    }
  })

  test('priceToRate', async () => {
    const rate = LimitOrderUtils.priceToRate(1.7, 6, 9)
    console.log('rate: ', rate)
    const price = LimitOrderUtils.rateToPrice(rate, 6, 9)
    console.log('price: ', price)
  })
})
