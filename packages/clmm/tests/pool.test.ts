import BN from 'bn.js'
import { ClmmPoolUtil, d, isSortedSymbols, normalizeCoinType, printTransaction, TickMath } from '@cetusprotocol/common-sdk'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import 'isomorphic-fetch'
// import { CetusClmmSDK } from '../dist/index.js'
import { CetusClmmSDK } from '../src'
import { CreatePoolCustomRangeParams, FullRangeParams } from '../src/types/clmm_type'
import { buildTransferCoin } from '../src/utils'
import { Pool } from '../src'
import { symbol } from 'valibot'
const fs = require('fs')
const path = require('path')



describe('Pool Module', () => {
  let send_key_pair = buildTestAccount()
  const sdk = CetusClmmSDK.createSDK({ env: 'mainnet' })
  sdk.setSenderAddress(send_key_pair.getPublicKey().toSuiAddress())


  test(' 1 getPoolImmutablesWithPage', async () => {
    const res = await sdk.Pool.getPoolLiquiditySnapshot({ limit: 10 })
    console.log('getPoolImmutablesWithPage####', res)
  })

  test('getClmmConfigs', async () => {
    const configs = await sdk.Pool.getClmmConfigs()
    console.log(configs)
  })

  test('getAllPools', async () => {
    const pools = await sdk.FullClient.fetchCoinMetadata('0xbde4ba4c2e274a60ce15c1cfff9e5c42e41654ac8b6d906a57efa4bd3c29f47d::hasui::HASUI')
    console.log(pools)
  })

  test('getAssignPools', async () => {
    const pools = await sdk.Pool.getAssignPools(["0xb8a67c149fd1bc7f9aca1541c61e51ba13bdded64c273c278e50850ae3bff073"])
    console.log(pools)
  })


  test('getPoolTransactionList', async () => {
    const res = await sdk.Pool.getPoolTransactionList({
      pool_id: '0xb8a67c149fd1bc7f9aca1541c61e51ba13bdded64c273c278e50850ae3bff073',
      pagination_args: {
        limit: 10,
        cursor: undefined,
      },
    })
    console.log('res', res)
  })

  test('getSinglePool', async () => {
    // const pool = await sdk.Pool.getPool('0xcf994611fd4c48e277ce3ffd4d4364c914af2c3cbb05f7bf6facd371de688630')
    const pool = await sdk.Pool.getPool('0xb8a67c149fd1bc7f9aca1541c61e51ba13bdded64c273c278e50850ae3bff073', true, true)
    console.log('pool', pool)
  })

  test('doCreatePools', async () => {
    const tick_spacing = 2
    const initialize_price = 1
    const coin_a_decimals = 6
    const coin_b_decimals = 6
    const coin_type_a = `${sdk.sdkOptions.cetus_config?.package_id}::usdt::USDT`
    const coin_type_b = `{sdk.sdkOptions.faucet?.package_id}::usdc::USDC`

    const createPoolTransactionPayload = await sdk.Pool.createPoolPayload({
      tick_spacing: tick_spacing,
      initialize_sqrt_price: TickMath.priceToSqrtPriceX64(d(initialize_price), coin_a_decimals, coin_b_decimals).toString(),
      uri: '',
      coin_type_a: coin_type_a,
      coin_type_b: coin_type_b,
      fix_amount_a: true,
      amount_a: '100000000',
      amount_b: '100000000',
      tick_lower: -443520,
      tick_upper: 443520,
    })

    printTransaction(createPoolTransactionPayload)
    const transferTxn = await sdk.FullClient.sendTransaction(buildTestAccount(), createPoolTransactionPayload)
    console.log('doCreatePool: ', transferTxn)
  })

  test('get partner ref fee', async () => {
    const refFee = await sdk.Pool.getPartnerRefFeeAmount('0x0c1e5401e40129da6a65a973b12a034e6c78b7b0b27c3a07213bc5ce3fa3d881')
    console.log('ref fee:', refFee)
  })

  test('claim partner ref fee', async () => {
    const partnerCap = 'xxx'
    const partner = 'xxx'
    const claimRefFeePayload = await sdk.Pool.claimPartnerRefFeePayload(partnerCap, partner, '0x2::sui::SUI')
    const transferTxn = await sdk.FullClient.sendTransaction(buildTestAccount(), claimRefFeePayload)
    console.log('doCreatePool: ', JSON.stringify(transferTxn))
  })

  test('claim all partner ref fees', async () => {
    const partnerCap = '0x..'
    const partner = '0x..'

    const { ref_fees, tx } = await sdk.Pool.claimAllPartnerRefFeesPayload(partner, partnerCap)

    console.log('All ref fees:', ref_fees)
    console.log('Total ref fee types:', ref_fees.length)

    const claimableRefFees = ref_fees.filter((fee) => fee.balance > BigInt(0))
    console.log('Claimable ref fees:', claimableRefFees.length)

    if (claimableRefFees.length > 0) {
      console.log('Claimable ref fee details:')
      claimableRefFees.forEach((fee) => {
        console.log(`  - ${fee.coin_type}: ${fee.balance}`)
      })

      const transferTxn = await sdk.FullClient.sendSimulationTransaction(tx, '0x..')
      console.log('Claim all ref fees transaction:', JSON.stringify(transferTxn))
    } else {
      console.log('No claimable ref fees (all balances are 0)')
    }
  })

  test('get pool by coin types', async () => {
    const coinA = '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN'
    const coinB = '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN'

    const pools = await sdk.Pool.getPoolByCoins([coinA, coinB])
    expect(pools.length).toBeGreaterThan(0)

    const coinC = '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN'
    const coinD = '0x2::sui::SUI'

    const pools2 = await sdk.Pool.getPoolByCoins([coinC, coinD])
    expect(pools2.length).toBeGreaterThan(0)

    const coinE = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI'

    const pools3 = await sdk.Pool.getPoolByCoins([coinC, coinE])
    expect(pools3.length).toEqual(pools2.length)

    const coinCetus = '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS'
    const coinBlub = '0xfa7ac3951fdca92c5200d468d31a365eb03b2be9936fde615e69f0c1274ad3a0::BLUB::BLUB'

    const pools4 = await sdk.Pool.getPoolByCoins([coinCetus, coinBlub])
    console.log('pools4', pools4)
    expect(pools4.length).toEqual(pools2.length)
  })

  test('ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts: ', () => {
    const lowerTick = -74078
    const upperTick = -58716
    const currentSqrtPrice = '979448777168348479'
    const coinAmountA = new BN(100000000)
    const { coin_amount_b } = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
      lowerTick,
      upperTick,
      coinAmountA,
      true,
      true,
      0,
      new BN(currentSqrtPrice)
    )
  })

  test('isSortedSymbols', () => {
    const p = isSortedSymbols(
      '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT',
      '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'
    )
    console.log('🚀🚀🚀 ~ file: pool.test.ts:145 ~ test ~ p:', p)
  })


  test(' getPoolAddress', async () => {

    const poolId = await sdk.Pool.getPoolAddress("0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS",
      "0x2::sui::SUI", 2)
    console.log('🚀🚀🚀 ~ file: pool.test.ts:179 ~ test ~ poolId:', poolId)
  })

  test('buildPoolKey rejects invalid coin order', () => {
    expect(() =>
      sdk.Pool.buildPoolKey('0x2::sui::SUI', '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC', 60)
    ).toThrow()
  })

  test('createPoolTransactionPayload', async () => {
    const payload = await sdk.Pool.createPoolPayload({
      tick_spacing: 220,
      initialize_sqrt_price: '18446744073709551616',
      uri: '',
      fix_amount_a: true,
      amount_a: '100000000',
      amount_b: '100000000',
      coin_type_a: '0xbde4ba4c2e274a60ce15c1cfff9e5c42e41654ac8b6d906a57efa4bd3c29f47d::hasui::HASUI',
      coin_type_b: '0x2::sui::SUI',
      tick_lower: -443520,
      tick_upper: 443520,
    })
    const cPrice = TickMath.sqrtPriceX64ToPrice(new BN('184467440737095516'), 9, 6)
    console.log('🚀🚀🚀 ~ file: pool.test.ts:168 ~ test ~ cPrice:', cPrice.toString())
    printTransaction(payload)
    const transferTxn = await sdk.FullClient.dryRunTransactionBlock({
      transactionBlock: await payload.build({ client: sdk.FullClient }),
    })

    console.log('🚀🚀🚀 ~ file: pool.test.ts:168 ~ test ~ transferTxn:', transferTxn)
  })

  test('createPoolTransactionRowPayload', async () => {
    const coinTypeA = '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS'
    const coinTypeB = '0xfa7ac3951fdca92c5200d468d31a365eb03b2be9936fde615e69f0c1274ad3a0::BLUB::BLUB'

    const { tx, pos_id, remain_coin_a, remain_coin_b, remain_coin_type_a, remain_coin_type_b } = await sdk.Pool.createPoolRowPayload({
      tick_spacing: 20,
      initialize_sqrt_price: '31366801070720067977',
      uri: '',
      fix_amount_a: true,
      amount_a: '100000000',
      amount_b: '1000000000',
      coin_type_a: coinTypeA,
      coin_type_b: coinTypeB,
      tick_lower: -440000,
      tick_upper: 440000,
    })
    const cPrice = TickMath.sqrtPriceX64ToPrice(new BN('184467440737095516'), 0, 9)
    console.log('🚀🚀🚀 ~ file: pool.test.ts:168 ~ test ~ cPrice:', cPrice.toString())
    printTransaction(tx)

    buildTransferCoin(sdk, tx, remain_coin_a, remain_coin_type_a)
    buildTransferCoin(sdk, tx, remain_coin_b, remain_coin_type_b)

    tx.transferObjects([pos_id], sdk.getSenderAddress())
    const transferTxn = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('doCreatePool: ', transferTxn)
  })

  test('custom price range create pool return position', async () => {
    const tick_spacing = 220
    const modeParams: CreatePoolCustomRangeParams = {
      is_full_range: false,
      min_price: '0.2',
      max_price: '0.7',
    }
    const result = await sdk.Pool.calculateCreatePoolWithPrice({
      tick_spacing,
      current_price: '0.5',
      coin_amount: '1000000',
      fix_amount_a: true,
      add_mode_params: modeParams,
      coin_decimals_a: 6,
      coin_decimals_b: 9,
      price_base_coin: 'coin_a',
      slippage: 0.05,
    })
    console.log('🚀 ~ test ~ result:', result)

    const coin_type_a = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'
    const coin_type_b = '0x2::sui::SUI'

    const { tx, pos_id, remain_coin_a, remain_coin_b, remain_coin_type_a, remain_coin_type_b } =
      await sdk.Pool.createPoolWithPriceReturnPositionPayload({
        tick_spacing,
        calculate_result: result,
        add_mode_params: modeParams,
        coin_type_a,
        coin_type_b,
      })

    buildTransferCoin(sdk, tx, remain_coin_a, remain_coin_type_a)
    buildTransferCoin(sdk, tx, remain_coin_b, remain_coin_type_b)

    tx.transferObjects([pos_id], sdk.getSenderAddress())
    const transferTxn = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('doCreatePool: ', transferTxn)
  })

  test('full price range create pool', async () => {
    const tick_spacing = 220
    const modeParams: FullRangeParams = {
      is_full_range: true,
    }

    const result = await sdk.Pool.calculateCreatePoolWithPrice({
      tick_spacing,
      current_price: '0.5',
      coin_amount: '1000000',
      fix_amount_a: true,
      add_mode_params: modeParams,
      coin_decimals_a: 6,
      coin_decimals_b: 9,
      price_base_coin: 'coin_a',
      slippage: 0.05,
    })
    console.log('🚀 ~ test ~ result:', result)

    const coin_type_a = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'
    const coin_type_b = '0x2::sui::SUI'

    const tx = await sdk.Pool.createPoolWithPricePayload({
      tick_spacing,
      calculate_result: result,
      add_mode_params: modeParams,
      coin_type_a,
      coin_type_b,
    })

    const transferTxn = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('doCreatePool: ', transferTxn)
  })
})
