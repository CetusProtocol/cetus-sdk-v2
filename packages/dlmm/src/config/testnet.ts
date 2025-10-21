import { FullRpcUrlTestnet, GraphRpcUrlTestnet } from '@cetusprotocol/common-sdk'
import type { SdkOptions } from '../sdk'

export const dlmmTestnet: SdkOptions = {
  env: 'testnet',
  full_rpc_url: FullRpcUrlTestnet,
  graph_rpc_url: GraphRpcUrlTestnet,
  dlmm_pool: {
    package_id: '0x17a1f5a8779461ff44e942adf33325cce112c693d6a177ed77f035ca86d1fdb6',
    published_at: '0x6d32c1be32eefcea933c03dd5cb7c783d1d83f6b30c4d1131d955933747b1701',
    version: 1,
    config: {
      registry_id: '0x319070e26a6809f439d3c4a45e63bf74939c5fe3165de7b65968ee8547f71bd0',
      pools_id: '0x505fcde74ab557d553832a87f169a0408ad3507ca4e84b25f7d32c2c1535765c',
      global_config_id: '0x88bb33e9eff2fccab980a0e4b43fc4572abd08f08304d47a20d3e4e99d94d159',
      versioned_id: '0xa710caae87b2129acc97fbb98ea7011e3137c3291b02c0fcce866d67d5d9e8d0',
      admin_cap_id: '0x6fc908894ad7c2ff16cca07a05af6760831a8b5e5dc34e40470dce6ee1760155',
      partners_id: '0xc5c31fe1550e39c9890e0fe3d2608dd9b408a10d74020e5ff72ccfffe4c9c879',
    },
  },
  dlmm_router: {
    package_id: '0xba3059875c8980ac171fc2bac81b9df172fb77fa0cb5a267636df701225b93ef',
    published_at: '0x59b7a2da6db8f9245a1db6169018af7124c0714fa77a84224967ead6be125127',
    version: 1,
  },
  faucet: {
    package_id: '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48',
    published_at: '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48',
    version: 1,
  },
}
