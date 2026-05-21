import BN from 'bn.js'
import { assert } from 'console'
import { adjustForSlippage, d, Percentage, printTransaction } from '@cetusprotocol/common-sdk'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import 'isomorphic-fetch'
import { buildTransferCoinToSender, CetusClmmSDK } from '../src'
describe('Swap calculate Module', () => {
  const sdk = CetusClmmSDK.createSDK({ env: 'mainnet' })

  test('fetchTicksByContract', async () => {
    const tickdatas = await sdk.Pool.fetchTicks({
      pool_id: '0xcf994611fd4c48e277ce3ffd4d4364c914af2c3cbb05f7bf6facd371de688630',
      coin_type_a: '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN',
      coin_type_b: '0x2::sui::SUI',
    })
    console.log('fetchTicks: ', tickdatas)
  })

  test('fetchTicksByRpc', async () => {
    const tickdatas = await sdk.Pool.fetchTicksByRpc('0x0a46b7e6de173f9e48b56ec7bd3300c6a55c6fd4cabd3e2fbe7181014a796e40')
    console.log('fetchTicks length: ', tickdatas.length)
  })

  test('getTickDataByIndex', async () => {
    const tickData = await sdk.Pool.getTickDataByIndex('0x0a46b7e6de173f9e48b56ec7bd3300c6a55c6fd4cabd3e2fbe7181014a796e40', 57060)
    console.log('tickData: ', tickData)
  })

  test('getTickDataByObjectId', async () => {
    const tickData = await sdk.Pool.getTickDataByObjectId('0x0037c3e265031351c0557f085998a9e064cb66db4f2e11ef10449525e4769139')
    console.log('tickData: ', tickData)
  })

  test('preSwapWithMultiPool', async () => {
    const a2b = true
    const pool_ids = [
      '0x53d70570db4f4d8ebc20aa1b67dc6f5d061d318d371e5de50ff64525d7dd5bca',
      '0x4038aea2341070550e9c1f723315624c539788d0ca9212dca7eb4b36147c0fcb',
      '0x6fd4915e6d8d3e2ba6d81787046eb948ae36fdfc75dad2e24f0d4aaa2417a416',
    ]
    const pool0 = await sdk.Pool.getPool(pool_ids[0])
    const pool1 = await sdk.Pool.getPool(pool_ids[1])
    const pool2 = await sdk.Pool.getPool(pool_ids[2])
    const byAmountIn = true
    const amount = '10000000'

    const resWithMultiPool = await sdk.Swap.preSwapWithMultiPool({
      pool_ids: pool_ids,
      coin_type_a: pool0.coin_type_a,
      coin_type_b: pool0.coin_type_b,
      a2b,
      by_amount_in: byAmountIn,
      amount,
    })

    for (const pool of [pool0, pool1, pool2]) {
      const res: any = await sdk.Swap.preSwap({
        pool: pool,
        current_sqrt_price: pool.current_sqrt_price,
        coin_type_a: pool.coin_type_a,
        coin_type_b: pool.coin_type_b,
        decimals_a: 6,
        decimals_b: 6,
        a2b,
        by_amount_in: byAmountIn,
        amount,
      })
      console.log('preSwap###res###', res)
    }

    console.log('preSwap###res###', resWithMultiPool)
  })

  test('preSwap', async () => {
    const a2b = false
    const pool = await sdk.Pool.getPool('0x0fea99ed9c65068638963a81587c3b8cafb71dc38c545319f008f7e9feb2b5f8')
    const byAmountIn = false
    const amount = '800000'

    const res: any = await sdk.Swap.preSwap({
      pool: pool,
      current_sqrt_price: pool.current_sqrt_price,
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      decimals_a: 6,
      decimals_b: 6,
      a2b,
      by_amount_in: byAmountIn,
      amount,
    })

    console.log('preSwap###res###', res)
  })

  test('calculateRates', async () => {
    const a2b = false
    const pool = await sdk.Pool.getPool('0xc8d7a1503dc2f9f5b05449a87d8733593e2f0f3e7bffd90541252782e4d2ca20')
    const byAmountIn = false
    const amount = '80000000000000'

    const swapTicks = await sdk.Pool.fetchTicks({
      pool_id: pool.id,
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
    })
    // const swapTicks =  await  sdk.Pool.fetchTicksByRpc(pool.ticks_handle)
    console.log('swapTicks: ', swapTicks.length)

    const res = sdk.Swap.calculateRates({
      decimals_a: 6,
      decimals_b: 6,
      a2b,
      by_amount_in: byAmountIn,
      amount: new BN(amount),
      swap_ticks: swapTicks,
      current_pool: pool,
    })

    console.log('preSwap###res###', {
      estimated_amount_in: res.estimated_amount_in.toString(),
      estimated_amount_out: res.estimated_amount_out.toString(),
      estimated_end_sqrt_price: res.estimated_end_sqrt_price.toString(),
      estimated_fee_amount: res.estimated_fee_amount.toString(),
      is_exceed: res.is_exceed,
      extra_compute_limit: res.extra_compute_limit,
      amount: res.amount.toString(),
      a2b: res.a2b,
      by_amount_in: res.by_amount_in,
    })
  })
})

describe('Swap Module', () => {
  const sdk = CetusClmmSDK.createSDK({ env: 'mainnet' })
  let send_key_pair = buildTestAccount()

  beforeEach(async () => {
    sdk.setSenderAddress(send_key_pair.getPublicKey().toSuiAddress())
  })

  test('swap', async () => {
    const a2b = true
    const byAmountIn = true
    const amount = '10000000'
    const slippage = Percentage.fromDecimal(d(0.1))

    const currentPool = await sdk.Pool.getPool('0x6fd4915e6d8d3e2ba6d81787046eb948ae36fdfc75dad2e24f0d4aaa2417a416')
    console.log('currentPool: ', currentPool)

    const res = await sdk.Swap.preSwap({
      pool: currentPool,
      current_sqrt_price: currentPool.current_sqrt_price,
      coin_type_a: currentPool.coin_type_a,
      coin_type_b: currentPool.coin_type_b,
      decimals_a: 6,
      decimals_b: 6,
      a2b,
      by_amount_in: byAmountIn,
      amount,
    })

    console.log('res', {
      estimated_amount_in: res.estimated_amount_in.toString(),
      estimated_amount_out: res.estimated_amount_out.toString(),
      estimated_end_sqrt_price: res.estimated_end_sqrt_price.toString(),
      estimated_fee_amount: res.estimated_fee_amount.toString(),
      is_exceed: res.is_exceed,
      a2b,
      by_amount_in: res.by_amount_in,
    })

    const toAmount = byAmountIn ? new BN(res.estimated_amount_out) : new BN(res.estimated_amount_in)

    const amountLimit = adjustForSlippage(toAmount, slippage, !byAmountIn)

    let swapPayload = await sdk.Swap.createSwapWithoutTransferCoinsPayload({
      pool_id: currentPool.id,
      a2b,
      by_amount_in: byAmountIn,
      amount: amount.toString(),
      amount_limit: amountLimit.toString(),
      coin_type_a: currentPool.coin_type_a,
      coin_type_b: currentPool.coin_type_b,
    })

    buildTransferCoinToSender(sdk, swapPayload.tx, swapPayload.coin_ab_s[0], currentPool.coin_type_a)
    buildTransferCoinToSender(sdk, swapPayload.tx, swapPayload.coin_ab_s[1], currentPool.coin_type_b)

    printTransaction(swapPayload.tx)
    const transferTxn = await sdk.FullClient.sendTransaction(send_key_pair, swapPayload.tx)
    console.log('swap: ', transferTxn)
  })
})

describe('Swap Module: assert preSwap and calculateRates', () => {
  const sdk = CetusClmmSDK.createSDK({ env: 'mainnet' })
  let send_key_pair = buildTestAccount()

  beforeEach(async () => {
    sdk.setSenderAddress(send_key_pair.getPublicKey().toSuiAddress())
  })

  test('swap', async () => {
    const a2b = true
    const byAmountIn = true
    const amount = '120000000000000000'

    const currentPool = await sdk.Pool.getPool('0x6fd4915e6d8d3e2ba6d81787046eb948ae36fdfc75dad2e24f0d4aaa2417a416')

    const decimalsA = 6
    const decimalsB = 6
    const preSwapRes: any = await sdk.Swap.preSwap({
      pool: currentPool,
      current_sqrt_price: currentPool.current_sqrt_price,
      coin_type_a: currentPool.coin_type_a,
      coin_type_b: currentPool.coin_type_b,
      decimals_a: decimalsA,
      decimals_b: decimalsB,
      a2b,
      by_amount_in: byAmountIn,
      amount,
    })

    console.log('preSwap###res###', preSwapRes)

    const swapTicks = await sdk.Pool.fetchTicks({
      pool_id: currentPool.id,
      coin_type_a: currentPool.coin_type_a,
      coin_type_b: currentPool.coin_type_b,
    })
    // const swapTicks =  await  sdk.Pool.fetchTicksByRpc(pool.ticks_handle)
    console.log('swapTicks: ', swapTicks.length)

    const calculateRatesRes = sdk.Swap.calculateRates({
      decimals_a: decimalsA,
      decimals_b: decimalsB,
      a2b,
      by_amount_in: byAmountIn,
      amount: new BN(amount),
      swap_ticks: swapTicks,
      current_pool: currentPool,
    })

    console.log('preSwap###res###', {
      estimated_amount_in: calculateRatesRes.estimated_amount_in.toString(),
      estimated_amount_out: calculateRatesRes.estimated_amount_out.toString(),
      estimated_end_sqrt_price: calculateRatesRes.estimated_end_sqrt_price.toString(),
      estimated_fee_amount: calculateRatesRes.estimated_fee_amount.toString(),
      is_exceed: calculateRatesRes.is_exceed,
      extra_compute_limit: calculateRatesRes.extra_compute_limit,
      amount: calculateRatesRes.amount.toString(),
      a2b: calculateRatesRes.a2b,
      by_amount_in: calculateRatesRes.by_amount_in,
    })

    assert(preSwapRes.estimated_amount_in.toString() == calculateRatesRes.estimated_amount_in.toString())
    assert(preSwapRes.estimated_amount_out.toString() == calculateRatesRes.estimated_amount_out.toString())
  })
})
