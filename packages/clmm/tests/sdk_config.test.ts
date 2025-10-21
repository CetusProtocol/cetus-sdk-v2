import 'isomorphic-fetch'
import { CetusClmmSDK } from '../src/sdk'

const sdk = CetusClmmSDK.createSDK({ env: 'mainnet' })

describe('sdk config', () => {
  test('clmmConfig', async () => {
    try {
      const clmmConfig = await sdk.Pool.getClmmConfigs()
      console.log('clmmConfig ', clmmConfig)
    } catch (error) {
      console.log(error)
    }
  })

  test('cetusConfig', async () => {
    try {
      const cetusConfig = await sdk.CetusConfig.getCetusConfig()
      console.log('cetusConfig: ', cetusConfig)
    } catch (error) {
      console.log(error)
    }
  })

  test('fetchCoinMetadataId', async () => {
    const id = await sdk.FullClient.fetchCoinMetadataId('0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC')
    console.log('id: ', id)
  })
})

describe('warp sdk config', () => {
  const config = sdk.sdkOptions
  test('sdk Config', async () => {
    const sdkOptions = sdk.sdkOptions
    try {
      if (sdkOptions.clmm_pool.package_id.length > 0) {
        const initEvent = await sdk.Pool.getClmmConfigs()
        config.clmm_pool.config = initEvent
      }
    } catch (error) {
      console.log('clmmConfig', error)
    }

    try {
      if (sdkOptions.cetus_config.package_id.length > 0) {
        const cetusConfig = await sdk.CetusConfig.getCetusConfig()
        config.cetus_config.config = cetusConfig
      }
    } catch (error) {
      console.log('tokenConfig', error)
    }
    console.log(config)
  })
})
