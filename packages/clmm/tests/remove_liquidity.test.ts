import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import BN from 'bn.js'
import { adjustForCoinSlippage, ClmmPoolUtil, d, Percentage, printTransaction, TickMath } from '@cetusprotocol/common-sdk'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import 'isomorphic-fetch'
import CetusClmmSDK, { ClosePositionParams, RemoveLiquidityParams } from '../src'

let send_key_pair: Ed25519Keypair

const poolId = '0xdd83e7fbee4f22b28c212d108379435f299dcc47cd0e4cd196cecb6a78e439d1'
const position_nft_id = '0x67ff4a016f0d0984ee5a816426f00853da432bacb071c709627eb3ac12419834'

describe('remove liquidity', () => {
  const sdk = CetusClmmSDK.createSDK({ env: 'testnet' })

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    sdk.setSenderAddress(send_key_pair.getPublicKey().toSuiAddress())
  })

  test('getCoinAmountFromLiquidity', async () => {
    const pool = await sdk.Pool.getPool(poolId)
    const position = await sdk.Position.getPositionById(position_nft_id)
    const curSqrtPrice = new BN(pool.current_sqrt_price)

    const lowerSqrtPrice = TickMath.tickIndexToSqrtPriceX64(position.tick_lower_index)
    const upperSqrtPrice = TickMath.tickIndexToSqrtPriceX64(position.tick_upper_index)
    const coinAmounts = ClmmPoolUtil.getCoinAmountFromLiquidity(
      new BN(Number(d(position.liquidity))),
      curSqrtPrice,
      lowerSqrtPrice,
      upperSqrtPrice,
      true
    )

    console.log('coinA: ', coinAmounts.coin_amount_a.toString())
    console.log('coinB: ', coinAmounts.coin_amount_b.toString())
  })

  test('remove liquidity for input one token', async () => {
    const pool = await sdk.Pool.getPool(poolId)
    const position = await sdk.Position.getPositionById(position_nft_id)
    const lowerTick = position.tick_lower_index
    const upperTick = position.tick_upper_index
    const coinAmount = new BN(592)
    const fix_amount_a = true
    const slippage = 0.05
    const curSqrtPrice = new BN(TickMath.tickIndexToSqrtPriceX64(Number(pool.current_tick_index)))

    const liquidityInput = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
      lowerTick,
      upperTick,
      coinAmount,
      fix_amount_a,
      false,
      slippage,
      curSqrtPrice
    )

    const liquidity = liquidityInput.liquidity_amount.toString()

    const removeLiquidityParams: RemoveLiquidityParams = {
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      delta_liquidity: liquidity,
      min_amount_a: liquidityInput.coin_amount_limit_a,
      min_amount_b: liquidityInput.coin_amount_limit_b,
      pool_id: pool.id,
      pos_id: position.pos_object_id,
      rewarder_coin_types: [],
      collect_fee: true,
    }

    const payload = await sdk.Position.removeLiquidityPayload(removeLiquidityParams)

    printTransaction(payload)

    const transferTxn = await sdk.FullClient.executeTx(send_key_pair, payload, true)
    console.log('removeLiquidity: ', transferTxn)
  })
  test('remove liquidity for input liquidity', async () => {
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

    const removeLiquidityParams: RemoveLiquidityParams = {
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      delta_liquidity: liquidity.toString(),
      min_amount_a: coin_amount_limit_a.toString(),
      min_amount_b: coin_amount_limit_b.toString(),
      pool_id: pool.id,
      pos_id: position.pos_object_id,
      rewarder_coin_types: [...rewardCoinTypes],
      collect_fee: true,
    }

    const removeLiquidityTransactionPayload = await sdk.Position.removeLiquidityPayload(removeLiquidityParams)

    printTransaction(removeLiquidityTransactionPayload)

    const transferTxn = await sdk.FullClient.executeTx(send_key_pair, removeLiquidityTransactionPayload, true)
    console.log('removeLiquidity: ', transferTxn)
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

    const removeLiquidityParams: ClosePositionParams = {
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      min_amount_a: coin_amount_limit_a.toString(),
      min_amount_b: coin_amount_limit_b.toString(),
      pool_id: pool.id,
      pos_id: position.pos_object_id,
      rewarder_coin_types: [...rewardCoinTypes],
      collect_fee: true,
    }

    const removeLiquidityTransactionPayload = await sdk.Position.closePositionPayload(removeLiquidityParams)

    printTransaction(removeLiquidityTransactionPayload)

    const transferTxn = await sdk.FullClient.executeTx(send_key_pair, removeLiquidityTransactionPayload, true)
    console.log('removeLiquidity: ', transferTxn)
  })
})
