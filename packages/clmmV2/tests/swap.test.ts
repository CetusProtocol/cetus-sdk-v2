// buildTestAccount
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import { CetusClmmV2SDK } from '../src/sdk'
import { printTransaction, toDecimalsAmount } from '@cetusprotocol/common-sdk'

const pool_id = '0x8fce9bc380ea7766eeb61a2c0e752cf45cd0dc493b60e10cd19e3579dd583735'

describe('dlmm swap', () => {
  const sdk = CetusClmmV2SDK.createSDK({ env: 'testnet' })
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
      a2b: false,
      by_amount_in: true,
      amount: toDecimalsAmount(10, 9),
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
      amount: '100000',
      coin_type_a,
      coin_type_b,
    })
    console.log('🚀 ~ test ~ quote_obj:', quote_obj)

    const tx = sdk.Swap.swap({
      coin_type_a,
      coin_type_b,
      by_amount_in,
      amount_in: quote_obj.amount_in,
      amount_out: quote_obj.amount_out,
      slippage: 0.01,
      pool_id,
      a2b: true,
    })

    printTransaction(tx)

    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
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
      amount: '30000000',
      coin_type_a,
      coin_type_b,
    })
    console.log('🚀 ~ test ~ quote_obj:', quote_obj)

    const tx = sdk.Swap.swap({
      coin_type_a,
      coin_type_b,
      amount_in: quote_obj.amount_in,
      amount_out: quote_obj.amount_out,
      slippage: 0.01,
      pool_id,
      a2b: false,
      by_amount_in,
    })

    printTransaction(tx)

    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('🚀 ~ test ~ res:', res)
  })
})
