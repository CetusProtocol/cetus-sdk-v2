import { FullRpcUrlTestnet, GraphRpcUrlTestnet } from '@cetusprotocol/common-sdk'
import type { SdkOptions } from '../sdk'

export const dlmmTestnet: SdkOptions = {
  env: 'testnet',
  full_rpc_url: FullRpcUrlTestnet,
  graph_rpc_url: GraphRpcUrlTestnet,
  dlmm_pool: {
    package_id: '0xb382224d12558da5f87624765065a8c7e8f5c899d0ee890610e2bb4e8c686be9',
    published_at: '0x1cdac9c678c5ec89c80409db8865c9c3f8e6207dfd988fb4ddd11e2806db0bf9',
    version: 1,
    config: {
      registry_id: '0xdc91c4f094557b9d2a35fc6159ef32649a54c4aa9350860bf0d4b52b5f0a3990',
      pools_id: '0xb518b1de84a1ba1ab6c9a2d71fcdf382ef36045a4660497b3d77fb0a6df7709e',
      global_config_id: '0xe84ebca8d61cdd9312cec3787204d0ee1063d424a81dcda62cfb8b1887041a9f',
      versioned_id: '0xf8478d6dc081bc266229f25ac9c31a96b5e99ecbd82222e883368dda95829065',
      admin_cap_id: '0x273dbda2a1d62460a01a07831aec0fa8191a41341d634fb43f15acdb627edbce',
      partners_id: '0xd7ac594ed2e7756f0d4a98503dd970f314f2619a10c3613c705253a155cc9fea',
    },
  },
  dlmm_router: {
    package_id: '0xbc76d04e910452518efd5fd63d5fffe77c24855063c9cdb5501e06896bc34908',
    published_at: '0xe122ffbcfe5091398ba15a60e654e6589fd586b3865d5b4118292754f8cde301',
    version: 1,
  },
  faucet: {
    package_id: '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48',
    published_at: '0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48',
    version: 1,
  },
}
