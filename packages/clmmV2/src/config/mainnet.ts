import { FullRpcUrlMainnet, GraphRpcUrlMainnet } from '@cetusprotocol/common-sdk'
import { SdkOptions } from '../sdk'

// mainnet
export const clmmMainnet: SdkOptions = {
  env: 'mainnet',
  full_rpc_url: FullRpcUrlMainnet,
  graph_rpc_url: GraphRpcUrlMainnet,
  clmm_pool: {
    package_id: '0x5ea056534edb5d54fe5c25007aef9d8489cb4d5b792179a35f735723496ec4f1',
    published_at: '0x5ea056534edb5d54fe5c25007aef9d8489cb4d5b792179a35f735723496ec4f1',
    version: 1,
    config: {
      global_config_id: '0x1ba7a2eeb15345815ceaeb7858c88588347aea46555edfca89564421b9178e36',
      registry_id: '0xc7d99858e269e5cf06e90d21adfa6c5e2183265c1ad4c3080a5bf1219519eebe',
      admin_cap_id: '0xa50ef57119366a5d5aa2e4e30c61e89a6d1e7a95091a34cf4acb70381a0606a8',
      partners_id: '0x031feed9d83f9df6c5a4af4b8463f7e465250474ed73beb5385d8ea2c679ed25',
      versioned_id: '0x763c54aee6edb3b146a0cc39daff331460292ebbe11b4aa955a1849b328c07c2',
    },
  },
  router: {
    package_id: '0xa7c6f5f70f49c48a043515fed399712c0ca146427a886f2f5763771a59db53d2',
    published_at: '0xa7c6f5f70f49c48a043515fed399712c0ca146427a886f2f5763771a59db53d2',
    version: 1,
  },
}

