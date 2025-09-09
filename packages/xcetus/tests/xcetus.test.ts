import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { d, getPackagerConfigs, printTransaction } from '@cetusprotocol/common-sdk'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import 'isomorphic-fetch'
import { CetusXcetusSDK } from '../src/sdk'
import { XCetusUtil } from '../src/utils/xcetus'
let send_key_pair: Ed25519Keypair
const account_id = '0x3992ecfe4eca00d482210cddfceb063608f45f3ca41ce7eedea33f27870eb55a'
const venft_id = '0x653edd0c372ee7b5fc38e7934caab30b8a45b1680d727f127b05140806034067'
const lock_id = '0x005ba9202a5d9e41c73155a1b4e473a0283191954fb47fe3f927c7026aefec40'
const redeem_lock_id = '0x6c7cb48929308e7213747c0710ea38db89e3067aa7c80645a0b41dca596fa375'
describe('xcetus Module', () => {
  const sdk = CetusXcetusSDK.createSDK({ env: 'mainnet' })

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    sdk.setSenderAddress(send_key_pair.toSuiAddress())
  })

  test('getOwnerVeNFT', async () => {
    const ownerVeNFT = await sdk.XCetusModule.getOwnerVeNFT(account_id)
    console.log('ownerVeNFT: ', ownerVeNFT)
  })

  test('getOwnerRedeemLockList', async () => {
    const lockCetus = await sdk.XCetusModule.getOwnerRedeemLockList('0xc5cea39da987d8fe16bf0c6db51bfbf4897aef0edf9588e035ae175ac416fdd1')
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
    const payload = sdk.XCetusModule.redeemLockPayload({
      venft_id: venft_id,
      amount: '1000',
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

  test('redeemDividendPayload', async () => {})

  test('redeemDividendV2Payload', async () => {})

  test('redeemDividendV3Payload', async () => {
    const dividendManager = await sdk.XCetusModule.getDividendManager()
    const { venft_dividends_id_v2 } = getPackagerConfigs(sdk.sdkOptions.xcetus_dividends)

    const veNFTDividendInfo = await sdk.XCetusModule.getVeNFTDividendInfo(venft_id)

    if (veNFTDividendInfo) {
      const payload = await sdk.XCetusModule.redeemDividendV3Payload(venft_id, veNFTDividendInfo.rewards)
      printTransaction(payload)
      try {
        const res = await sdk.FullClient.devInspectTransactionBlock({ transactionBlock: payload, sender: send_key_pair.toSuiAddress() })
        // const result = await sdk.ClmmSDK.fullClient.sendTransaction(send_key_pair, payload)
        // console.log('redeemDividendV3Payload: ', result)
      } catch (error) {
        console.log('🚀🚀🚀 ~ file: xcetus.test.ts:216 ~ test ~ error:', error)
      }
    }
  })

  test('redeemDividendXTokenPayload', async () => {})

  test('buildCetusCoinType', async () => {})

  test('buildXTokenCoinType', async () => {})

  test('cancelRedeemPayload', async () => {
    const lockCetus = await sdk.XCetusModule.getLockCetus(redeem_lock_id)
    console.log('lockCetus: ', lockCetus)

    if (lockCetus && XCetusUtil.isLocked(lockCetus)) {
      const payload = sdk.XCetusModule.cancelRedeemPayload({
        venft_id: venft_id,
        lock_id: redeem_lock_id,
      })

      const tx = await sdk.FullClient.sendTransaction(send_key_pair, payload)
      console.log('cancelRedeemPayload : ', tx)
    }
  })

  test('getInitConfigs', async () => {})

  test('getLockUpManager', async () => {
    const lockUpManagerEvent = await sdk.XCetusModule.getLockUpManager()
    console.log(lockUpManagerEvent)
  })

  test('getDividendConfigs', async () => {})

  test('getDividendManager', async () => {})

  test('getXcetusManager', async () => {
    const xcetusManager = await sdk.XCetusModule.getXcetusManager()
    console.log('xcetusManager: ', xcetusManager)
  })

  test('getVeNFTDividendInfo', async () => {
    const veNFTDividendInfo = await sdk.XCetusModule.getVeNFTDividendInfo(venft_id)
    console.log('🚀🚀🚀 ~ file: xcetus.test.ts:175 ~ test ~ veNFTDividendInfo:', JSON.stringify(veNFTDividendInfo, null, 2))
  })

  test('redeemNum', async () => {
    const n = 15
    const amountInput = 20000
    const amount = await sdk.XCetusModule.redeemNum(amountInput, n)
    const rate = d(n).sub(15).div(165).mul(0.5).add(0.5)
    const amount1 = rate.mul(amountInput)
    console.log('amount : ', amount, amount1, rate)
  })

  test('reverseRedeemNum', async () => {})

  test('getXCetusAmount', async () => {})

  test('getVeNftAmount', async () => {})

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
})
