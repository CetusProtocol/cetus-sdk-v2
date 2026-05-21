import 'isomorphic-fetch'
import { CetusClmmSDK } from '../src/sdk'

describe('Config Module', () => {
  const sdk = CetusClmmSDK.createSDK({ env: 'mainnet' })
  // const sdk = CetusClmmSDK.createSDK({ env: 'testnet' })

  test('getTokenListByCoinTypes', async () => {
    const tokenMap = await sdk.CetusConfig.getTokenListByCoinTypes(['0x2::sui::SUI'])
    console.log('tokenMap: ', tokenMap)
  })

  test('getCoinConfigs', async () => {
    const coin_list = await sdk.CetusConfig.getCoinConfigs(true)
    console.log('coin_list: ', coin_list)
  })

  test('1 getCoinConfig', async () => {
    const coin = await sdk.CetusConfig.getCoinConfig('0x2::sui::SUI')
    console.log('coin: ', coin)
  })

  test('getClmmPoolConfigs', async () => {
    const pool_list = await sdk.CetusConfig.getClmmPoolConfigs()
    console.log('pool_list: ', pool_list)
  })

  test('1 getClmmPoolConfig', async () => {
    const pool = await sdk.CetusConfig.getClmmPoolConfig("0x6ecf6d01120f5f055f9a605b56fd661412a81ec7c8b035255e333c664a0c12e7")
    console.log('pool: ', pool)
  })

  test('getLaunchpadPoolConfigs', async () => {
    const pool_list = await sdk.CetusConfig.getLaunchpadPoolConfigs()
    console.log('pool_list: ', pool_list)
  })

  test('1 getLaunchpadPoolConfig', async () => {
    const pool = await sdk.CetusConfig.getLaunchpadPoolConfig("0x8b3b1b25d0769ec4165c9d7cf6090375be6066c3b4b35cb472c7eb8f05b07a9c")
    console.log('pool: ', pool)
  })

  test('getCetusConfig', async () => {
    const config = await sdk.CetusConfig.getCetusConfig()
    console.log('🚀 ~ test ~ config:', config)
  })

})
