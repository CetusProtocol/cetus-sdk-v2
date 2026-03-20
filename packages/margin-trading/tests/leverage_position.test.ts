import { buildTestAccount } from '@cetusprotocol/test-utils'
import CetusMarginTradingSDK from '../src'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { CLOCK_ADDRESS, d, getPackagerConfigs, printTransaction } from '@cetusprotocol/common-sdk'
import { Transaction } from '@mysten/sui/transactions'

let send_key_pair: Ed25519Keypair

describe('leverage position test', () => {
  const sdk = CetusMarginTradingSDK.createSDK({
    env: 'mainnet',
    full_rpc_url: 'https://fullnode.mainnet.sui.io:443',
  })

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    sdk.setSenderAddress(send_key_pair.toSuiAddress())
  })

  test('getPositionList', async () => {
    const res = await sdk.PositionModules.getPositionList('0xe4a2b3e3449ebab20ae7e15afc8a2414ed362a9a97af09a42fc05fd8db3f5072')
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('1 getPosition', async () => {
    const res = await sdk.PositionModules.getPositionInfo(
      '0x5df6f2418f591acf2ef8ba1dda160de7d54a11a01adb54d5f614bdb9f3317d73',
      '0xe4a2b3e3449ebab20ae7e15afc8a2414ed362a9a97af09a42fc05fd8db3f5072'
    )

    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('2 positionClaim', async () => {
    const tx = await sdk.PositionModules.positionClaim('0x9c7e69813edb8a76a2d0fd720f723d497521f31a8a93ece2b760884bba68a15b')
    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('1 claim_rewards for deep', async () => {
    const tx = new Transaction()
    const coin = tx.moveCall({
      target: `0x34171e8092d831c1cb71d70b04389f9a0fec8af56f69e760b58d613d764c6945::lending_market::claim_rewards`,
      arguments: [
        tx.object('0x84030d26d85eaa7035084a057f2f11f701b7e2e4eda87551becbc7c97505ece1'),
        tx.object('0xc6d39a5118cfbbfbc741ac7043e614c0dfd9b40cb07fe9f343c1373d137064ec'),
        tx.object(CLOCK_ADDRESS),
        tx.pure.u64(8),
        tx.pure.u64(4),
        tx.pure.bool(true),
      ],
      typeArguments: [
        '0xf95b06141ed4a174f239417323bde3f209b972f5930d8521ea38a52aff3a6ddf::suilend::MAIN_POOL',
        '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
      ],
    })

    tx.transferObjects([coin], send_key_pair.toSuiAddress())
    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('long position leverage increase', async () => {
    const payload = await sdk.PositionModules.positionLeverageIncrease({
      position_id: '0xc57d0537facfa10e8ec472f2b8b6e99b0103bac410d3c81897110f0b8e317f4d',
      current_leverage: 1.36,
      target_leverage: 1.2,
      swap_clmm_pool: '0x51e883ba7c0b566a26cbc8a94cd33eb0abd418a77cc1e60ad22fd9b1f29cd2ab',
      slippage: 0.005,
    })
    printTransaction(payload)
    const res = await sdk.FullClient.executeTx(send_key_pair, payload, true)
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('long position leverage decrease', async () => {
    const payload = await sdk.PositionModules.positionLeverageDecrease({
      "position_id": "0xed417d75bc913592a2496b4aeca300971919fcd9162b201871d2c340cffa647b",
      "current_leverage": 2.69111013654704444007695266651275062732630871944029443034759154,
      "target_leverage": 2.57,
      "swap_clmm_pool": "0x51e883ba7c0b566a26cbc8a94cd33eb0abd418a77cc1e60ad22fd9b1f29cd2ab",
      "slippage": 0.005
  })
    printTransaction(payload)
    const res = await sdk.FullClient.executeTx(send_key_pair, payload, false)
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('short position leverage increase', async () => {
    const payload = await sdk.PositionModules.positionLeverageIncrease({
      position_id: '0xc9af82faa17a933e4c06dc3d8ad0bf3778cf6a9369192e2affc7c5983270e7e1',
      current_leverage: 1.08,
      target_leverage: 1.3,
      slippage: 0.01,
      swap_clmm_pool: '',
    })
    printTransaction(payload)
    const res = await sdk.FullClient.executeTx(send_key_pair, payload, true)
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })

  test('short position leverage decrease', async () => {
    const payload = await sdk.PositionModules.positionLeverageDecrease({
      position_id: '0xc9af82faa17a933e4c06dc3d8ad0bf3778cf6a9369192e2affc7c5983270e7e1',
      current_leverage: 1.08,
      target_leverage: 1.3,
      slippage: 0.01,
      swap_clmm_pool: '',
    })
    printTransaction(payload)
    const res = await sdk.FullClient.executeTx(send_key_pair, payload, true)
    console.log('🚀🚀🚀 ~ position.test.ts:21 ~ res:', res)
  })
})
