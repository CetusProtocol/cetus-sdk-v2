import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { d, getPackagerConfigs, printTransaction } from '@cetusprotocol/common-sdk'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import 'isomorphic-fetch'
import { CetusXcetusSDK } from '../src/sdk'
import { XCetusUtil } from '../src/utils/xcetus'
let send_key_pair: Ed25519Keypair
const venft_id = '0x99b689e39ead59937ef61de28fc1f921f22e64be87b476b654df5f845e18c424'
const lock_id = '0x3fa15320485e18c68483394589a54d5b1d09efc216eb67350824d825b5330a43'
const redeem_lock_id = '0x3fa15320485e18c68483394589a54d5b1d09efc216eb67350824d825b5330a43'
describe('xcetus Module', () => {
  const sdk = CetusXcetusSDK.createSDK({ env: 'mainnet' })

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    sdk.setSenderAddress("0x4a66266abc88d2b684b7a6cd264f5dcc518184ffad1ca6fe3899a0bc38db0584")
  })

  test('getOwnerVeNFT', async () => {
    const ownerVeNFT = await sdk.XCetusModule.getOwnerVeNFT(sdk.getSenderAddress())
    console.log('ownerVeNFT: ', ownerVeNFT)
  })

  test('getOwnerRedeemLockList', async () => {
    const lockCetus = await sdk.XCetusModule.getOwnerRedeemLockList(sdk.getSenderAddress())
    console.log('lockCetus: ', lockCetus)
  })

  test('getLockCetus', async () => {
    const lockCetus = await sdk.XCetusModule.getLockCetus(lock_id)
    console.log('lockCetus: ', lockCetus)
  })

  test('getOwnerCetusCoins', async () => {
    const coins = await sdk.XCetusModule.getOwnerCetusCoins(send_key_pair.getPublicKey().toSuiAddress())
    console.log('coins: ', coins)
  })

  test('mintVeNFTPayload', async () => {
    const payload = sdk.XCetusModule.mintVeNFTPayload()
    const tx = await sdk.FullClient.sendTransaction(send_key_pair, payload)
    console.log('mintVeNFTPayload : ', tx)
  })

  test(' Convert Cetus to Xcetus', async () => {
    sdk.setSenderAddress(send_key_pair.getPublicKey().toSuiAddress())
    const payload = await sdk.XCetusModule.convertPayload({
      amount: '10000000000',
      venft_id,
    })

    printTransaction(payload)

    const tx = await sdk.FullClient.sendTransaction(send_key_pair, payload)
    console.log('convertPayload : ', tx)
  })

  test('redeemLockPayload', async () => {
    const payload = sdk.XCetusModule.redeemLockV2Payload({
      venft_id: venft_id,
      amount: '20000',
      lock_day: 30,
    })

    const tx = await sdk.FullClient.sendTransaction(send_key_pair, payload)
    console.log('redeemLockPayload : ', tx)
  })

  test('redeemPayload', async () => {
    const lockCetus = await sdk.XCetusModule.getLockCetus(redeem_lock_id)
    console.log('lockCetus: ', lockCetus)

    if (lockCetus && !XCetusUtil.isLocked(lockCetus)) {
      const payload = sdk.XCetusModule.redeemPayload({
        venft_id: venft_id,
        lock_id: redeem_lock_id,
      })

      const tx = await sdk.FullClient.sendTransaction(send_key_pair, payload)
      console.log('redeemPayload : ', tx)
    } else {
      console.log(' not reach  lock time')
    }
  })

  test('redeemDividendPayload', async () => { })

  test('redeemDividendV2Payload', async () => { })

  test('redeemDividendV3Payload', async () => {
    const veNFTDividendInfo = await sdk.XCetusModule.getVeNFTDividendInfo(venft_id)
    console.log('veNFTDividendInfo: ', veNFTDividendInfo)
  })

  test('redeemDividendXTokenPayload', async () => { })

  test('buildCetusCoinType', async () => { })

  test('buildXTokenCoinType', async () => { })

  test('cancelRedeemPayload', async () => {
    const lockCetus = await sdk.XCetusModule.getLockCetus(redeem_lock_id)
    console.log('lockCetus: ', lockCetus)

    if (lockCetus && XCetusUtil.isLocked(lockCetus)) {
      const payload = sdk.XCetusModule.cancelRedeemV2Payload({
        venft_id: venft_id,
        lock_id: redeem_lock_id,
      })

      const tx = await sdk.FullClient.sendTransaction(send_key_pair, payload)
      console.log('cancelRedeemPayload : ', tx)
    }
  })

  test('getInitConfigs', async () => { })

  test('getLockUpManager', async () => {
    const lockUpManagerEvent = await sdk.XCetusModule.getLockUpManager()
    console.log(lockUpManagerEvent)
  })

  test('getDividendConfigs', async () => {
    const dividendConfigs = await sdk.XCetusModule.getDividendConfigs()
    console.log('dividendConfigs: ', dividendConfigs)
  })

  test('getDividendManager', async () => { })

  test('getXcetusManager', async () => {
    const xcetusManager = await sdk.XCetusModule.getXcetusManager()
    console.log('xcetusManager: ', xcetusManager)
  })

  test('getVeNFTDividendInfo', async () => {
    const veNFTDividendInfo = await sdk.XCetusModule.getVeNFTDividendInfo(venft_id)
    console.log('🚀🚀🚀 ~ file: xcetus.test.ts:175 ~ test ~ veNFTDividendInfo:', JSON.stringify(veNFTDividendInfo, null, 2))
  })

  test('redeemNum', async () => {
    const n = 30
    const amountInput = 10000
    const amount = await sdk.XCetusModule.redeemNum(amountInput, n)
    const rate = d(n).sub(15).div(165).mul(0.5).add(0.5)
    const amount1 = rate.mul(amountInput)
    console.log('amount : ', amount, amount1, rate)
  })

  test('reverseRedeemNum', async () => {
    const amount = sdk.XCetusModule.reverseRedeemNum('5454', 30)
    console.log('amount: ', amount)
  })

  test('getXCetusAmount', async () => { })

  test('getVeNftAmount', async () => {
    const xcetusManager = await sdk.XCetusModule.getXcetusManager()
    console.log('xcetusManager: ', xcetusManager)
    const veNftAmount = await sdk.XCetusModule.getVeNftAmount(xcetusManager!.nfts.handle, venft_id)
    console.log('veNftAmount: ', veNftAmount)
  })

  test('getPhaseDividendInfo', async () => {
    const phaseDividendInfo = await sdk.XCetusModule.getPhaseDividendInfo('10')
    console.log('phaseDividendInfo: ', phaseDividendInfo)
  })

  /**-------------------------------------xWHALE Holder Rewards--------------------------------------- */
  test('get my share', async () => {
    const ownerVeNFT = await sdk.XCetusModule.getOwnerVeNFT(send_key_pair.getPublicKey().toSuiAddress())
    console.log('ownerVeNFT: ', ownerVeNFT)

    if (ownerVeNFT) {
      const xcetusManager = await sdk.XCetusModule.getXcetusManager()
      console.log('xcetusManager: ', xcetusManager)

      const veNftAmount = await sdk.XCetusModule.getVeNftAmount(xcetusManager.nfts.handle, ownerVeNFT.id)
      console.log('veNftAmount: ', veNftAmount)

      const rate = d(ownerVeNFT.xcetus_balance).div(xcetusManager.treasury)
      console.log('rate: ', rate)
    }
  })

  test('getNextStartTime', async () => {
    const dividendManager = await sdk.XCetusModule.getDividendManager()
    console.log('dividendManager: ', dividendManager)

    const nextTime = XCetusUtil.getNextStartTime(dividendManager)

    console.log('nextTime: ', nextTime)
  })

  test('getEffectiveXCetusAmount', async () => {
    const ownerVeNFT = await sdk.XCetusModule.getOwnerVeNFT(send_key_pair.getPublicKey().toSuiAddress())
    console.log('ownerVeNFT: ', ownerVeNFT)
    const effectiveXCetusAmount = await sdk.XCetusModule.getEffectiveXCetusAmount(ownerVeNFT!)
    console.log('effectiveXCetusAmount: ', effectiveXCetusAmount)
  })
})
