import { FullRpcUrlMainnet, GraphRpcUrlMainnet } from '@cetusprotocol/common-sdk'
import type { SdkOptions } from '../../src'

const SDKConfig = {
  xcetusConfig: {
    xcetus_manager_id: '0x838b3dbade12b1e602efcaf8c8b818fae643e43176462bf14fd196afa59d1d9d',
    lock_manager_id: '0x288b59d9dedb51d0bb6cb5e13bfb30885ecf44f8c9076b6f5221c5ef6644fd28',
    lock_handle_id: '0x7c534bb7b8a2cc21538d0dbedd2437cc64f47106cb4c259b9ff921b5c3cb1a49',
  },
  xcetusDividendsConfig: {
    dividend_manager_id: '0x721c990bfc031d074341c6059a113a59c1febfbd2faeb62d49dcead8408fa6b5',
    dividend_admin_id: '0x682ba823134f156eac2bcfb27d85a284954a0e61998dc628c40b9bcb4a46ff30',
    dividend_settle_id: '0xade40abe9f6dd10b83b11085be18f07b63b681cf1c169b041fa16854403388c5',
    venft_dividends_id: '0x9dcdb97b4307684bedaeaf803d381b12321a31ecbb9dad7df2cd5f64384f9456',
    venft_dividends_id_v2: '0xaa21fbc1707786d56302952f8327362f4eb9a431a5bc574834e6d46125390de3',
  },
}

export const xcetus_mainnet: SdkOptions = {
  full_rpc_url: FullRpcUrlMainnet,
  /**
   * https://www.moveregistry.com/package/@cetuspackages/xcetus?tab=versions
   */
  xcetus: {
    package_id: '0x9e69acc50ca03bc943c4f7c5304c2a6002d507b51c11913b247159c60422c606',
    published_at: '0xa0e7ccad08e09657e294e7cbbd609d26dbd0020b9b894684702a115d5ae1a1cf',
    version: 3,
    config: SDKConfig.xcetusConfig,
  },
  /**
   * https://www.moveregistry.com/package/@cetuspackages/dividends
   */
  xcetus_dividends: {
    package_id: '0x785248249ac457dfd378bdc6d2fbbfec9d1daf65e9d728b820eb4888c8da2c10',
    published_at: '0xeafb58923ef5a284a3760a843130725c0bfe3f75eeaf82b3784f13c8a358a8b7',
    version: 5,
    config: SDKConfig.xcetusDividendsConfig,
  },
  cetus_faucet: {
    package_id: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b',
    published_at: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b',
  },
  env: 'mainnet',
}
