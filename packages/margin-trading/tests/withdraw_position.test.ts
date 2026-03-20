import { buildTestAccount } from '@cetusprotocol/test-utils'
import CetusMarginTradingSDK from '../src'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { d, printTransaction } from '@cetusprotocol/common-sdk'

let send_key_pair: Ed25519Keypair

describe('withdraw position test', () => {
  const sdk = CetusMarginTradingSDK.createSDK({
    env: 'mainnet',
  })

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    sdk.setSenderAddress("0x91146573f34bae3dc0cd7eb5f4c33ec1e179106cc3cb648e33cd4891e519800b")
  })

  test('getPositionList', async () => {
    const res = await sdk.PositionModules.getPositionList('0x52bfafe1e1022f2ba070f638128f34e8a948eafe5ce778c0702507652cc3f033')
  })

  test('getPositionInfo', async () => {
    const res = await sdk.PositionModules.getPositionInfo('0x3af2f8cd33f446e9ff4d2c57f8cc9257ec13eaa67db0b7a30f35c0d4dedb5cd3')
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('long position withdraw with base', async () => {
    const payload = await sdk.PositionModules.positionWithdraw({
      "position_id": "0x682e96e85b2336a361216d59fb527cac78e2940b7385a0d868c72ad086d3bc7d", "is_quote": false,
      "slippage": 0.005,
      "leverage": 2.984665317649038266981757805152942499690575894629464267768423611,
      "swap_clmm_pool": "0x51e883ba7c0b566a26cbc8a94cd33eb0abd418a77cc1e60ad22fd9b1f29cd2ab",
      amount: '1',
      withdraw_max: true,
    })
    printTransaction(payload)
    const res = await sdk.FullClient.executeTx("0x91146573f34bae3dc0cd7eb5f4c33ec1e179106cc3cb648e33cd4891e519800b", payload, true)
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('long position withdraw with quote', async () => {
    const payload = await sdk.PositionModules.positionWithdraw({
      position_id: '0xc6d39a5118cfbbfbc741ac7043e614c0dfd9b40cb07fe9f343c1373d137064ec',
      is_quote: true,
      amount: d(0.1)
        .mul(10 ** 6)
        .toString(),
      slippage: 0.05,
      swap_clmm_pool: '',
      leverage: 1.6,
    })
    printTransaction(payload)
    const res = await sdk.FullClient.executeTx(send_key_pair, payload, true)
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('short position withdraw with quote', async () => {
    const payload = await sdk.PositionModules.positionWithdraw({
      position_id: '0xfe163e9b79229c284dbcba0450aa4f1de62098cffd5cd5a97c526ca89411268d',
      is_quote: true,
      amount: d(0.2)
        .mul(10 ** 6)
        .toString(),
      slippage: 0.05,
      swap_clmm_pool: '',
      leverage: 1.46,
    })
    printTransaction(payload)
    const res = await sdk.FullClient.executeTx(send_key_pair, payload, true)
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('short position withdraw with base', async () => {
    const payload = await sdk.PositionModules.positionWithdraw({
      position_id: '0xfe163e9b79229c284dbcba0450aa4f1de62098cffd5cd5a97c526ca89411268d',
      is_quote: false,
      amount: d(0.05)
        .mul(10 ** 9)
        .toString(),
      slippage: 0.05,
      swap_clmm_pool: '',
      leverage: 1.45,
    })
    printTransaction(payload)
    const res = await sdk.FullClient.executeTx(send_key_pair, payload, true)
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('long position close with base', async () => {
    const payload = await sdk.PositionModules.positionClose({
      "position_id": "0xbe93e00305d29db487053080e7ee69d59b8841d67bf01ebad504c140b2d007ce", "is_quote": true,
      "slippage": 0.005, "leverage": 1.986734198089600178567100387719035629789353224369891973795176833, "swap_clmm_pool": "0x51e883ba7c0b566a26cbc8a94cd33eb0abd418a77cc1e60ad22fd9b1f29cd2ab"
    })
    printTransaction(payload)
    const res = await sdk.FullClient.executeTx(send_key_pair, payload, true)
    console.log('🚀🚀🚀 ~ withdraw_position.test.ts:94 ~ res:', res)
  })

  test('long position close with quote', async () => {
    sdk.setSenderAddress('0x91146573f34bae3dc0cd7eb5f4c33ec1e179106cc3cb648e33cd4891e519800b')
    sdk.senderAddress = '0x91146573f34bae3dc0cd7eb5f4c33ec1e179106cc3cb648e33cd4891e519800b'
    const payload = await sdk.PositionModules.positionClose({
      position_id: '0x003c1038d010887878eb3d7e1baab3709341994a470e86f42808967c7526aab2',
      is_quote: true,
      slippage: 0.01,
      leverage: 1,
      swap_clmm_pool: '0x51e883ba7c0b566a26cbc8a94cd33eb0abd418a77cc1e60ad22fd9b1f29cd2ab',
    })
    printTransaction(payload)
    const res = await sdk.FullClient.executeTx('0x91146573f34bae3dc0cd7eb5f4c33ec1e179106cc3cb648e33cd4891e519800b', payload, true)
    console.log('🚀🚀🚀 ~ withdraw_position.test.ts:109 ~ res:', res)
  })

  test('short position close with quote', async () => {
    const payload = await sdk.PositionModules.positionClose({
      position_id: '0x3af2f8cd33f446e9ff4d2c57f8cc9257ec13eaa67db0b7a30f35c0d4dedb5cd3',
      is_quote: false,
      slippage: 0.01,
      leverage: 1,
      swap_clmm_pool: '0x51e883ba7c0b566a26cbc8a94cd33eb0abd418a77cc1e60ad22fd9b1f29cd2ab',
    })
    printTransaction(payload)
    const res = await sdk.FullClient.executeTx(send_key_pair, payload, true)
    console.log('🚀🚀🚀 ~ withdraw_position.test.ts:109 ~ res:', res)
  })

  test('short position close with base', async () => {
    const payload = await sdk.PositionModules.positionClose({
      position_id: '0xfe163e9b79229c284dbcba0450aa4f1de62098cffd5cd5a97c526ca89411268d',
      is_quote: true,
      slippage: 0.05,
      leverage: 1.45,
    })
    printTransaction(payload)
    const res = await sdk.FullClient.executeTx(send_key_pair, payload, true)
    console.log('🚀🚀🚀 ~ withdraw_position.test.ts:109 ~ res:', res)
  })
})
