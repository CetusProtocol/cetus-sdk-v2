import 'isomorphic-fetch'
import { CetusClmmSDK } from '../src/sdk'

describe('collect fees', () => {
  const sdk = CetusClmmSDK.createSDK({ env: 'mainnet' })

  test('batchFetchPositionFees', async () => {
    const res = await sdk.Position.batchFetchPositionFees(['0xe6cf790521d1c32673de1b5ac39039e9e37046e4001544d61f603d2264e35350'])
    console.log('res####', res)
  })
})
