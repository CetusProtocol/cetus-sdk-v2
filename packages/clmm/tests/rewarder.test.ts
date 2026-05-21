import { buildTestAccount } from '@cetusprotocol/test-utils'
import 'isomorphic-fetch'
import CetusClmmSDK, { CollectRewarderParams } from '../src'

const poolId = '0x51e883ba7c0b566a26cbc8a94cd33eb0abd418a77cc1e60ad22fd9b1f29cd2ab'
const position_nft_id = '0xe6cf790521d1c32673de1b5ac39039e9e37046e4001544d61f603d2264e35350'
describe('Rewarder Module', () => {
  const sdk = CetusClmmSDK.createSDK({ env: 'mainnet' })

  test('emissionsEveryDay', async () => {
    const emissionsEveryDay = await sdk.Rewarder.emissionsEveryDay(poolId)
    console.log(emissionsEveryDay)
  })

  test('posRewardersAmount', async () => {
    const pool = await sdk.Pool.getPool(poolId)
    console.log('pool', pool)

    const rewardCoinTypes = pool.rewarder_infos.map((rewarder) => rewarder.coin_type)

    const res = await sdk.Rewarder.fetchPosRewardersAmount([
      {
        coin_type_a: pool.coin_type_a,
        coin_type_b: pool.coin_type_b,
        rewarder_types: rewardCoinTypes,
        pool_id: pool.id,
        position_id: position_nft_id
      },
    ])
    console.log('posRewardersAmount-res：', res[0])
  })

  test('batchFetchPositionRewarders', async () => {
    const res = await sdk.Rewarder.batchFetchPositionRewarders([position_nft_id])
    console.log('batchFetchPositionRewarders-res：', res)
  })

  test('collectPoolRewarderTransactionPayload', async () => {
    const send_key_pair = buildTestAccount()
    sdk.setSenderAddress(send_key_pair.getPublicKey().toSuiAddress())

    const pool = await sdk.Pool.getPool(poolId)

    const rewardCoinTypes = pool.rewarder_infos.map((rewarder) => rewarder.coin_type)

    const collectRewarderParams: CollectRewarderParams = {
      pool_id: pool.id,
      pos_id: position_nft_id,
      rewarder_coin_types: [...rewardCoinTypes],
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      collect_fee: true,
    }

    const collectRewarderPayload = await sdk.Rewarder.collectRewarderPayload(collectRewarderParams)

    const transferTxn = await sdk.FullClient.executeTx(send_key_pair, collectRewarderPayload, true)
    console.log('collectRewarderPayload: ', JSON.stringify(transferTxn, null, 2))
  })
})
