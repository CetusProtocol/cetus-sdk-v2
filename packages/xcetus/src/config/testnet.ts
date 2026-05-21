import { FullRpcUrlTestnet, GraphRpcUrlTestnet } from '@cetusprotocol/common-sdk'
import type { SdkOptions } from '../../src'
const SDKConfig = {
  xcetusConfig: {
    xcetus_manager_id: '0xac0ca3b0bee299e5cc33edb436e40824d90e2b4d18c135efe9f86950cdf603ca',
    lock_manager_id: '0xedd79fdfee399511d9d90e27178fb6e346041f9fa9f948a71c78b84c9c5c63db',
    lock_handle_id: '0x13257dd9584374ffa05926f540866bbe7462bf41d12a6e1fa2a0ab6028d28888',
  },
  xcetusDividendsConfig: {
    dividend_manager_id: '0x8b100dc835861d49f2a3dbd90eef38da47e9bc43fc378ca7007d62d1b57eed70',
    dividend_admin_id: '0xc08543e7dd3b14bb1f63a4f2a5f13de3e410dc5ac4ab42e28e9dd6b53d5d8ab7',
    dividend_settle_id: '0x84e750aaad4e520be79a6321198a31f4405e592f4836f2892000f2a17fa2f206',
    venft_dividends_id: '0x423b6224fe3dd9c857bdb074fb3b26f8993912a4bf5b17447853578efd142d80',
    venft_dividends_id_v2: '0x090104beb87413bf005ec85ddf89a1c9dd1c4d6f0cb15383fb2303f1b31035cc',
  },
}

export const xcetus_testnet: SdkOptions = {
  full_rpc_url: FullRpcUrlTestnet,
  graph_rpc_url: GraphRpcUrlTestnet,
  xcetus: {
    package_id: '0x73d3c2670950d05dd00b6c3387f5e962480ee74aafeae2ec0eda99259bbc158d',
    published_at: '0xb3b39006f0b905f035fe75360f6bc0043c8fa442b60f2bcc3a777727d4e33a27',
    version: 1,
    config: SDKConfig.xcetusConfig,
  },
  xcetus_dividends: {
    package_id: '0xe8449c10c6c8602b4e8afe2e854bf9d0496c27f775ac323cd47b97f22a9f1135',
    published_at: '0xe8449c10c6c8602b4e8afe2e854bf9d0496c27f775ac323cd47b97f22a9f1135',
    version: 1,
    config: SDKConfig.xcetusDividendsConfig,
  },
  cetus_faucet: {
    package_id: '0x52dab26246cb8d694d0d2aa828e7d753d298fad5ebd9209bef2de71b917074ee',
    published_at: '0x52dab26246cb8d694d0d2aa828e7d753d298fad5ebd9209bef2de71b917074ee',
  },
  env: 'testnet',
}
