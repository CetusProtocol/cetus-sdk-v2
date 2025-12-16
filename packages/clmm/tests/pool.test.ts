import BN from 'bn.js'
import { ClmmPoolUtil, d, isSortedSymbols, normalizeCoinType, printTransaction, TickMath } from '@cetusprotocol/common-sdk'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import 'isomorphic-fetch'
// import { CetusClmmSDK } from '../dist/index.js'
import { CetusClmmSDK } from '../src'
import { CreatePoolCustomRangeParams, FullRangeParams } from '../src/types/clmm_type'
import { buildTransferCoin } from '../src/utils'
import { SuiClient } from '@mysten/sui/client'
import { Pool } from '../src'
import { symbol } from 'valibot'
const fs = require('fs')
const path = require('path')

// import { buildTransferCoin, PositionUtils } from '../dist/index.js'
// import { CreatePoolCustomRangeParams, FullRangeParams } from '../dist/index.js'

const poolId = '0xb8d7d9e66a60c239e7a60110efcf8de6c705580ed924d0dde141f4a0e2c90105'
const formatCoinAdress = (address: string) => {
  return normalizeCoinType(address) === '0x2::sui::SUI'
    ? '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI'
    : normalizeCoinType(address)
}

// test pool id testnet
// const poolsId = [
//   '0xee53b32831292be825a66d071416ace96879241d79ce78641a6c2031ce0653f1',
//   '0xf51541621a6c69b65dd740f96ff8946cb589f4715ad24abd10a7ae1093655713',
//   '0x149a9dcc78464dfd07c9938b7309ba52c0b7f778454d14deb34bcc62845cfeb7',
//   '0xdd83e7fbee4f22b28c212d108379435f299dcc47cd0e4cd196cecb6a78e439d1',
//   '0x13f207b50d553a2ee5e921efe25bb31a258b71b2b67f84eafd742f609b873296',
//   '0x393079af9ebd4d9fad01a7b0d91eae89b7a50289b8d9846650fe44a4b55d3c92',
//   '0xec5dbeef2798f13740535c90ccbd622cead7c2081199312bd254bf2e8454c4d7',
//   '0x358937f51deb8470d63cb7e987d112c96e1f0b867d3b95639ce4f3e4b5581b40',
//   '0x94f09265cb439a472b2edba2a32e99febd3ef5aab5524adc027849a05cab4324',
//   '0x68545f551711c222a0bc257c8f76724a1f1f6afb1f3dcfd264a313b5500fcd34',
//   '0x892ef3bff004988c1ee0fae92ac819fc2846f4a56e9a9e9954f9f180aa4a113b',
//   '0x0ed9767b3175682c5622bb932ef3d23cbfeb956e2611e0afe8996ea0293a0190',
//   '0x8903aa21e3a95fdeef8ab06ef29fd4511ce3bd650a1fdd28a455300ddf470062',
//   '0xcd9fbdc416fb1c0ce1d4646b21ef267d7eaf79623727dfa485d65e10ccf0785c',
//   '0x6b2173a5b31196f3f480b2489524e55c9d3912ed1d4f3287d9f995dbdd68511c',
//   '0xbfee4eb11c53cb45f1f66c33999981d6cfb97c4284f9dcd8922718b384086e42',
//   '0x3df48d41bad2e8e6c2a0be21c53377182e42d3e88aeda2dff2f282545e9483ab',
//   '0xc0c05fc89a620a183f48badf2743349acf277902dc991efa8fa4506b1e0faf4a',
//   '0x4b812b3dfb70d2e9df92044aeab78bc599a6eadc60ec478f967d7d02ef4db888',
//   '0x7b40c5aff8e0fa7fd25fcf350bfff3a0f2c6221ac49b5454b4ca5a7d88637961',
//   '0x1946626a2ebbca85a22844070b15a6a99bdf6f702f789dbb3baa6d5409186c99',
//   '0x59ef6e296c731cca4872d54f38e9a07ff88524034156eb24ff37b4bb739f0ffa'
// ]

// const tokens = [
//   '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::usdc::USDC',
//   '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::usdt::USDT',
//   '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::deep::DEEP',
//   '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::cetus::CETUS',
//   '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::sui::SUI',
//   '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::hasui::HASUI',
//   '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::hawal::HAWAL',
//   '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::wal::WAL',
//   '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::eth::ETH',
//   '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::btc::BTC',
//   '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::weth::WETH',
//   '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::wbtc::WBTC',
//   '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::wusdc::WUSDC',
//   '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::buck::BUCK',
//   '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::usdy::USDY',
//   '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::fdusd::FDUSD',
//   '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::musd::MUSD',
//   '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::wwal::WWAL',
//   '0xcc3b20932c2bb2dbd72c4d076a256942e9d810c4448c39d9fc5c53cf64662083::afsui::AFSUI',
//   '0xcc3b20932c2bb2dbd72c4d076a256942e9d810c4448c39d9fc5c53cf64662083::vsui::VSUI',
//   '0x42765cb4f0dfb4d38df785afb1f33fc23620f912a5c9966118fc8f236b0bca6f::ns::NS'
// ]

const poolsId = [
  '0x3bb4c2bcb90efd0286de46c64df2c4a9251bac034a215b9412f35efc7baab454',
  '0x84da70840bea67d388996976972afa41a5559c64513777daafbe24a384ec285f',
  '0xf5962c31df2eaf01d3665138f80c118757c422c53fdee7e0a1cad4dd8d07edda',
  '0x403c7d9c1e959c029f61d970286eac8ad5bca2db2edba358585abf4dbd4ed3cd',
]

const tokens = [
  '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::hasui::HASUI',
  '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::sui::SUI',
  '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::usdc::USDC',
  '0xd933bc488dd19dcfdf6b8967f12686c05ff052c82af43b622b1d702575905c53::tardi::TARDI',
  '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::deep::DEEP',
]
describe('Pool Module', () => {
  let send_key_pair = buildTestAccount()
  const sdk = CetusClmmSDK.createSDK({ env: 'mainnet', sui_client: new SuiClient({ url: 'https://fullnode.mainnet.sui.io:443' }) })
  sdk.setSenderAddress(send_key_pair.getPublicKey().toSuiAddress())

  test('getClmmConfigs', async () => {
    const configs = await sdk.Pool.getClmmConfigs()
    console.log(configs)
  })

  test('getAllPools', async () => {
    const pools = await sdk.FullClient.fetchCoinMetadata('0xbde4ba4c2e274a60ce15c1cfff9e5c42e41654ac8b6d906a57efa4bd3c29f47d::hasui::HASUI')
    console.log(pools)
  })

  test('getAssignPools', async () => {
    // const pools = await sdk.Pool.getAssignPools(['0xcf994611fd4c48e277ce3ffd4d4364c914af2c3cbb05f7bf6facd371de688630'])
    const pools = await sdk.Pool.getAssignPools(poolsId)
    console.log(pools)
  })

  test('getPoolLiquiditySnapshot', async () => {
    const poolSnaps = await sdk.Pool.getPoolLiquiditySnapshot('0xf51541621a6c69b65dd740f96ff8946cb589f4715ad24abd10a7ae1093655713')
    console.log('poolSnaps: ', poolSnaps)

    const posSnap = await sdk.Pool.getPositionSnapshot(poolSnaps.snapshots.id, [
      '0x59c5d04778b40c333fdbef58c49357b06c599db7d885687f1cbdaea3c872293e',
    ])
    console.log('posSnap: ', posSnap)
  })

  test('getPoolTransactionList', async () => {
    const res = await sdk.Pool.getPoolTransactionList({
      pool_id: '0x2e041f3fd93646dcc877f783c1f2b7fa62d30271bdef1f21ef002cebf857bded',
      pagination_args: {
        limit: 100,
        cursor: undefined,
      },
    })
    console.log('res', res)
  })

  test('getSinglePool', async () => {
    // const pool = await sdk.Pool.getPool('0xcf994611fd4c48e277ce3ffd4d4364c914af2c3cbb05f7bf6facd371de688630')
    const pool = await sdk.Pool.getPool('0x2e041f3fd93646dcc877f783c1f2b7fa62d30271bdef1f21ef002cebf857bded')
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
