import { buildTestAccount } from '@cetusprotocol/test-utils'
import 'isomorphic-fetch'
import CetusClmmSDK, { parseCurrentRewardPeriodEmission, parseRewardPeriodEmission } from '../src'
import { Transaction } from '@mysten/sui/transactions'

const poolId = '0x39608bc3d0dfe6605ab0c6e9186f9148bdda74ff68c8201a54171e70d9502351'
const position_nft_id = '0x391caafcb55a014bb91f50989f0ca5993e6ae4652d3f8de7e560b23d9682da78'

// pnpm test -- packages/clmmV2/tests/rewarder.test.ts -t fetchPosRewardersAmount
describe('Rewarder Module', () => {
  const sdk = CetusClmmSDK.createSDK({ env: 'testnet' })

  let send_key_pair = buildTestAccount()
  sdk.setSenderAddress(send_key_pair.getPublicKey().toSuiAddress())

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
  })


  test('getRewardPeriodEmission', async () => {
    const currentTime = new Date().getTime() / 1000
    const res = await sdk.Rewarder.getRewardPeriodEmission(
      '0x39f19b89cf7241a0b977acdbcddb08393955b09f8d0a9e26d37fd56b10506eb3',
      '2312.447760407727811683242617746270042289324919693171977996826171',
      1770183804
    )
    console.log('🚀 ~ test ~ res:', JSON.stringify(res, null, 2))
    const result = parseRewardPeriodEmission(res, currentTime, currentTime + 60 * 60 * 24 * 20, 60 * 60 * 24)
    console.log('🚀 ~ test ~ result:', JSON.stringify(result, null, 2))
    const currentEmission = parseCurrentRewardPeriodEmission(res)
    console.log('🚀 ~ test ~ currentEmission:', currentEmission)
  })

  test('fetchPosRewardersAmount', async () => {
    const pool = await sdk.Pool.getPool(poolId)
    const rewarderAmounts = await sdk.Rewarder.fetchPosRewardersAmount([{
      pool_id: poolId,
      position_id: position_nft_id,
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      recalculate: true,
      rewarder_coin_types: pool.reward_manager.rewards.map(reward => reward.reward_coin),
    }])
    console.log("fetchPosRewardersAmount: ", JSON.stringify(rewarderAmounts, null, 2))
  })


  test('collectRewarder', async () => {
    const pool = await sdk.Pool.getPool(poolId)
    const tx = new Transaction()
    sdk.Rewarder.collectRewarder({
      pool_id: poolId,
      position_id: position_nft_id,
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      recalculate: true,
      rewarder_coin_types: pool.reward_manager.rewards.map(reward => reward.reward_coin),
    }, tx)
    const transferTxn = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('collectRewarder: ', transferTxn)
  })




})
