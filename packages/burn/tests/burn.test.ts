// buildTestAccount
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { describe, beforeEach, test } from 'vitest'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import { CetusBurnSDK } from '../src/sdk'

describe('burn', () => {
  const sdk = CetusBurnSDK.createSDK({ env: 'testnet' })
  console.log('🚀 ~ describe ~ sdk:', sdk)
  let send_key_pair: Ed25519Keypair
  let account: string

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    account = send_key_pair.getPublicKey().toSuiAddress()
    sdk.setSenderAddress(account)
  })

  test('getBurnPoolList', async () => {
    const res = await sdk.Burn.getBurnPoolList()
    console.log('getBurnPoolList res:', res)
  })

  test('getPoolBurnPositionList', async () => {
    const res = await sdk.Burn.getPoolBurnPositionList('0xcf994611fd4c48e277ce3ffd4d4364c914af2c3cbb05f7bf6facd371de688630')
    console.log('getBurnPositionList res:', res)
  })

  test('getBurnPositionList', async () => {
    const res = await sdk.Burn.getBurnPositionList('0xc5cea39da987d8fe16bf0c6db51bfbf4897aef0edf9588e035ae175ac416fdd1')
    console.log('getBurnPositionList res:', res)
  })

  test('getBurnPosition', async () => {
    const posId = '0x2564e45797f57713198bb2a2d69266b05cef7ec680a982ff69ff6b27d8eabd69'
    const res = await sdk.Burn.getBurnPosition(posId)
    console.log('getBurnPosition res:', res)
  })

  test('burn lock', async () => {
    const poolId = '0x13f207b50d553a2ee5e921efe25bb31a258b71b2b67f84eafd742f609b873296'
    const posId = '0xcbffc95ab3ceccd6ab750c0ece3f61e0eb891a2c4321ce303105f30e87b64232' // is burn success
    const coinTypeA = '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::usdy::USDY'
    const coinTypeB = '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::wusdc::WUSDC'
    const tx = sdk.Burn.createBurnPayload({
      pool_id: poolId,
      pos_id: posId,
      coin_type_a: coinTypeA,
      coin_type_b: coinTypeB,
    })

    const transferTxn = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('burn: ', transferTxn)
  })

  test('createBurnLPV2Payload', async () => { })

  test('claim', async () => {
    const poolId = '0xec5dbeef2798f13740535c90ccbd622cead7c2081199312bd254bf2e8454c4d7'
    const posId = '0x2564e45797f57713198bb2a2d69266b05cef7ec680a982ff69ff6b27d8eabd69' // is wrap pos id
    const coinTypeA = '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::fdusd::FDUSD'
    const coinTypeB = '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::usdc::USDC'

    const rewarderCoinTypes = [
      '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::sui::SUI',
      '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::fdusd::FDUSD',
    ]
    let txb = sdk.Burn.createCollectFeePayload({
      pool_id: poolId,
      pos_id: posId,
      coin_type_a: coinTypeA,
      coin_type_b: coinTypeB,
      account,
    })

    txb = sdk.Burn.createCollectRewardPayload({
      pool_id: poolId,
      pos_id: posId,
      coin_type_a: coinTypeA,
      coin_type_b: coinTypeB,
      rewarder_coin_types: rewarderCoinTypes,
      account,
    })

    const simulateRes = await sdk.FullClient.devInspectTransactionBlock({
      transactionBlock: txb,
      sender: account,
    })
    console.log('claim simulateRes:', simulateRes)
  })

  test('redeem vest', async () => {
    const burn_position_id = '0x4e745334f8899a2b8854c791865e93bb27653862bd0e7a29cab35ee583056c40'
    const burnPosition = await sdk.Burn.getBurnPosition(burn_position_id)

    const tx = sdk.Burn.redeemVestPayload([
      {
        clmm_versioned_id: '0x8d1b965923331fa3f7820a97b2b787db45fbdfd24fb8e98de2d9e7a9b3b2d40d',
        clmm_vester_id: '0xbe3a49c92cc31f063418aa24f4f5d28bd39475687052e1025e8aaa30cd63bfc9',
        clmm_pool_id: burnPosition!.pool_id,
        burn_position_id: burn_position_id,
        period: 0,
        coin_type_a: burnPosition!.coin_type_a,
        coin_type_b: burnPosition!.coin_type_b,
      },
    ])

    const transferTxn = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('redeem: ', transferTxn)
  })
})
