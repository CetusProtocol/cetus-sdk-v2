import 'isomorphic-fetch'
import { CetusClmmSDK } from '../src/sdk'
import { fixCoinType, printTransaction } from '@cetusprotocol/common-sdk'
import { buildTestAccount } from '@cetusprotocol/test-utils'

const sdk = CetusClmmSDK.createSDK({ env: 'mainnet' })

describe('vest test', () => {
  beforeEach(async () => {
    console.log('sdk env: ', sdk.sdkOptions.env)
  })

  test('getClmmVestInfoList', async () => {
    const vestInfoList = await sdk.Vest.getClmmVestInfoList()
    console.log('vestInfoList: ', vestInfoList)
  })

  test('getClmmVestInfo', async () => {
    const vestInfo = await sdk.Vest.getClmmVestInfo()
    console.log('vestInfo: ', vestInfo)
  })

  test('getPoolLiquiditySnapshot', async () => {
    const poolSnapshot = [
      {
        pool_id: '0x72f5c6eef73d77de271886219a2543e7c29a33de19a6c69c5cf1899f729c3f17',
        position_ids: ['0xd273592049c735b1a246d6ac5fcb53636c6abbbd15a5dac4b2db1c6e544088eb'],
      },
    ]

    for (const snapshot of poolSnapshot) {
      const { pool_id, position_ids } = snapshot
      const poolSnapshot = await sdk.Pool.getPoolLiquiditySnapshot(pool_id)
      const { remove_percent, snapshots } = poolSnapshot

      const posSnap = await sdk.Pool.getPositionSnapshot(snapshots.id, position_ids)
      console.log(`Pool ${pool_id} snapshot:`, {
        removePercent: remove_percent,
        posSnap: posSnap,
      })
    }
  })

  test('getPositionVesting', async () => {
    const vestingList = await sdk.Vest.getPositionVesting([
      {
        clmm_position_ids: ['0xd273592049c735b1a246d6ac5fcb53636c6abbbd15a5dac4b2db1c6e544088eb'],
        clmm_pool_id: '0x72f5c6eef73d77de271886219a2543e7c29a33de19a6c69c5cf1899f729c3f17',
        coin_type_a: '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL',
        coin_type_b: '0x2::sui::SUI',
      },
    ])
    console.log('vestingList: ', vestingList)
  })

  test('redeem', async () => {
    const send_key_pair = buildTestAccount()
    sdk.setSenderAddress(send_key_pair.getPublicKey().toSuiAddress())

    const position_id = '0x67ff4a016f0d0984ee5a816426f00853da432bacb071c709627eb3ac12419834'
    const position = await sdk.Position.getPositionById(position_id)
    console.log('position: ', position)
    const pool = await sdk.Pool.getPool(position.pool)
    console.log('pool: ', pool)

    const tx = sdk.Vest.buildRedeemPayload([
      {
        clmm_pool_id: pool.id,
        clmm_position_id: position_id,
        period: 0,
        coin_type_a: pool.coin_type_a,
        coin_type_b: pool.coin_type_b,
      },
    ])

    printTransaction(tx)

    const transferTxn = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('redeem: ', transferTxn)
  })
})
