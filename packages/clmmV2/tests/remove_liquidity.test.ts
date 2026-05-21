import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import BN from 'bn.js'
import { adjustForCoinSlippage, ClmmPoolUtil, d, Percentage, printTransaction, TickMath } from '@cetusprotocol/common-sdk'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import 'isomorphic-fetch'
import CetusClmmV2SDK, { ClosePositionOptions, RemoveLiquidityOptions } from '../src'
import { Transaction } from '@mysten/sui/transactions'

let send_key_pair: Ed25519Keypair

const poolId = '0xa97fa8998002f9e9f19fdd0bb02081e22bab2c6e66523aa9b627d7fd2d0ab578'
const position_nft_id = '0x7f0393249ba24162af30e7b701b7ccbf45720a6e869d8aecd8c5ca331e3380f7'

describe('remove liquidity', () => {
  const sdk = CetusClmmV2SDK.createSDK({ env: 'testnet' })

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    sdk.setSenderAddress(send_key_pair.getPublicKey().toSuiAddress())
  })


  test('remove liquidity for input one token', async () => {
    const pool = await sdk.Pool.getPool(poolId)
    const position = await sdk.Position.getPositionById(position_nft_id)
    const lowerTick = position.tick_lower_index
    const upperTick = position.tick_upper_index
    const coinAmount = new BN(100000)
    const fix_amount_a = false
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

    const option: RemoveLiquidityOptions = {
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      delta_liquidity: liquidity,
      min_amount_a: liquidityInput.coin_amount_limit_a,
      min_amount_b: liquidityInput.coin_amount_limit_b,
      pool_id: pool.id,
      rewarder_coin_types: [],
      collect_fee: true,
      position_id: position_nft_id,
    }
    const tx = new Transaction()
    sdk.Position.removeLiquidity(option, tx)

    printTransaction(tx)

    const transferTxn = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('removeLiquidity: ', transferTxn)
  })

  test('close position', async () => {
    const pool = await sdk.Pool.getPool(poolId)
    const position = await sdk.Position.getPositionById(position_nft_id)
    const lowerTick = position.tick_lower_index
    const upperTick = position.tick_upper_index
    const slippage = 0.05
    const curSqrtPrice = new BN(TickMath.tickIndexToSqrtPriceX64(Number(pool.current_tick_index)))

    const coinAmounts = ClmmPoolUtil.getCoinAmountFromLiquidity(
      new BN(position.liquidity),
      curSqrtPrice,
      new BN(TickMath.tickIndexToSqrtPriceX64(lowerTick)),
      new BN(TickMath.tickIndexToSqrtPriceX64(upperTick)),
      false,
    )

    const coin_amount_limit_a = d(coinAmounts.coin_amount_a).mul(1 - slippage).toFixed(0)
    const coin_amount_limit_b = d(coinAmounts.coin_amount_b).mul(1 - slippage).toFixed(0)


    const option: RemoveLiquidityOptions = {
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      delta_liquidity: position.liquidity,
      min_amount_a: coin_amount_limit_a,
      min_amount_b: coin_amount_limit_b,
      pool_id: pool.id,
      rewarder_coin_types: pool.reward_manager.rewards.map((rewardInfo) => rewardInfo.reward_coin),
      collect_fee: true,
      position_id: position_nft_id,
      close_position: true,
    }
    const tx = new Transaction()
    sdk.Position.removeLiquidity(option, tx)

    printTransaction(tx)

    const transferTxn = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('close position: ', transferTxn)
  })
})
