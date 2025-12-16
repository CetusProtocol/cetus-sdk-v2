import BN from 'bn.js'
import { adjustForCoinSlippage, ClmmPoolUtil, Percentage, printTransaction, TickMath } from '@cetusprotocol/common-sdk'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import 'isomorphic-fetch'
import CetusClmmSDK from '../src'
import { bcs } from '@mysten/sui/bcs'

const poolId = '0xb8d7d9e66a60c239e7a60110efcf8de6c705580ed924d0dde141f4a0e2c90105'
const position_nft_id = '0xcf995f40b0f9c40a8b03e0b9d9554fea2bc12a18fe63db3a04c59c46be5c10be'
describe('Position add Liquidity Module', () => {
  let send_key_pair = buildTestAccount()
  const sdk = CetusClmmSDK.createSDK({ env: 'mainnet' })
  sdk.setSenderAddress(send_key_pair.getPublicKey().toSuiAddress())

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
  })

  test('get owner position list', async () => {
    const res = await sdk.Position.getPositionList(sdk.getSenderAddress(), [])
    console.log('getPositionList####', res)
    expect(res.length).toBeGreaterThan(0)
  })

  test('get position event list', async () => {
    const res = await sdk.Position.getPositionTransactionList({
      pos_id: '0x568e0062a77626312e18fde331750cd8743245877ec75562b1c5165ab87f4a8f',
    })
    console.log('getPositionList####', res.data)
    expect(res.data.length).toBeGreaterThan(0)
  })

  test('get pool position list', async () => {
    const pool = await sdk.Pool.getPool('0xd4573bdd25c629127d54c5671d72a0754ef47767e6c01758d6dc651f57951e7d')
    console.log('pool', pool)
    const res = await sdk.Pool.getPositionList(pool.position_manager.positions_handle)
    console.log('getPositionList####', res)
  })

  test('getPositionById', async () => {
    const res = await sdk.Position.getPositionById('0x4c1c8f183230929d4300bb380563ed6756578db14f8b63784e2b6ae1679d7f1a')
    console.log('getPositionById###', res)
  })

  test('getSimplePosition', async () => {
    const res = await sdk.Position.getSimplePosition(position_nft_id)
    console.log('getSimplePosition####', res)
  })

  test('111 getPositionInfoList', async () => {
    const pos_id = '0x59c5d04778b40c333fdbef58c49357b06c599db7d885687f1cbdaea3c872293e'
    const pos = await sdk.Position.getPositionById(pos_id, false)
    console.log('pos', pos)
    const pool = await sdk.Pool.getPool(pos.pool)
    const parentId = pool.position_manager.positions_handle
    const res = await sdk.Position.getPositionInfoList([
      {
        position_handle: parentId,
        position_ids: [pos_id],
      },
    ])
    console.log('getObject####', res[0])
  })

  test('calculateFee', async () => {
    const res = await sdk.Position.fetchPosFeeAmount([
      {
        pool_id: '0xb8d7d9e66a60c239e7a60110efcf8de6c705580ed924d0dde141f4a0e2c90105',
        position_id: '0xcf995f40b0f9c40a8b03e0b9d9554fea2bc12a18fe63db3a04c59c46be5c10be',
        coin_type_a: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
        coin_type_b: '0x2::sui::SUI',
      },
    ])
    console.log('calculateFee####', res)
  })

  test('fetchPoolPositionInfoList', async () => {
    const pool = await sdk.Pool.getPool('0xb8d7d9e66a60c239e7a60110efcf8de6c705580ed924d0dde141f4a0e2c90105')
    const res = await sdk.Pool.fetchPoolPositionInfoList({
      pool_id: '0xb8d7d9e66a60c239e7a60110efcf8de6c705580ed924d0dde141f4a0e2c90105',
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
    })

    console.log('getPosition####', res)
  })

  test('open position', async () => {
    const pool = await sdk.Pool.getPool(poolId)
    const lowerTick = TickMath.getPrevInitializeTickIndex(new BN(pool.current_tick_index).toNumber(), new BN(pool.tick_spacing).toNumber())
    const upperTick = TickMath.getNextInitializeTickIndex(new BN(pool.current_tick_index).toNumber(), new BN(pool.tick_spacing).toNumber())

    const openPositionPayload = sdk.Position.openPositionPayload({
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      tick_lower: lowerTick.toString(),
      tick_upper: upperTick.toString(),
      pool_id: pool.id,
    })

    printTransaction(openPositionPayload)

    const transferTxn = await sdk.FullClient.executeTx(send_key_pair, openPositionPayload, true)
    console.log('open position: ', JSON.stringify(transferTxn, null, 2))
  })

  test('close position', async () => {
    const pool = await sdk.Pool.getPool(poolId)
    const position = await sdk.Position.getPositionById(position_nft_id)

    const lowerTick = Number(position.tick_lower_index)
    const upperTick = Number(position.tick_upper_index)

    const lowerSqrtPrice = TickMath.tickIndexToSqrtPriceX64(lowerTick)
    const upperSqrtPrice = TickMath.tickIndexToSqrtPriceX64(upperTick)

    const liquidity = new BN(position.liquidity)
    const slippageTolerance = new Percentage(new BN(5), new BN(100))
    const curSqrtPrice = new BN(pool.current_sqrt_price)

    const coinAmounts = ClmmPoolUtil.getCoinAmountFromLiquidity(liquidity, curSqrtPrice, lowerSqrtPrice, upperSqrtPrice, false)
    const { coin_amount_limit_a, coin_amount_limit_b } = adjustForCoinSlippage(coinAmounts, slippageTolerance, false)

    const rewardCoinTypes = pool.rewarder_infos.map((rewarder) => rewarder.coin_type)

    const closePositionPayload = await sdk.Position.closePositionPayload({
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      min_amount_a: coin_amount_limit_a.toString(),
      min_amount_b: coin_amount_limit_b.toString(),
      rewarder_coin_types: [...rewardCoinTypes],
      pool_id: pool.id,
      pos_id: position_nft_id,
      collect_fee: true,
    })

    printTransaction(closePositionPayload)

    const transferTxn = await sdk.FullClient.executeTx(send_key_pair, closePositionPayload, true)
    console.log('close position: ', transferTxn)
  })

  test('collect_fee', async () => {
    const pool = await sdk.Pool.getPool(poolId)
    const collectFeePayload = await sdk.Position.collectFeePayload({
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      pool_id: pool.id,
      pos_id: position_nft_id,
    })

    const transferTxn = await sdk.FullClient.executeTx(send_key_pair, collectFeePayload, true)
    console.log('collect_fee: ', transferTxn)
  })
})
