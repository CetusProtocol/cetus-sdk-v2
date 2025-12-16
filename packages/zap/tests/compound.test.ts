import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import BN from 'bn.js'
import { Transaction } from '@mysten/sui/transactions'
import { Pool } from '@cetusprotocol/sui-clmm-sdk'
import { ClmmPoolUtil, printTransaction, TickMath, toDecimalsAmount, CoinAssist, d } from '@cetusprotocol/common-sdk'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import { CetusZapSDK } from '../src/sdk'
import { BaseDepositOptions, FixedOneSideOptions, FlexibleBothOptions, OnlyCoinAOptions, OnlyCoinBOptions } from '../src/types/zap'

// 测试move
// const poolId = '0x5a1b88e30dee863965e9f24c8dd4bf82ee374b1b0a77b10126b073660f9896fe'
// const posId = '0xfdd4d2411550e7b8962020b81187fd71ed5b8a4d280ef0b2dfc42da0e2ae6804'

// 测试compound
const poolId = '0xb8a67c149fd1bc7f9aca1541c61e51ba13bdded64c273c278e50850ae3bff073'
const posId = '0x31284d6dc327140b17429c0ef52e80d60c0eb8fdc068517fce62ea37139b69cd'
const farmId = ''
describe('deposit test', () => {
  const sdk = CetusZapSDK.createSDK({ env: 'mainnet' })
  let send_key_pair: Ed25519Keypair
  let address: string
  let pool: Pool

  beforeAll(async () => {
    send_key_pair = buildTestAccount()
    // address = send_key_pair.getPublicKey().toSuiAddress()
    
    address = '0x4a66266abc88d2b684b7a6cd264f5dcc518184ffad1ca6fe3899a0bc38db0584'
    sdk.setSenderAddress(address)
    

    pool = await sdk.ClmmSDK.Pool.getPool(poolId, true)

    console.log('🚀 ~ describe ~ pool:', pool)

    if (pool === undefined) {
      throw new Error('Pool not found')
    }
  })


  test('Mode: Rebalance ', async () => {
    const { current_sqrt_price, current_tick_index, tick_spacing, coin_type_a, coin_type_b } = pool!
    // console.log("🚀 ~ current_sqrt_price:", current_sqrt_price)
    // console.log("1010🚀 ~ tick_spacing:", tick_spacing)
    // console.log("1010🚀 ~ current_tick_index:", current_tick_index)
    const tick_lower = TickMath.getInitializeTickIndex(current_tick_index - 60, Number(tick_spacing))
    // console.log("🚀 ~ tick_lower:", tick_lower)
    const tick_upper = TickMath.getInitializeTickIndex(current_tick_index + 60, Number(tick_spacing))
    // console.log("🚀 ~ tick_upper:", tick_upper)
    const slippage = 0.005



    const result = await sdk.Compound.calculateRebalance({
      pool_id: poolId,
      coin_type_a,
      coin_type_b,
      coin_decimal_a: 6,
      coin_decimal_b: 9,
      amount_a: toDecimalsAmount(10, 6).toString(),
      // amount_a: '0',
      amount_b: toDecimalsAmount(1, 9).toString(),
      // amount_b: '0',
      tick_lower: -443630,
      tick_upper: 443630,
      current_sqrt_price: current_sqrt_price.toString(),
      slippage,
    })
    console.log("🚀 ~ result:", result)

    // console.log('🚀 ~ test ~ result:', result)

    // const tx = await sdk.Zap.buildDepositPayload({
    //   deposit_obj: result,
    //   pool_id: poolId,
    //   coin_type_a,
    //   coin_type_b,
    //   tick_lower,
    //   tick_upper,
    //   slippage,
    // })

    // printTransaction(tx)

    // let isSimulation = true
    // if (isSimulation) {
    //   const res = await sdk.FullClient.sendSimulationTransaction(tx, address)
    //   console.log('Deposit Transaction Simulation Result:', res?.effects?.status?.status === 'success' ? res?.events : res)
    // } else {
    //   const res = await sdk.FullClient.sendTransaction(send_key_pair, tx)
    //   console.log('Deposit Transaction Simulation Result:', res?.events)
    // }
  })

  // claim and merge test
  test('createClaimMergePayload', async() => {   

    // const {coin_type_a, coin_type_b} = pool!
    const coin_type_a = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'
    const coin_type_b = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI'
    const rewarder_coin_types = pool!.rewarder_infos.map((info) => info.coin_type)
    console.log("🚀 ~ rewarder_coin_types:", rewarder_coin_types)

    const merge_routers = await sdk.Compound.calculateClaimMerge({
      pool_id: poolId,
      farms_pool_id: farmId,
      position_id: posId,
      coin_type_a: coin_type_a,
      coin_type_b: coin_type_b,
      rewarder_types: rewarder_coin_types,
      target_coin_type: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS',
      not_merge_coins: ['0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS']
    })
    console.log("🚀 ~ merge_routers:", JSON.stringify(merge_routers, null, 2))

    console.log('createClaimMergePayload params: ', {
      pool_id: poolId,
      pos_id: posId,
      coin_type_a: coin_type_a,
      coin_type_b: coin_type_b,
      rewarder_coin_types,
      target_coin_type: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS',
      slippage: 0.005,
      merge_routers,
      not_merge_coins: ['0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS']
    })


    const tx: any = await sdk.Compound.createClaimMergePayload({
      pool_id: poolId,
      pos_id: posId,
      coin_type_a: coin_type_a,
      coin_type_b: coin_type_b,
      rewarder_coin_types,
      target_coin_type: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS',
      slippage: 0.005,
      merge_routers,
      not_merge_coins: ['0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS']
    })
    printTransaction(tx)

    let isSimulation = true
    if (isSimulation) {
      const res = await sdk.FullClient.sendSimulationTransaction(tx, address)
      console.log('Deposit Transaction Simulation Result:', res?.effects?.status?.status === 'success' ? res?.events : res)
    } else {
      const res = await sdk.FullClient.sendTransaction(send_key_pair, tx)
      console.log('Deposit Transaction Simulation Result:', res?.events)
    }
  })

  // claim and merge test (farms pos)
  // test('createClaimMergePayload farms pos', async() => {    
  //   const {coin_type_a, coin_type_b} = pool!
  //   const rewarder_coin_types = pool!.rewarder_infos.map((info) => info.coin_type)
  //   console.log("🚀 ~ rewarder_coin_types:", rewarder_coin_types)

  //   // const position = await sdk.ClmmSDK.Position.getPositionById(posId)
  //   const position = await sdk.FarmsSDK.Farms.getFarmsPositionNFT(posId)
  //   console.log("🚀 ~ position:", position)

  //   const merge_routers = await sdk.Compound.calculateClaimMerge({
  //     pool_id: poolId,
  //     farms_pool_id: farmId,
  //     position_id: position.clmm_position_id,
  //     coin_type_a: coin_type_a,
  //     coin_type_b: coin_type_b,
  //     rewarder_types: rewarder_coin_types,
  //     target_coin_type: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS',
  //     not_merge_coins: ['0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS']
  //   })
  //   console.log("🚀 ~ merge_routers:", JSON.stringify(merge_routers, null, 2))

  //   console.log('createClaimMergePayload params: ', {
  //     pool_id: poolId,
  //     pos_id: posId,
  //     coin_type_a: coin_type_a,
  //     coin_type_b: coin_type_b,
  //     rewarder_coin_types,
  //     target_coin_type: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS',
  //     slippage: 0.005,
  //     merge_routers,
  //     not_merge_coins: ['0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS']
  //   })

  //   const tx: any = await sdk.Compound.createClaimMergePayload({
  //     pool_id: poolId,
  //     farms_pool_id: farmId,
  //     pos_id: posId,
  //     coin_type_a: coin_type_a,
  //     coin_type_b: coin_type_b,
  //     rewarder_coin_types,
  //     target_coin_type: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS',
  //     slippage: 0.005,
  //     merge_routers,
  //     not_merge_coins: ['0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS']
  //   })
  //   printTransaction(tx)

  //   let isSimulation = true
  //   if (isSimulation) {
  //     const res = await sdk.FullClient.sendSimulationTransaction(tx, address)
  //     console.log('Deposit Transaction Simulation Result:', res?.effects?.status?.status === 'success' ? res?.events : res)
  //   } else {
  //     const res = await sdk.FullClient.sendTransaction(send_key_pair, tx)
  //     console.log('Deposit Transaction Simulation Result:', res?.events)
  //   }
  // })

  // claim and compound test
  test('createCompoundRebalanceAddPayload', async() => {
    // const posId = '0xef6b1b2b52050f1afa6212f4d7f2177b5db4793bdad2646a0c23db2e8e849cfe'
    // const poolId = '0xb40eb00edaba8148bfa579830129531e10a02309f044e76f260cc8a9b8049188'
    // const pool = await sdk.ClmmSDK.Pool.getPool(poolId, true)

    const slippage = 0.005
    const coin_decimal_a = 6
    const coin_decimal_b = 9
    const {coin_type_a, coin_type_b, current_sqrt_price} = pool!
    const rewarder_coin_types = pool!.rewarder_infos.map((info) => info.coin_type)

    const position = await sdk.ClmmSDK.Position.getPositionById(posId)
    console.log("🚀 ~ position:", position)
    const {tick_lower_index, tick_upper_index} = position!

    const curr_tick = TickMath.sqrtPriceX64ToTickIndex(new BN(current_sqrt_price))
    console.log("🚀 ~ curr_tick:", curr_tick)

    console.log('getFeeAndReward params: ', {
      pool_id: poolId,
      position_id: posId,
      coin_type_a: coin_type_a,
      coin_type_b: coin_type_b,
      rewarder_types: rewarder_coin_types,
      merge_swap_target_coin_type: curr_tick >= tick_upper_index ? coin_type_b : coin_type_a,
    })

    const feeAndRewardResult = await sdk.Compound.getFeeAndReward({
      pool_id: poolId,
      position_id: posId,
      coin_type_a: coin_type_a,
      coin_type_b: coin_type_b,
      rewarder_types: rewarder_coin_types,
      merge_swap_target_coin_type: curr_tick >= tick_upper_index ? coin_type_b : coin_type_a,
      not_merge_coins: ['0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS']
    })


    console.log("🚀 ~ feeAndRewardResult:", feeAndRewardResult)

    // return

    const baseParams = {
      pool_id: poolId,
      pos_id: posId,
      coin_type_a: coin_type_a,
      coin_type_b: coin_type_b,
      rewarder_coin_types,
    }

    const rewarderMergeOption = {
      merge_routers: feeAndRewardResult?.merge_routers,
      slippage,
      not_merge_coins: ['0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS']
    }

    

    const rebalancePreParams = {
      pool_id: poolId,
      pos_id: posId,
      coin_type_a: coin_type_a,
      coin_type_b: coin_type_b,
      coin_decimal_a,
      coin_decimal_b,
      amount_a: feeAndRewardResult.coin_amount_a,
      amount_b: feeAndRewardResult.coin_amount_b,
      tick_lower: tick_lower_index,
      tick_upper: tick_upper_index,
      current_sqrt_price: current_sqrt_price.toString(),
      slippage,
      max_remain_rate: 0.01,
      mark_price: '',
      verify_price_loop: 0
    }
    console.log("🚀 ~ rebalancePreParams:", rebalancePreParams)
    const rebalancePre = await sdk.Compound.calculateRebalance(rebalancePreParams)
    console.log("🚀 ~ rebalancePre:", rebalancePre)
    // return

    const tx = new Transaction()

    console.log('createCompoundRebalanceAddPayload params: ', {baseParams, rebalancePre, rewarderMergeOption, tx})
    await sdk.Compound.createCompoundRebalanceAddPayload({baseParams, rebalancePre, rewarderMergeOption, tx})

    printTransaction(tx)

    let isSimulation = true
    if (isSimulation) {
      const res = await sdk.FullClient.sendSimulationTransaction(tx, address)
      console.log('Deposit Transaction Simulation Result:', res?.effects?.status?.status === 'success' ? res?.events : res)
    } else {
      const res = await sdk.FullClient.sendTransaction(send_key_pair, tx)
      console.log('Deposit Transaction Simulation Result:', res?.events)
    }

  })

  // // claim and compound test
  // test('createCompoundRebalanceAddPayload farms pos', async() => {
  //   const slippage = 0.005
  //   const coin_decimal_a = 9
  //   const coin_decimal_b = 9
  //   const {coin_type_a, coin_type_b, current_sqrt_price} = pool!
  //   const rewarder_coin_types = pool!.rewarder_infos.map((info) => info.coin_type)

  //   // const position = await sdk.ClmmSDK.Position.getPositionById(posId)
  //   const position = await sdk.FarmsSDK.Farms.getFarmsPositionNFT(posId)
  //   console.log("🚀 ~ position:", position)
  //   const {tick_lower_index, tick_upper_index} = position!

  //   const curr_tick = TickMath.sqrtPriceX64ToTickIndex(new BN(current_sqrt_price))

  //   console.log('getFeeAndReward params: ', {
  //     pool_id: poolId,
  //     position_id: posId,
  //     coin_type_a: coin_type_a,
  //     coin_type_b: coin_type_b,
  //     rewarder_types: rewarder_coin_types,
  //     merge_swap_target_coin_type: curr_tick >= tick_upper_index ? coin_type_b : coin_type_a,
  //   })

  //   const feeAndRewardResult = await sdk.Compound.getFeeAndReward({
  //     pool_id: poolId,
  //     farms_pool_id: farmId,
  //     position_id: position.clmm_position_id,
  //     coin_type_a: coin_type_a,
  //     coin_type_b: coin_type_b,
  //     rewarder_types: rewarder_coin_types,
  //     merge_swap_target_coin_type: curr_tick >= tick_upper_index ? coin_type_b : coin_type_a,
  //   })


  //   console.log("🚀 ~ feeAndRewardResult:", feeAndRewardResult)

  //   const baseParams = {
  //     pool_id: poolId,
  //     farms_pool_id: farmId,
  //     pos_id: posId,
  //     coin_type_a: coin_type_a,
  //     coin_type_b: coin_type_b,
  //     rewarder_coin_types,
  //   }

  //   const rewarderMergeOption = {
  //     merge_routers: feeAndRewardResult?.merge_routers,
  //     slippage,
  //     not_merge_coins: ['']
  //   }

  //   const rebalancePreParams = {
  //     pool_id: poolId,
  //     pos_id: posId,
  //     coin_type_a: coin_type_a,
  //     coin_type_b: coin_type_b,
  //     coin_decimal_a,
  //     coin_decimal_b,
  //     amount_a: feeAndRewardResult.coin_amount_a,
  //     amount_b: feeAndRewardResult.coin_amount_b,
  //     tick_lower: tick_lower_index,
  //     tick_upper: tick_upper_index,
  //     current_sqrt_price: current_sqrt_price.toString(),
  //     slippage,
  //     max_remain_rate: 0.01,
  //     mark_price: '',
  //     verify_price_loop: 0
  //   }
  //   const rebalancePre = await sdk.Compound.calculateRebalance(rebalancePreParams)
  //   console.log("🚀 ~ rebalancePre:", rebalancePre)

  //   const tx = new Transaction()
  //   await sdk.Compound.createCompoundRebalanceAddPayload({baseParams, rebalancePre, rewarderMergeOption, tx})

  //   printTransaction(tx)

  //   let isSimulation = true
  //   if (isSimulation) {
  //     const res = await sdk.FullClient.sendSimulationTransaction(tx, address)
  //     console.log('Deposit Transaction Simulation Result:', res?.effects?.status?.status === 'success' ? res?.events : res)
  //   } else {
  //     const res = await sdk.FullClient.sendTransaction(send_key_pair, tx)
  //     console.log('Deposit Transaction Simulation Result:', res?.events)
  //   }

  // })

  // move pos test
  test('createMovePositionPayload', async () => {

    const slippage = 0.005
    // const coin_decimal_a = 9
    // const coin_decimal_b = 9
    const {coin_type_a, coin_type_b, current_sqrt_price} = pool!
    console.log("🚀 ~ pool:", pool)
    const rewarder_coin_types = pool!.rewarder_infos.map((info) => info.coin_type)

    let rebalanceAmountA = '0'
    let rebalanceAmountB = '0'



    const oldPosInfo = await sdk.ClmmSDK.Position.getPositionById(posId)

    console.log("🚀 ~ oldPosInfo:", oldPosInfo)
    const lowerSqrtPrice = TickMath.tickIndexToSqrtPriceX64(oldPosInfo.tick_lower_index)
    const upperSqrtPrice = TickMath.tickIndexToSqrtPriceX64(oldPosInfo.tick_upper_index)
    const oldPosAmounts  = ClmmPoolUtil.getCoinAmountFromLiquidity(
      new BN(oldPosInfo!.liquidity),
      new BN(current_sqrt_price),
      lowerSqrtPrice,
      upperSqrtPrice,
      true
    )
    console.log("🚀 ~ oldPosAmounts:", oldPosAmounts)


    const oldPosAmountAWithSlippage = d(oldPosAmounts.coin_amount_a).mul(d(1 - slippage)).floor().toString()
    console.log("🚀 ~ oldPosAmountAWithSlippage:", oldPosAmountAWithSlippage)
    const oldPosAmountBWithSlippage = d(oldPosAmounts.coin_amount_b).mul(d(1 - slippage)).floor().toString()
    console.log("🚀 ~ oldPosAmountBWithSlippage:", oldPosAmountBWithSlippage)
    rebalanceAmountA = oldPosAmountAWithSlippage
    rebalanceAmountB = oldPosAmountBWithSlippage
    const oldPos = {
      pool_id: poolId,
      pos_id: posId,
      coin_type_a: coin_type_a,
      coin_type_b: coin_type_b,
      rewarder_coin_types,
      liquidity: oldPosInfo!.liquidity,
      min_amount_a: oldPosAmountAWithSlippage,
      min_amount_b: oldPosAmountBWithSlippage,
      not_close: false
    }

    const have_claim = false
    let rewarderMergeOption
    if (!have_claim) {
      const curr_tick = TickMath.sqrtPriceX64ToTickIndex(new BN(current_sqrt_price))

      const feeAndRewardResult = await sdk.Compound.getFeeAndReward({
        pool_id: poolId,
        position_id: posId,
        coin_type_a: coin_type_a,
        coin_type_b: coin_type_b,
        rewarder_types: rewarder_coin_types,
        merge_swap_target_coin_type: curr_tick >= oldPosInfo.tick_upper_index ? coin_type_b : coin_type_a,
        not_merge_coins: []
      })

      if (feeAndRewardResult?.merge_routers && !feeAndRewardResult?.merge_routers?.error) {
        rewarderMergeOption = {
          merge_routers: feeAndRewardResult?.merge_routers,
          slippage,
          not_merge_coins: []
        }
      } else {
        rewarderMergeOption = {
          merge_routers: undefined,
          slippage,
          // not_merge_coins: [...rewarder_coin_types]
          not_merge_coins: ['0x2::sui::SUI', '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS']
        }
      }

      rebalanceAmountA = d(feeAndRewardResult.coin_amount_a).add(rebalanceAmountA).floor().toString()
      rebalanceAmountB = d(feeAndRewardResult.coin_amount_b).add(rebalanceAmountB).floor().toString()
    }

    const newPos = {
      // tick_lower: -443630,
      // tick_upper: 443630,
      // tick_lower: -443580,
      // tick_upper: 443580,
      
      // tick_lower: -443636,
      // tick_upper: 443636
      // tick_lower: 48200,
      // tick_upper: 54400,
      // farms_pool_id: '0x9f5fd63b2a2fd8f698ff6b7b9720dbb2aa14bedb9fc4fd6411f20e5b531a4b89',
      tick_lower: -6,
      tick_upper: 1,

    }

    console.log(`🚀 ~ calculateRebalance params: `, {
      pool_id: poolId,
      coin_type_a,
      coin_type_b,
      coin_decimal_a: 6,
      coin_decimal_b: 9,
      amount_a: rebalanceAmountA,
      amount_b: rebalanceAmountB,
      tick_lower: newPos.tick_lower,
      tick_upper: newPos.tick_upper,
      current_sqrt_price: current_sqrt_price.toString(),
      slippage,
    })
    


    const rebalancePre = await sdk.Compound.calculateRebalance({
      pool_id: poolId,
      coin_type_a,
      coin_type_b,
      coin_decimal_a: 6,
      coin_decimal_b: 9,
      amount_a: rebalanceAmountA,
      amount_b: rebalanceAmountB,
      tick_lower: newPos.tick_lower,
      tick_upper: newPos.tick_upper,
      current_sqrt_price: current_sqrt_price.toString(),
      slippage,
    })


    
    
    // console.log("🚀 ~ rebalancePre:", rebalancePre)

    console.log('createMovePositionPayload params: ', {
      oldPos,
      newPos,
      rebalancePre,
      slippage,
      rewarderMergeOption,
      have_claim,
    })


    let tx = new Transaction()

    tx = await sdk.Compound.createMovePositionPayload({
      oldPos,
      newPos,
      rebalancePre,
      slippage,
      rewarderMergeOption,
      have_claim,
    }, tx)

    printTransaction(tx)


    let isSimulation = true
    if (isSimulation) {
      const res = await sdk.FullClient.sendSimulationTransaction(tx, address)
      console.log('Deposit Transaction Simulation Result:', res?.effects?.status?.status === 'success' ? res?.events : res)
    } else {
      const res = await sdk.FullClient.sendTransaction(send_key_pair, tx)
      console.log('Deposit Transaction Simulation Result:', res?.events)
    }
    
  })

  // test('createMovePositionPayload with farms pool', async () => {
  //   const slippage = 0.005
  //   // const coin_decimal_a = 9
  //   // const coin_decimal_b = 9
  //   const {coin_type_a, coin_type_b, current_sqrt_price} = pool!
  //   const rewarder_coin_types = pool!.rewarder_infos.map((info) => info.coin_type)

  //   let rebalanceAmountA = '0'
  //   let rebalanceAmountB = '0'



  //   // const oldPosInfo = await sdk.ClmmSDK.Position.getPositionById(posId)
  //   const oldPosInfo = await sdk.FarmsSDK.Farms.getFarmsPositionNFT(posId)
  //   console.log("🚀 ~ oldPosInfo:", oldPosInfo)
  //   const lowerSqrtPrice = TickMath.tickIndexToSqrtPriceX64(oldPosInfo.tick_lower_index)
  //   const upperSqrtPrice = TickMath.tickIndexToSqrtPriceX64(oldPosInfo.tick_upper_index)
  //   const oldPosAmounts  = ClmmPoolUtil.getCoinAmountFromLiquidity(
  //     new BN(oldPosInfo!.liquidity),
  //     new BN(current_sqrt_price),
  //     lowerSqrtPrice,
  //     upperSqrtPrice,
  //     true
  //   )
  //   console.log("🚀 ~ oldPosAmounts:", oldPosAmounts)

  //   const oldPosAmountAWithSlippage = d(oldPosAmounts.coin_amount_a).mul(d(1 - slippage)).floor().toString()
  //   console.log("🚀 ~ oldPosAmountAWithSlippage:", oldPosAmountAWithSlippage)
  //   const oldPosAmountBWithSlippage = d(oldPosAmounts.coin_amount_b).mul(d(1 - slippage)).floor().toString()
  //   console.log("🚀 ~ oldPosAmountBWithSlippage:", oldPosAmountBWithSlippage)
   
    
  //   rebalanceAmountA = oldPosAmountAWithSlippage
  //   rebalanceAmountB = oldPosAmountBWithSlippage
    
  //   const oldPos = {
  //     pool_id: poolId,
  //     pos_id: posId,
  //     // pos_id: oldPosInfo.clmm_position_id,
  //     coin_type_a: coin_type_a,
  //     coin_type_b: coin_type_b,
  //     rewarder_coin_types,
  //     liquidity: oldPosInfo!.liquidity,
  //     min_amount_a: oldPosAmountAWithSlippage,
  //     min_amount_b: oldPosAmountBWithSlippage,
  //     farms_pool_id: farmId,
  //     clmm_pos_id: oldPosInfo.clmm_position_id,
  //     not_close: false
  //   }
  //   console.log("🚀 ~ oldPos:", oldPos)
  //   // return

  //   const have_claim = false 
  //   let rewarderMergeOption
  //   if (!have_claim) {
  //     const curr_tick = TickMath.sqrtPriceX64ToTickIndex(new BN(current_sqrt_price))

  //     const feeAndRewardResult = await sdk.Compound.getFeeAndReward({
  //       pool_id: poolId,
  //       position_id: oldPosInfo.clmm_position_id,
  //       coin_type_a: coin_type_a,
  //       coin_type_b: coin_type_b,
  //       rewarder_types: rewarder_coin_types,
  //       merge_swap_target_coin_type: curr_tick >= oldPosInfo.tick_upper_index ? coin_type_b : coin_type_a,
  //       not_merge_coins: []
  //     })
  //     console.log("🚀 ~ feeAndRewardResult:", feeAndRewardResult)

  //     if (feeAndRewardResult?.merge_routers) {
  //       rewarderMergeOption = {
  //         merge_routers: feeAndRewardResult?.merge_routers,
  //         slippage,
  //         not_merge_coins: []
  //       }
  //     }

  //     rebalanceAmountA = d(feeAndRewardResult.coin_amount_a).add(rebalanceAmountA).floor().toString()
  //     rebalanceAmountB = d(feeAndRewardResult.coin_amount_b).add(rebalanceAmountB).floor().toString()
  //   }

  //   const newPos = {
  //     // tick_lower: -443630,
  //     // tick_upper: 443630,
  //     // tick_lower: -443580,
  //     // tick_upper: 443580,
      
  //     // tick_lower: -443636,
  //     // tick_upper: 443636

  //     tick_lower: 640,
  //     tick_upper: 652,
  //     farms_pool_id: farmId
  //   }

  //   console.log(`🚀 ~ calculateRebalance params: `, {
  //     pool_id: poolId,
  //     coin_type_a,
  //     coin_type_b,
  //     coin_decimal_a: 6,
  //     coin_decimal_b: 9,
  //     amount_a: rebalanceAmountA,
  //     amount_b: rebalanceAmountB,
  //     tick_lower: newPos.tick_lower,
  //     tick_upper: newPos.tick_upper,
  //     current_sqrt_price: current_sqrt_price.toString(),
  //     slippage,
  //   })
    


  //   const rebalancePre = await sdk.Compound.calculateRebalance({
  //     pool_id: poolId,
  //     coin_type_a,
  //     coin_type_b,
  //     coin_decimal_a: 6,
  //     coin_decimal_b: 9,
  //     amount_a: rebalanceAmountA,
  //     amount_b: rebalanceAmountB,
  //     tick_lower: newPos.tick_lower,
  //     tick_upper: newPos.tick_upper,
  //     current_sqrt_price: current_sqrt_price.toString(),
  //     slippage,
  //   })
    
  //   // console.log("🚀 ~ rebalancePre:", rebalancePre)

  //   console.log('createMovePositionPayload farms params: ', {
  //     oldPos,
  //     newPos,
  //     rebalancePre,
  //     slippage,
  //     rewarderMergeOption,
  //     have_claim,
  //   })

  //   return

  //   let tx = new Transaction()

  //   tx = await sdk.Compound.createMovePositionPayload({
  //     oldPos,
  //     newPos,
  //     rebalancePre,
  //     slippage,
  //     rewarderMergeOption,
  //     have_claim,
  //   }, tx)

  //   printTransaction(tx)


  //   let isSimulation = true
  //   if (isSimulation) {
  //     const res = await sdk.FullClient.sendSimulationTransaction(tx, address)
  //     console.log('Deposit Transaction Simulation Result:', res?.effects?.status?.status === 'success' ? res?.events : res)
  //   } else {
  //     const res = await sdk.FullClient.sendTransaction(send_key_pair, tx)
  //     console.log('Deposit Transaction Simulation Result:', res?.events)
  //   }
    
  // })


  test('closeAndHarvestFarmsPos: ', async () => {
    const params = {
        pool_id: '0xa528b26eae41bcfca488a9feaa3dca614b2a1d9b9b5c78c256918ced051d4c50',
        farms_pool_id: '0xa67a2c2ea1bfad784e44eaf079fbf4523f549dcbe2e1c838989aef9383e372da',
        pos_id: '0x0f0c22151cfce1166abf18755d48550a9917eca68935499f1c551e5aee945f4a',
        coin_type_a: '0xf325ce1300e8dac124071d3152c5c5ee6174914f8bc2161e88329cf579246efc::afsui::AFSUI',
        coin_type_b: '0x2::sui::SUI',
        min_amount_a: '289504710',
        min_amount_b: '1214532000',
        rewarder_coin_types: [
          // '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI'
        ],
        delta_liquidity: '78325277346',
        not_close: true
      }

      let tx = new Transaction()

     const  {returnAmountA, returnAmountB} = await sdk.Compound.closeAndHarvestFarmsPos(params, tx)

     tx.transferObjects([returnAmountA, returnAmountB], address)
  
      printTransaction(tx)
  
  
      let isSimulation = true
      if (isSimulation) {
        const res = await sdk.FullClient.sendSimulationTransaction(tx, address)
        console.log('Deposit Transaction Simulation Result:', res?.effects?.status?.status === 'success' ? res?.events : res)
      } else {
        const res = await sdk.FullClient.sendTransaction(send_key_pair, tx)
        console.log('Deposit Transaction Simulation Result:', res?.events)
      }
  })

})
