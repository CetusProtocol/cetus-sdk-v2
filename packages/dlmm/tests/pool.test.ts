// buildTestAccount
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import { CetusDlmmSDK } from '../src/sdk'
import { BinUtils } from '../src/utils/binUtils'
import { StrategyType } from '../src/types/dlmm'
import { asIntN, asUintN, d, fixCoinType, printTransaction } from '@cetusprotocol/common-sdk'
import { Transaction } from '@mysten/sui/transactions'
import { buildPoolKey, FeeUtils } from '../src/utils'
import { FEE_PRECISION, MAX_FEE_RATE } from '../src/types/constants'

describe('pool', () => {
  const sdk = CetusDlmmSDK.createSDK({ env: 'mainnet' })
  let send_key_pair: Ed25519Keypair
  let account: string

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    account = send_key_pair.getPublicKey().toSuiAddress()
    sdk.setSenderAddress(account)
  })

  test('faucet coin', async () => {
    const tx = new Transaction()
    const supply_ids = [
      { module: 'btc', id: '0x4730c9b8495f2f655ac423dfc2737269fd856e29fe311fed563bde212b8efb30' },
      { module: 'cetus', id: '0x81f9f8c196d15cb0b2421d1955112b3200b792b33584e2ae1f1d69605e6e09b6' },
      { module: 'eth', id: '0x171f59e0d0fb462ddfa323b0bf27f308fd2466fc3d44a1e1cbdcc774a206cc3c' },
      { module: 'usdc', id: '0xfed8db19bd2c51a3b1d9e667f30e054d7e74beab2921b4ee38c473fd072e3765' },
      { module: 'usdt', id: '0x53b597d3f2771a71793d04238ca2ceafb26e5cea898de76535393ff4837d73e3' },
    ]

    supply_ids.forEach((supply) => {
      tx.moveCall({
        package: '0x89ab72c6c7a43a7be93987ba98748c7d0fda462e7b5d58b44f432d30417768c4',
        module: supply.module,
        function: 'faucet',
        typeArguments: [],
        arguments: [tx.object(supply.id)],
      })
    })

    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('🚀 ~ test ~ res:', res)
  })

  test('getBasePoolList', async () => {
    const res = await sdk.Pool.getBasePoolList()
    console.log('🚀 ~ test ~ res:', res)
  })

  test('getPools', async () => {
    const res = await sdk.Pool.getPools()
    console.log('🚀 ~ test ~ res:', res.data)
  })

  test('getAssignPoolList', async () => {
    const pools = await sdk.Pool.getAssignPoolList(['0xbef9d0b90acfd1e58584d0d2a5070ef3d5ae3b52cc80a888435e5d935427fb55'])
    console.log('🚀 ~ test ~ pools:', pools)
  })

  test('getPool', async () => {
    const pool = await sdk.Pool.getPool('0x5f7113564e5532f47c33eaab120faf1d17b5aeed768f647d5eba23c497640373')
    console.log('🚀 ~ test ~ pool:', JSON.stringify(pool, null, 2))
  })

  test('getBinInfo', async () => {
    const binId = 2075
    const bin_info = await sdk.Pool.getBinInfo('0x6431faeba9476e27b39392f715d4558709471dbaaef66e4ec7d8208df3dfb77e', binId, 50)
    console.log('🚀 ~ test ~ bin_info:', bin_info)
  })

  test('getBinInfoList', async () => {
    const bin_info_list = await sdk.Pool.getBinInfoList([
      { bin_manager_handle: '0x4829b3331bd0e9b8ad87c8de6326a8e03715a8c2cde7a1ee0a3eb225a020d2a0', bin_id: 3945, bin_step: 15 },
      { bin_manager_handle: '0x9e3a8164794ea7f485d075d773a1991ecd78317490aa0bbcec6450a313971817', bin_id: -1601, bin_step: 25 },
      { bin_manager_handle: '0x5efbc117f7eb3ee634d7cdfb0ff1d0e4bba859b4084e756d7f91fe75c5228630', bin_id: -946, bin_step: 100 },
      { bin_manager_handle: '0xf4c11a4644f2a708ceff30f2231a9bd7802f29d64b7d6c6dc6d92ae48ba9027e', bin_id: -4812, bin_step: 5 },
      { bin_manager_handle: '0x37f4509605dc26dcb68981eedfe391b7fdc1ffcaa5d22eba44312f1f1171da81', bin_id: 7127, bin_step: 5 },
      { bin_manager_handle: '0xa762b8a52c8a645d00fd413447038bff5891b19ec65c0068eed37fd7da8a7c1b', bin_id: 11796, bin_step: 5 },
    ])
    console.log('🚀 ~ test ~ bin_info_list:', bin_info_list)
  })

  test('getPoolAddress', async () => {
    const address = await sdk.Pool.getPoolAddress(
      '14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::usdt::USDT',
      '0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
      25,
      10000
    )
    console.log('🚀 ~ test ~ address:', address)
  })

  test('getVariableFee', async () => {
    const pool = await sdk.Pool.getPool('0xe7e85914ab054a8d0d6d8f5f3e52445d17153da1efba857fed986f2d79e43412')
    console.log('🚀 ~ test ~ pool:', JSON.stringify(pool, null, 2))

    const variable_fee = FeeUtils.getVariableFee(pool.variable_parameters)

    console.log('🚀 ~ test ~ variable_fee:', variable_fee)
    console.log('🚀 ~ test ~ variable_fee2:', d(variable_fee).div(d(FEE_PRECISION)).toString())
    console.log('🚀 ~ test ~ variable_fee2:', d(MAX_FEE_RATE).div(d(FEE_PRECISION)).toString())
  })

  test('1 getPoolBinInfo', async () => {
    const bin_info = await sdk.Pool.getPoolBinInfo({
      pool_id: '0x5f7113564e5532f47c33eaab120faf1d17b5aeed768f647d5eba23c497640373',
      coin_type_a: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      coin_type_b: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS',
    })
    console.log('🚀 ~ test ~ bin_info:', bin_info)
  })

  test('getTotalFeeRate', async () => {
    const fee_rate = await sdk.Pool.getTotalFeeRate({
      pool_id: '0xddeb2c1c4a5794623105c5c2f6b4c59018036cf914181e910e46dfb0fbe31326',
      coin_type_a: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
      coin_type_b: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    })
    console.log('🚀 ~ test ~ fee_rate:', fee_rate)
  })

  test('getPoolTransactionList', async () => {
    const res = await sdk.Pool.getPoolTransactionList({
      pool_id: '0xe7e85914ab054a8d0d6d8f5f3e52445d17153da1efba857fed986f2d79e43412',
      pagination_args: { limit: 10, cursor: '8r1oXezKZsyupRBdvvRkYAe9aT5anpwiVKJte63ofprn' },
    })
    console.log('🚀 ~ test ~ res:', res)
  })

  test('createPoolAndAddWithPayload', async () => {
    const bin_step = 2
    const base_factor = 10000
    const coin_amount_a = '10000000'
    const price = '0.00038398'
    const active_id = BinUtils.getBinIdFromPrice(price, bin_step, true, 6, 9)

    const lower_bin_id = active_id - 10
    const upper_bin_id = active_id + 10

    const bin_infos = await sdk.Position.calculateAddLiquidityInfo({
      active_id,
      bin_step,
      lower_bin_id,
      upper_bin_id,
      amount_a: '0',
      amount_b: '0',
      strategy_type: StrategyType.Spot,
      coin_amount: coin_amount_a,
      fix_amount_a: true,
    })

    console.log('🚀 ~ test ~ bin_infos:', bin_infos)

    const tx = await sdk.Pool.createPoolAndAddLiquidityPayload({
      active_id,
      lower_bin_id,
      upper_bin_id,
      bin_step,
      coin_type_a: '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::usdc::USDC',
      coin_type_b: '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::eth::ETH',
      strategy_type: StrategyType.Spot,
      use_bin_infos: false,
      base_factor,
      bin_infos,
    })

    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('🚀 ~ test ~ res:', res)
  })

  test('createPoolPayload', async () => {
    const bin_step = 2
    const base_factor = 10000
    const price = '1.1'
    const active_id = BinUtils.getBinIdFromPrice(price, bin_step, true, 6, 6)

    const tx = new Transaction()
    await sdk.Pool.createPoolPayload(
      {
        active_id,
        bin_step,
        coin_type_a: '0xbde4ba4c2e274a60ce15c1cfff9e5c42e41654ac8b6d906a57efa4bd3c29f47d::hasui::HASUI',
        coin_type_b: fixCoinType('0x2::sui::SUI', false),
        base_factor,
      },
      tx
    )

    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('🚀 ~ test ~ res:', res)
  })
})
