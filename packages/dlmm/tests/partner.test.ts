// buildTestAccount
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import { CetusDlmmSDK } from '../src/sdk'
import { BinUtils } from '../src/utils/binUtils'
import { StrategyType } from '../src/types/dlmm'
import { d, printTransaction } from '@cetusprotocol/common-sdk'
import { Transaction } from '@mysten/sui/transactions'

describe('partner', () => {
  const sdk = CetusDlmmSDK.createSDK({ env: 'testnet', full_rpc_url: 'https://rpc-testnet.suiscan.xyz' })
  let send_key_pair: Ed25519Keypair
  let account: string

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    account = send_key_pair.getPublicKey().toSuiAddress()
    sdk.setSenderAddress(account)
  })

  test('getPartnerList', async () => {
    const partnerList = await sdk.Partner.getPartnerList()
    console.log('🚀 ~ test ~ partnerList:', partnerList)
  })

  test('getPartner', async () => {
    const partner = await sdk.Partner.getPartner('0x9d171399393e3cbedffc24269eb606e735fb56fee17c15153eb5e2d5274a3677')
    console.log('🚀 ~ test ~ partner:', partner)
  })

  test('getPartnerCapId', async () => {
    const partnerCapId = await sdk.Partner.getPartnerCapId(account, '0x9d171399393e3cbedffc24269eb606e735fb56fee17c15153eb5e2d5274a3677')
    console.log('🚀 ~ test ~ partnerCapId:', partnerCapId)
  })

  test('getPartnerBalance', async () => {
    const partnerBalance = await sdk.Partner.getPartnerBalance('0x2f14a9ed1e9fb5b027b36d6b166de1f5fec2f26c444d64b22c26cd216b38c65b')
    console.log('🚀 ~ test ~ partnerBalance:', partnerBalance)
  })

  test('createPartnerPayload', async () => {
    const start_time = Number(d(Date.now()).div(1000).add(5000).toFixed(0))
    const tx = sdk.Partner.createPartnerPayload({
      name: 'test lb 2',
      ref_fee_rate: 0.01,
      start_time,
      end_time: start_time + 9 * 24 * 3600,
      recipient: account,
    })
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('🚀 ~ test ~ res2:', res)
  })

  test('updateRefFeeRatePayload', async () => {
    const tx = await sdk.Partner.updateRefFeeRatePayload({
      partner_id: '0x9d171399393e3cbedffc24269eb606e735fb56fee17c15153eb5e2d5274a3677',
      ref_fee_rate: 0.02,
    })
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('🚀 ~ test ~ res2:', res)
  })

  test('updateTimeRangePayload', async () => {
    const start_time = Number(d(Date.now()).div(1000).toFixed(0))
    const tx = await sdk.Partner.updateTimeRangePayload({
      partner_id: '0x9d171399393e3cbedffc24269eb606e735fb56fee17c15153eb5e2d5274a3677',
      start_time,
      end_time: start_time + 10 * 7 * 24 * 3600,
    })

    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('🚀 ~ test ~ res2:', res)
  })
})
