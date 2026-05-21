// buildTestAccount
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import { CetusDlmmSDK } from '../src/sdk'
import { printTransaction } from '@cetusprotocol/common-sdk'

const pool_id = '0x64e590b0e4d4f7dfc7ae9fae8e9983cd80ad83b658d8499bf550a9d4f6667076'

describe('dlmm swap', () => {
  const sdk = CetusDlmmSDK.createSDK({ env: 'mainnet' })
  let send_key_pair: Ed25519Keypair
  let account: string

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    account = send_key_pair.getPublicKey().toSuiAddress()
    sdk.setSenderAddress(account)
  })

  test('preSwapQuote', async () => {
    const pool = await sdk.Pool.getPool(pool_id)
    const { id, coin_type_a, coin_type_b } = pool

    const quote = await sdk.Swap.preSwapQuote({
      pool_id,
      a2b: true,
      by_amount_in: true,
      in_amount: '20000',
      coin_type_a,
      coin_type_b,
    })
    console.log('🚀 ~ test ~ quote:', quote)
  })

  test('swap_a2b', async () => {
    const pool = await sdk.Pool.getPool(pool_id)
    const { id, coin_type_a, coin_type_b } = pool
    console.log('🚀 ~ test ~ pool:', pool)

    const by_amount_in = true

    const quote_obj = await sdk.Swap.preSwapQuote({
      pool_id,
      a2b: true,
      by_amount_in,
      in_amount: '100000',
      coin_type_a,
      coin_type_b,
    })
    console.log('🚀 ~ test ~ quote_obj:', quote_obj)

    const tx = sdk.Swap.swapPayload({
      coin_type_a,
      coin_type_b,
      quote_obj,
      by_amount_in,
      slippage: 0.01,
    })

    printTransaction(tx)

    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('🚀 ~ test ~ res:', res)
  })

  test('swap_b2a', async () => {
    const pool = await sdk.Pool.getPool(pool_id)
    const { id, coin_type_a, coin_type_b } = pool
    console.log('🚀 ~ test ~ pool:', pool)

    const by_amount_in = true

    const quote_obj = await sdk.Swap.preSwapQuote({
      pool_id,
      a2b: false,
      by_amount_in,
      in_amount: '30000000',
      coin_type_a,
      coin_type_b,
    })
    console.log('🚀 ~ test ~ quote_obj:', quote_obj)

    const tx = sdk.Swap.swapPayload({
      coin_type_a,
      coin_type_b,
      quote_obj,
      by_amount_in,
      slippage: 0.01,
    })

    printTransaction(tx)

    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('🚀 ~ test ~ res:', res)
  })
})
