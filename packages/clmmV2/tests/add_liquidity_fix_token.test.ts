import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import BN from 'bn.js'
import { ClmmPoolUtil, printTransaction, TickMath } from '@cetusprotocol/common-sdk'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import 'isomorphic-fetch'
import { AddLiquidityFixCoinOptions } from '../src'
import { CetusClmmV2SDK } from '../src/sdk'
import { Transaction } from '@mysten/sui/transactions'

let send_key_pair: Ed25519Keypair
const poolId = '0x39608bc3d0dfe6605ab0c6e9186f9148bdda74ff68c8201a54171e70d9502351'
const position_nft_id = '0x7f0393249ba24162af30e7b701b7ccbf45720a6e869d8aecd8c5ca331e3380f7'

// pnpm test -- packages/clmmV2/tests/add_liquidity_fix_token.test.ts -t
describe('add_liquidity_fix_token', () => {
  const sdk = CetusClmmV2SDK.createSDK({ env: 'testnet' })

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    sdk.setSenderAddress(send_key_pair.getPublicKey().toSuiAddress())
  })

  test('open_and_add_liquidity_fix_token', async () => {
    const pool = await sdk.Pool.getPool(poolId)
    console.log('🚀 ~ test ~ pool:', pool)


    const tick_lower_index = -20
    const tick_upper_index = 20
    const coinAmount = new BN(1000000)
    const fix_amount_a = false
    const slippage = 0.01
    const curSqrtPrice = new BN(pool.current_sqrt_price)

    const liquidityInput = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
      tick_lower_index,
      tick_upper_index,
      coinAmount,
      fix_amount_a,
      true,
      slippage,
      curSqrtPrice
    )

    const amount_a = fix_amount_a ? coinAmount.toNumber() : Number(liquidityInput.coin_amount_limit_a)
    const amount_b = fix_amount_a ? Number(liquidityInput.coin_amount_limit_b) : coinAmount.toNumber()

    console.log('amount: ', { amount_a, amount_b })

    const tx = new Transaction()
    const option: AddLiquidityFixCoinOptions = {
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      pool_id: pool.id,
      fix_amount_a,
      position: {
        tick_lower: tick_lower_index.toString(),
        tick_upper: tick_upper_index.toString(),
      },
      amount_a: amount_a.toString(),
      amount_b: amount_b.toString(),
    }
    sdk.Position.addLiquidityFixCoin(option, tx)

    printTransaction(tx)
    const transferTxn = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('open_and_add_liquidity_fix_token: ', transferTxn)
  })

  test('2:  add liquidity', async () => {
    const pool = await sdk.Pool.getPool(poolId)
    console.log('🚀 ~ test ~ pool:', pool)
    const position = await sdk.Position.getPositionById(position_nft_id)
    console.log('🚀 ~ test ~ position:', position)

    const tick_lower_index = position.tick_lower_index
    const tick_upper_index = position.tick_upper_index
    const coinAmount = new BN(1000000)
    const fix_amount_a = false
    const slippage = 0.01
    const curSqrtPrice = new BN(pool.current_sqrt_price)

    const liquidityInput = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
      tick_lower_index,
      tick_upper_index,
      coinAmount,
      fix_amount_a,
      true,
      slippage,
      curSqrtPrice
    )

    const amount_a = fix_amount_a ? coinAmount.toNumber() : Number(liquidityInput.coin_amount_limit_a)
    const amount_b = fix_amount_a ? Number(liquidityInput.coin_amount_limit_b) : coinAmount.toNumber()

    console.log('amount: ', { amount_a, amount_b })

    const tx = new Transaction()
    const option: AddLiquidityFixCoinOptions = {
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      pool_id: pool.id,
      fix_amount_a,
      position: {
        position_id: position.pos_object_id,
        collect_fee: true,
        rewarder_coin_types: pool.reward_manager.rewards.map(reward => reward.reward_coin),
      },
      amount_a: amount_a.toString(),
      amount_b: amount_b.toString(),
    }
    sdk.Position.addLiquidityFixCoin(option, tx)

    printTransaction(tx)
    const transferTxn = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('add_liquidity: ', transferTxn)
  })


})
