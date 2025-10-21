import 'isomorphic-fetch'
import { CetusClmmSDK } from '../src/sdk'
import { SuiGraphQLClient } from '@mysten/sui/graphql'
import { graphql } from '@mysten/sui/graphql/schemas/latest'

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

  test('getClmmPoolConfigs', async () => {
    const pool_list = await sdk.CetusConfig.getClmmPoolConfigs()
    console.log('pool_list: ', pool_list)
  })

  test('getLaunchpadPoolConfigs', async () => {
    const pool_list = await sdk.CetusConfig.getLaunchpadPoolConfigs()
    console.log('pool_list: ', pool_list)
  })

  test('getCetusConfig', async () => {
    const config = await sdk.CetusConfig.getCetusConfig()
    console.log('🚀 ~ test ~ config:', config)
  })

  test('fetchCoinMetadataId', async () => {
    const data = await sdk.FullClient.fetchCoinMetadataId('0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC')

    console.log('data: ', data)
  })
})
