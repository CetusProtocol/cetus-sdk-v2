import type { SdkOptions } from '../sdk'
import { FullRpcUrlMainnet, GraphRpcUrlMainnet } from '@cetusprotocol/common-sdk'
// mainnet
export const dlmmMainnet: SdkOptions = {
  env: 'mainnet',
  full_rpc_url: FullRpcUrlMainnet,
  graph_rpc_url: GraphRpcUrlMainnet,
  dlmm_pool: {
    package_id: '0x5664f9d3fd82c84023870cfbda8ea84e14c8dd56ce557ad2116e0668581a682b',
    published_at: '0xaf89570a53886188d30617938c68aca2d8ec6c08bfc8da6bd0a662f454610089',
    version: 6,
    config: {
      registry_id: '0xb1d55e7d895823c65f98d99b81a69436cf7d1638629c9ccb921326039cda1f1b',
      pools_id: '0xc3683b2356cac6423e9ecaea20955c7cc193998b016e5b884730ed1192174991',
      global_config_id: '0xf31b605d117f959b9730e8c07b08b856cb05143c5e81d5751c90d2979e82f599',
      versioned_id: '0x05370b2d656612dd5759cbe80463de301e3b94a921dfc72dd9daa2ecdeb2d0a8',
      admin_cap_id: '0xc4c42bc31cb54beb679dccd547f8bdb970cb6dc989bd1f85a4fed4812ed95d6e',
      partners_id: '0x5c0affc8d363b6abb1f32790c229165215f4edead89a9bc7cd95dad717b4296a',
    },
  },
  dlmm_router: {
    package_id: '0x8d389fa25cb08ebc5e520bc520ed394eed9e62b56b7868acb398bf298b8a76f3',
    published_at: '0xb8d611f884732a45c7d51acbff9cf248983726263c78d74b18aa754039d4e61e',
    version: 4,
  },
}
