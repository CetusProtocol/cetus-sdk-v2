import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import BN from 'bn.js'
import { ClmmPoolUtil, printTransaction, TickMath, toDecimalsAmount } from '@cetusprotocol/common-sdk'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import 'isomorphic-fetch'
import { AddLiquidityFixTokenParams, CustomRangeParams, FullRangeParams } from '../src'
import { CetusClmmSDK } from '../src/sdk'
import { SuiClient } from '@mysten/sui/client'

let send_key_pair: Ed25519Keypair
const poolId = '0xdd83e7fbee4f22b28c212d108379435f299dcc47cd0e4cd196cecb6a78e439d1'
const position_nft_id = '0x67ff4a016f0d0984ee5a816426f00853da432bacb071c709627eb3ac12419834'

describe('add_liquidity_fix_token', () => {
  const sdk = CetusClmmSDK.createSDK({ env: 'testnet' })

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    sdk.setSenderAddress(send_key_pair.getPublicKey().toSuiAddress())
  })

  test('1: custom tick range open_and_add_liquidity_fix_token', async () => {
    const pool = await sdk.Pool.getPool(poolId)
    console.log('🚀 -----------------------🚀')
    console.log('🚀 ~ test ~ pool:', pool)
    console.log('🚀 -----------------------🚀')

    const tick_lower_index = TickMath.getPrevInitializeTickIndex(
      new BN(pool.current_tick_index).toNumber(),
      new BN(pool.tick_spacing).toNumber()
    )
    const tick_upper_index = TickMath.getNextInitializeTickIndex(
      new BN(pool.current_tick_index).toNumber(),
      new BN(pool.tick_spacing).toNumber()
    )
    const coinAmount = new BN(100000)
    const fix_amount_a = true
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

    const addLiquidityPayloadParams: AddLiquidityFixTokenParams = {
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      pool_id: pool.id,
      tick_lower: tick_lower_index.toString(),
      tick_upper: tick_upper_index.toString(),
      fix_amount_a,
      amount_a,
      amount_b,
      slippage,
      is_open: true,
      rewarder_coin_types: [],
      collect_fee: false,
      pos_id: '',
    }
    const tx = await sdk.Position.createAddLiquidityFixTokenPayload(addLiquidityPayloadParams, {
      slippage: slippage,
      cur_sqrt_price: curSqrtPrice,
    })

    printTransaction(tx)
    const transferTxn = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('open_and_add_liquidity_fix_token: ', transferTxn)
  })

  test('2:  add_liquidity_fix_token', async () => {
    const pool = await sdk.Pool.getPool(poolId)
    const position = await sdk.Position.getPositionById(position_nft_id)
    const tick_lower_index = position.tick_lower_index
    const tick_upper_index = position.tick_upper_index
    const coinAmount = new BN(500)
    const fix_amount_a = true
    const slippage = 0.1
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

    const addLiquidityPayloadParams: AddLiquidityFixTokenParams = {
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      pool_id: pool.id,
      tick_lower: tick_lower_index.toString(),
      tick_upper: tick_upper_index.toString(),
      fix_amount_a,
      amount_a,
      amount_b,
      slippage,
      is_open: false,
      pos_id: position.pos_object_id,
      rewarder_coin_types: [],
      collect_fee: true,
    }
    const addLiquidityPayload = await sdk.Position.createAddLiquidityFixTokenPayload(addLiquidityPayloadParams)

    printTransaction(addLiquidityPayload)

    const transferTxn = await sdk.FullClient.executeTx(send_key_pair, addLiquidityPayload, false)
    console.log('add_liquidity_fix_token: ', transferTxn)
  })

  test('3: custom price range open and add liquidity ', async () => {
    const params: CustomRangeParams = {
      is_full_range: false,
      min_price: '0.2',
      max_price: '0.7',
      coin_decimals_a: 6,
      coin_decimals_b: 9,
      price_base_coin: 'coin_a',
    }

    const result = await sdk.Position.calculateAddLiquidityResultWithPrice({
      add_mode_params: params,
      pool_id: poolId,
      slippage: 0.01,
      coin_amount: toDecimalsAmount(1, 6).toString(),
      fix_amount_a: true,
    })

    console.log('result: ', result)

    const payload = await sdk.Position.createAddLiquidityFixCoinWithPricePayload({
      pool_id: poolId,
      calculate_result: result,
      add_mode_params: params,
    })

    printTransaction(payload)

    const transfer_txn = await sdk.FullClient.executeTx(send_key_pair, payload, true)
    console.log('createAddLiquidityPayload: ', transfer_txn)
  })

  test('4: full range price range open and add liquidity ', async () => {
    const params: FullRangeParams = {
      is_full_range: true,
    }

    const result = await sdk.Position.calculateAddLiquidityResultWithPrice({
      add_mode_params: params,
      pool_id: poolId,
      slippage: 0.01,
      coin_amount: toDecimalsAmount(1, 6).toString(),
      fix_amount_a: true,
    })

    console.log('result: ', result)

    const payload = await sdk.Position.createAddLiquidityFixCoinWithPricePayload({
      pool_id: poolId,
      calculate_result: result,
      add_mode_params: params,
    })

    printTransaction(payload)

    const transfer_txn = await sdk.FullClient.executeTx(send_key_pair, payload, false)
    console.log('createAddLiquidityPayload: ', transfer_txn)
  })
})
