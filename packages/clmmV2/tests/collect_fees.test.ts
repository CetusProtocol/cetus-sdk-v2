import 'isomorphic-fetch'
import { CetusClmmV2SDK } from '../src/sdk'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import { Transaction } from '@mysten/sui/transactions'

const poolId = '0xbeaaf89a1aa4469b2d5a760801c1c5d65d1b26f14051b0692e2a8c7392fcb1da'
const position_nft_id = '0x4b16cd28d74f93653cc44e45edf929811b29302f9ff286c7ee9cab77dce4dda8'


describe('collect fees', () => {
  let send_key_pair = buildTestAccount()
  const sdk = CetusClmmV2SDK.createSDK({ env: 'testnet' })
  sdk.setSenderAddress(send_key_pair.getPublicKey().toSuiAddress())

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
  })


  test('fetchPosFeeAmount', async () => {
    const pool = await sdk.Pool.getPool(poolId)
    const res = await sdk.Position.fetchPosFeeAmount([{
      pool_id: poolId,
      position_id: position_nft_id,
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      recalculate: true,
    }])
    console.log('res####', res)
  })


  test('collectFee', async () => {
    const pool = await sdk.Pool.getPool(poolId)
    const tx = new Transaction()
    sdk.Position.collectFee({
      pool_id: poolId,
      position_id: position_nft_id,
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      recalculate: true,
    }, tx)
    const transferTxn = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('collectFee: ', transferTxn)
  })
})
