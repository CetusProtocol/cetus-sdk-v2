import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import BN from 'bn.js'
import { adjustForCoinSlippage, ClmmPoolUtil, Percentage, printTransaction, TickMath } from '@cetusprotocol/common-sdk'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import 'isomorphic-fetch'
import { CetusFarmsSDK } from '../src/sdk'
import type { HarvestParams } from '../src/types/farmsType'
import { ClaimFeeAndClmmRewardParams } from '../src/types/farmsType'
let send_key_pair: Ed25519Keypair

const poolId = '0x6bee98b2758317730bb9fe800631ddacc5b892a173c0380730ca9b85d00ed732'
const clmm_pool_id = '0x8903aa21e3a95fdeef8ab06ef29fd4511ce3bd650a1fdd28a455300ddf470062'
const position_nft_id = '0x30715d4711a81aadd55cdc786fd523afa61e7d14e67d7ba783229ac420c21594'

describe('farms Module', () => {
  const sdk = CetusFarmsSDK.createSDK({ env: 'testnet' })

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    sdk.ClmmSDK.setSenderAddress(send_key_pair.getPublicKey().toSuiAddress())
  })

  test('1 getFarmsConfigs', async () => {
    const configs = await sdk.Farms.getFarmsConfigs()
    console.log('configs: ', configs)
  })
  test('1 getFarmsPoolList', async () => {
    const poolData = await sdk.Farms.getFarmsPoolList()
    console.log('poolData: ', JSON.stringify(poolData.data, null, 2))
  })

  test('2 getFarmsPool', async () => {
    const poolData = await sdk.Farms.getFarmsPool('0x6744ac18dd36c4bc805606b19f609c46e1404f79e867aa51e78dfa87cd91ca0a')
    console.log('poolData: ', poolData)
  })

  test('1 getOwnedFarmsPositionNFTList', async () => {
    const nftList = await sdk.Farms.getOwnedFarmsPositionNFTList(sdk.ClmmSDK.getSenderAddress())
    console.log('nftList: ', nftList.data)
  })

  test('2 getOwnedFarmsPositionNFTList', async () => {
    const nftList = await sdk.Farms.getOwnedFarmsPositionNFTList(sdk.getSenderAddress())
    console.log('nftList: ', nftList)
  })

  test('1 getFarmsPositionNFT', async () => {
    const fpNFT = await sdk.Farms.getFarmsPositionNFT(position_nft_id, true)
    console.log('fpNFT : ', fpNFT)
  })

  test('calculateFarmingRewards', async () => {
    const farmingRewards = await sdk.Farms.calculateFarmingRewards([
      {
        pool_id: '0x1f40acac94f991ad7336841865bbab98a11272d0edc70a2399d1c807d6fab75e',
        position_nft_id: '0xa6bfc276ad64045b46340e88c93d61056f312d444f53317d463d3c59b8728a32',
      },
    ])
    console.log('farmingRewards: ', farmingRewards)
  })

  test('stake depositPayload', async () => {
    const payload = sdk.Farms.depositPayload({
      pool_id: '0x6bee98b2758317730bb9fe800631ddacc5b892a173c0380730ca9b85d00ed732',
      clmm_position_id: '0x0aeed0bf50737f651fdc78361f0c7cf6898f8d695a82f9e19c24d963ec9ee538',
      clmm_pool_id: '0x8903aa21e3a95fdeef8ab06ef29fd4511ce3bd650a1fdd28a455300ddf470062',
      coin_type_a: '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::hasui::HASUI',
      coin_type_b: '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::sui::SUI',
    })
    printTransaction(payload)
    const txResult = await sdk.FullClient.executeTx(send_key_pair, payload, false)
    console.log('txResult: ', txResult)
  })

  test('unstake withdrawPayload', async () => {
    const payload = await sdk.Farms.withdrawPayload({
      pool_id: poolId,
      position_nft_id,
    })
    const txResult = await sdk.FullClient.executeTx(send_key_pair, payload, true)
    console.log('txResult: ', txResult)
  })

  test('1 harvest farm rewards', async () => {
    const params: HarvestParams = {
      pool_id: poolId,
      position_nft_id,
    }
    const payload = await sdk.Farms.harvestPayload(params)
    const txResult = await sdk.FullClient.executeTx(send_key_pair, payload, true)
    console.log('txResult: ', txResult)
  })

  test('harvest all farm rewards', async () => {
    const farmsListParams = [
      {
        pool_id: '0x6744ac18dd36c4bc805606b19f609c46e1404f79e867aa51e78dfa87cd91ca0a',
        position_nft_id: '0x06285d4af79d2b68e4600387390c13c9d66f30fdd86820e9b4be2d8102e4dc01',
        clmm_pool_id: '0x473ab0306ff8952d473b10bb4c3516c632edeb0725f6bb3cda6c474d0ffc883f',
        collect_fee: true,
        collect_farms_rewarder: false,
        clmm_rewarder_types: [],
        coin_type_a: '0xac2afb455cbcdc2ff1a2e9bbb8aa4ccb4506a544b08c740886892a5cdf92f472::hasui::HASUI',
        coin_type_b: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
      },
    ]
    const payload = await sdk.Farms.batchHarvestAndClmmFeePayload(farmsListParams, [])
    printTransaction(payload)
    const txResult = await sdk.FullClient.executeTx(send_key_pair, payload, false)
    console.log('txResult: ', txResult)
  })

  test('add liquidity', async () => {
    const clmmPool = await sdk.ClmmSDK.Pool.getPool(clmm_pool_id)
    const position = (await sdk.Farms.getFarmsPositionNFT(position_nft_id))!
    const lowerTick = position.tick_lower_index
    const upperTick = position.tick_upper_index

    const coinAmount = new BN(1000000)
    const fix_amount_a = true
    const slippage = 0.1
    const curSqrtPrice = new BN(clmmPool.current_sqrt_price)

    const liquidityInput = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
      lowerTick,
      upperTick,
      coinAmount,
      fix_amount_a,
      true,
      slippage,
      curSqrtPrice
    )

    const amount_a = fix_amount_a ? coinAmount.toNumber() : liquidityInput.coin_amount_limit_a
    const amount_b = fix_amount_a ? liquidityInput.coin_amount_limit_b : coinAmount.toNumber()

    console.log('amount: ', { amount_a, amount_b })

    const payload = await sdk.Farms.addLiquidityFixCoinPayload({
      pool_id: poolId,
      coin_type_a: clmmPool.coin_type_a,
      coin_type_b: clmmPool.coin_type_b,
      position_nft_id: position.id,
      clmm_pool_id: clmmPool.id,
      amount_a,
      amount_b,
      collect_fee: true,
      collect_rewarder: true,
      fix_amount_a,
      clmm_rewarder_types: [],
    })
    printTransaction(payload)
    const txResult = await sdk.FullClient.executeTx(send_key_pair, payload, true)
    console.log('txResult: ', txResult)
  })

  test('Open position, add liquidity, and stake', async () => {
    const clmmPool = await sdk.ClmmSDK.Pool.getPool(clmm_pool_id)
    console.log({ clmmPool })

    const lowerTick = -10000
    const upperTick = 10000

    const coinAmount = new BN(1000000)
    const fix_amount_a = true
    const slippage = 0.1
    const curSqrtPrice = new BN(clmmPool.current_sqrt_price)

    const liquidityInput = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
      lowerTick,
      upperTick,
      coinAmount,
      fix_amount_a,
      true,
      slippage,
      curSqrtPrice
    )

    const amount_a = fix_amount_a ? coinAmount.toNumber() : liquidityInput.coin_amount_limit_a
    const amount_b = fix_amount_a ? liquidityInput.coin_amount_limit_b : coinAmount.toNumber()

    console.log('amount: ', { amount_a, amount_b })

    const payload = await sdk.Farms.openPositionAddLiquidityStakePayload({
      pool_id: poolId,
      coin_type_a: clmmPool.coin_type_a,
      coin_type_b: clmmPool.coin_type_b,
      clmm_pool_id: clmmPool.id,
      amount_a: amount_a.toString(),
      amount_b: amount_b.toString(),
      fix_amount_a,
      tick_lower: lowerTick,
      tick_upper: upperTick,
    })
    printTransaction(payload)
    const txResult = await sdk.FullClient.executeTx(send_key_pair, payload, false)
    console.log('txResult: ', txResult)
  })

  test('Remove liquidity for fixed input coin', async () => {
    const clmmPool = await sdk.ClmmSDK.Pool.getPool(clmm_pool_id)
    const position = (await sdk.Farms.getFarmsPositionNFT(position_nft_id))!
    const lowerTick = position.tick_lower_index
    const upperTick = position.tick_upper_index

    const coinAmount = new BN(1000000)
    const fix_amount_a = true
    const slippage = 0.1
    const curSqrtPrice = new BN(clmmPool.current_sqrt_price)

    const liquidityInput = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
      lowerTick,
      upperTick,
      coinAmount,
      fix_amount_a,
      false,
      slippage,
      curSqrtPrice
    )

    const amount_a = liquidityInput.coin_amount_limit_a
    const amount_b = liquidityInput.coin_amount_limit_b
    const liquidity = liquidityInput.liquidity_amount

    console.log('amount: ', { amount_a, amount_b, liquidity })

    const payload = await sdk.Farms.removeLiquidityPayload({
      pool_id: poolId,
      coin_type_a: clmmPool.coin_type_a,
      coin_type_b: clmmPool.coin_type_b,
      position_nft_id: position.id,
      clmm_pool_id: clmmPool.id,
      min_amount_a: amount_a.toString(),
      min_amount_b: amount_b.toString(),
      collect_rewarder: true,
      clmm_rewarder_types: [],
      delta_liquidity: liquidity,
      unstake: true,
      close_position: false,
    })
    printTransaction(payload)
    const txResult = await sdk.FullClient.executeTx(send_key_pair, payload, false)
    console.log('txResult: ', txResult)
  })

  test('Remove liquidity and close the position', async () => {
    const clmmPool = await sdk.ClmmSDK.Pool.getPool('0x8903aa21e3a95fdeef8ab06ef29fd4511ce3bd650a1fdd28a455300ddf470062')
    const position = (await sdk.Farms.getFarmsPositionNFT('0xdfb22859b568186a08be0b7ba842cdc127fa6450ac7180ba30457922983ef669'))!
    console.log('farms position: ', position)
    const lowerTick = position.tick_lower_index
    const upperTick = position.tick_upper_index

    const lowerSqrtPrice = TickMath.tickIndexToSqrtPriceX64(lowerTick)
    const upperSqrtPrice = TickMath.tickIndexToSqrtPriceX64(upperTick)

    const liquidity = new BN('335739215')
    const slippageTolerance = new Percentage(new BN(5), new BN(100))
    const curSqrtPrice = new BN(clmmPool.current_sqrt_price)
    const coinAmounts = ClmmPoolUtil.getCoinAmountFromLiquidity(liquidity, curSqrtPrice, lowerSqrtPrice, upperSqrtPrice, false)
    const { coin_amount_limit_a, coin_amount_limit_b } = adjustForCoinSlippage(coinAmounts, slippageTolerance, false)

    console.log('amount: ', { coin_amount_limit_a, coin_amount_limit_b, liquidity })

    // const rewards: any[] = await sdk.ClmmSDK.Rewarder.posRewardersAmount(position.clmm_pool_id, clmmPool.position_manager.positions_handle, position.clmm_position_id)
    // console.log('rewards: ', rewards)

    // const rewardCoinTypes = rewards.filter((item) => Number(item.amount_owed) >= 0).map((item) => item.coin_address as string)

    const payload = await sdk.Farms.removeLiquidityPayload({
      pool_id: position.pool_id,
      coin_type_a: clmmPool.coin_type_a,
      coin_type_b: clmmPool.coin_type_b,
      position_nft_id: position.id,
      clmm_pool_id: clmmPool.id,
      min_amount_a: coin_amount_limit_a,
      min_amount_b: coin_amount_limit_b,
      collect_rewarder: true,
      //clmm_rewarder_types: rewardCoinTypes,
      clmm_rewarder_types: [],
      delta_liquidity: liquidity.toString(),
      unstake: true,
      close_position: true,
      clmm_position_id: position.clmm_position_id,
    })
    printTransaction(payload)
    const txResult = await sdk.FullClient.executeTx(send_key_pair, payload, false)
    console.log('txResult: ', txResult)
  })

  test('Withdraw fee / CLMM rewards', async () => {
    const params: ClaimFeeAndClmmRewardParams = {
      coin_type_a: '0x0588cff9a50e0eaf4cd50d337c1a36570bc1517793fd3303e1513e8ad4d2aa96::usdt::USDT',
      coin_type_b: '0x0588cff9a50e0eaf4cd50d337c1a36570bc1517793fd3303e1513e8ad4d2aa96::usdc::USDC',
      clmm_pool_id: '0xd40feebfcf7935d40c9e82c9cb437442fee6b70a4be84d94764d0d89bb28ab07',
      position_nft_id: '0x891f9ab822ccf9f6c02d8702a5e4aa4b790dc47f18064867b1b7ee73603d03d6',
      clmm_rewarder_types: [
        '0x0588cff9a50e0eaf4cd50d337c1a36570bc1517793fd3303e1513e8ad4d2aa96::usdc::USDC',
        '0x0588cff9a50e0eaf4cd50d337c1a36570bc1517793fd3303e1513e8ad4d2aa96::usdt::USDT',
        '0x0588cff9a50e0eaf4cd50d337c1a36570bc1517793fd3303e1513e8ad4d2aa96::cetus::CETUS',
      ],
      collect_fee: true,
    }
    const payload = await sdk.Farms.claimFeeAndClmmReward(params)
    // printTransaction(payload)
    console.log(payload, 'payload')
    const txResult = await sdk.FullClient.executeTx(send_key_pair, payload, false)
    console.log('txResult: ', txResult)
  })

  test('getFarmsConfigs', async () => {
    const configs = await sdk.Farms.getFarmsConfigs()
    console.log('configs: ', configs)
  })
})
