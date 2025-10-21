// buildTestAccount
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import { CetusDlmmSDK } from '../src/sdk'
import { printTransaction } from '@cetusprotocol/common-sdk'
import { parseLiquidityShares } from '../src/utils/parseData'

const pool_id = '0x94088f9a28a6b355ab3569b9cc32895dbccf4c6716f030d59d3f0cf747305ec9'
const position_id = '0x4c9ff5d666bfd1fc01f102df3c77bd3fdd51f248cad8ef02d250c60ed708a004'

describe('dlmm position', () => {
  const sdk = CetusDlmmSDK.createSDK({ env: 'testnet' })
  let send_key_pair: Ed25519Keypair
  let account: string

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    account = send_key_pair.getPublicKey().toSuiAddress()
    sdk.setSenderAddress(account)
  })

  test('get owner position list', async () => {
    const res = await sdk.Position.getOwnerPositionList(account)
    console.log('🚀 ~ test ~ res:', res)
  })

  test('getPosition', async () => {
    const res = await sdk.Position.getPosition('0x8d9fee92ddfcf1ec7688124a2bcf5a102acd70e470546170aa2db334f8081eba')
    console.log('🚀 ~ test ~ res:', res)
  })

  test('get position', async () => {
    const pool = await sdk.Pool.getPool('0x9ec24e51ba5083a800538622ef42343de80f62e9b3f2a507ed409ca0155cff35')
    const res = await sdk.Position.getPosition('0xe7b049747668f198137adbbba21c5e03ab56266bf5273413a1713e097f7482ae')
    console.log('🚀 ~ test ~ res:', res)

    const active_bin = await sdk.Pool.getBinInfo(pool.bin_manager.bin_manager_handle, pool.active_id, pool.bin_step)
    console.log('🚀 ~ test ~ active_bin:', active_bin)
    const data = parseLiquidityShares(res.liquidity_shares, pool.bin_step, res.lower_bin_id, active_bin)
    console.log('🚀 ~ test ~ data:', data)
  })

  test('fetchPositionFeeAndReward', async () => {
    const pool = await sdk.Pool.getPool('0x4bb32fb02ed81c8a3d9702a86df73fff9215e63577c7a8ef3874ada8e01cac37')
    const { id, coin_type_a, coin_type_b, reward_manager } = pool

    const res = await sdk.Position.fetchPositionFeeAndReward([
      {
        pool_id: id,
        position_id: '0x8d9fee92ddfcf1ec7688124a2bcf5a102acd70e470546170aa2db334f8081eba',
        reward_coins: reward_manager.rewards.map((reward) => reward.reward_coin),
        coin_type_a: coin_type_a,
        coin_type_b: coin_type_b,
      },
    ])

    console.log('🚀 ~ test ~ res:', JSON.stringify(res, null, 2))
  })
  test('collectRewardAndFeePayload', async () => {
    const pool = await sdk.Pool.getPool(pool_id)
    const { id, coin_type_a, coin_type_b, reward_manager } = pool

    const tx = sdk.Position.collectRewardAndFeePayload([
      {
        pool_id: id,
        position_id: position_id,
        reward_coins: reward_manager.rewards.map((reward) => reward.reward_coin),
        coin_type_a,
        coin_type_b,
      },
    ])
    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('🚀 ~ test ~ res:', res)
  })
})
