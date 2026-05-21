import { d, printTransaction, TickMath } from '@cetusprotocol/common-sdk'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import 'isomorphic-fetch'
// import { CetusClmmV2SDK } from '../dist/index.js'
import { CetusClmmV2SDK } from '../src'
import { FeeCoinType, FeeSchedulerMode } from '../src/types/clmm_type'


// pnpm test -- packages/clmmV2/tests/pool.test.ts -t getPool
describe('Pool Module', () => {
  let send_key_pair = buildTestAccount()
  const sdk = CetusClmmV2SDK.createSDK({ env: 'mainnet' })
  sdk.setSenderAddress(send_key_pair.getPublicKey().toSuiAddress())


  test('getPoolImmutables', async () => {
    const poolImmutables = await sdk.Pool.getPoolImmutables()
    console.log('poolImmutables:', poolImmutables.data)
  })

  test('getPools', async () => {
    const pools = await sdk.Pool.getPools()
    console.log('pools:', JSON.stringify(pools, null, 2))
  })

  test('getPool', async () => {
    const pool = await sdk.Pool.getPool('0xa7cb65dcbdc0110f29f31026520da4e6e1373f8b78c3984070de9002468e5c8a')
    console.log('pool:', JSON.stringify(pool, null, 2))
  })

  test('getAssignPools', async () => {
    const pools = await sdk.Pool.getAssignPools(["0xa97fa8998002f9e9f19fdd0bb02081e22bab2c6e66523aa9b627d7fd2d0ab578"])
    console.log('pools:', JSON.stringify(pools, null, 2))
  })

  test('fetchTicks', async () => {
    const pool = await sdk.Pool.getPool('0xa97fa8998002f9e9f19fdd0bb02081e22bab2c6e66523aa9b627d7fd2d0ab578')
    const ticks = await sdk.Pool.fetchTicks({
      pool_id: pool.id,
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
    })
    console.log('getTicks:', ticks)
  })



  test('createLaunchPool', async () => {
    const currentTime = d(Date.now() / 1000).toFixed(0)
    const tx = sdk.Pool.createPool({
      tick_spacing: 10,
      fee_rate: 500000,
      has_dynamic_fee: true,
      fee_coin_type: FeeCoinType.InputCoinType,
      min_tick_range: 20,
      initialize_price: TickMath.priceToSqrtPriceX64(d(1), 6, 6).toString(),
      url: '',
      coin_type_a: '0x109ff19f3bbbcf5151f2131ee731cfe399c2614ed86574c155e217d9e720fde4::usdc::USDC',
      coin_type_b: '0x109ff19f3bbbcf5151f2131ee731cfe399c2614ed86574c155e217d9e720fde4::usdt::USDT',
      fee_scheduler_mode: FeeSchedulerMode.Linear,
      swap_open_time: (currentTime + 1000 * 60 * 24).toString(),
      liquidity_open_time: (currentTime + 1000 * 60 * 24).toString(),
    })

    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('res:', res)
  })


  test('createPool', async () => {
    const tx = sdk.Pool.createPool({
      tick_spacing: 10,
      fee_rate: 500000,
      has_dynamic_fee: false,
      fee_coin_type: FeeCoinType.InputCoinType,
      min_tick_range: 0,
      initialize_price: TickMath.priceToSqrtPriceX64(d(1), 6, 6).toString(),
      url: '',
      coin_type_a: '0x109ff19f3bbbcf5151f2131ee731cfe399c2614ed86574c155e217d9e720fde4::usdc::USDC',
      coin_type_b: '0x109ff19f3bbbcf5151f2131ee731cfe399c2614ed86574c155e217d9e720fde4::usdt::USDT',
    })

    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('res:', res)
  })


})
