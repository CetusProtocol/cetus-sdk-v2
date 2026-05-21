import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import BN from 'bn.js'
import { adjustForCoinSlippage, ClmmPoolUtil, d, Percentage, printTransaction, TickMath } from '@cetusprotocol/common-sdk'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import 'isomorphic-fetch'
import CetusClmmSDK, { ClosePositionParams, RemoveLiquidityParams } from '../src'
import { Transaction } from '@mysten/sui/transactions'

let send_key_pair: Ed25519Keypair

const poolId = '0xb8d7d9e66a60c239e7a60110efcf8de6c705580ed924d0dde141f4a0e2c90105'
const position_nft_id = '0xe75defa5883cf236ccafb4910094cdd4e1ad0a0da637dce4a380e1061599e52b'

describe('remove liquidity', () => {
  const sdk = CetusClmmSDK.createSDK({ env: 'mainnet' })

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
    const coinAmount = new BN(52)
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

    const payload = await sdk.Position.removeLiquidityPayload(removeLiquidityParams) as Transaction

    printTransaction(payload)

    const transferTxn = await sdk.FullClient.executeTx(send_key_pair, payload, true)
    console.log('removeLiquidity: ', transferTxn)
  })
  test('11 remove liquidity for input liquidity', async () => {
    const pool = await sdk.Pool.getPool(poolId)
    const position = await sdk.Position.getPositionById(position_nft_id)

    const lowerTick = Number(position.tick_lower_index)
    const upperTick = Number(position.tick_upper_index)

    const lowerSqrtPrice = TickMath.tickIndexToSqrtPriceX64(lowerTick)
    const upperSqrtPrice = TickMath.tickIndexToSqrtPriceX64(upperTick)

    const liquidity = new BN(2000)
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

    const removeLiquidityTransactionPayload = await sdk.Position.removeLiquidityPayload(removeLiquidityParams) as Transaction

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

    const transferTxn = await sdk.FullClient.executeTx(send_key_pair, removeLiquidityTransactionPayload, false)
    console.log('removeLiquidity: ', transferTxn)
  })
})
