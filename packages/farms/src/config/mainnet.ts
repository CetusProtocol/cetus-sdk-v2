import type CetusClmmSDK from '@cetusprotocol/sui-clmm-sdk'
import type { SdkOptions } from '../sdk'
import { CetusFarmsSDK } from '../sdk'
import { FullRpcUrlMainnet } from '@cetusprotocol/common-sdk'
// mainnet
export const farmsMainnet: SdkOptions = {
  env: 'mainnet',
  full_rpc_url: FullRpcUrlMainnet,
  farms: {
    package_id: '0x11ea791d82b5742cc8cab0bf7946035c97d9001d7c3803a93f119753da66f526',
    published_at: '0x7dba8e74b5d512a3c3bd8a1f7ef111fe9f624ddeb935635385645ca5db1f7850',
    version: 7,
    config: {
      global_config_id: '0x21215f2f6de04b57dd87d9be7bb4e15499aec935e36078e2488f36436d64996e',
      rewarder_manager_id: '0xe0e155a88c77025056da08db5b1701a91b79edb6167462f768e387c3ed6614d5',
      rewarder_manager_handle: '0xb32e312cbb3367d6f3d2b4e57c9225e903d29b7b9f612dae2ddf75bdeb26a5aa',
      admin_cap_id: '0xf10fbf1fea5b7aeaa524b87769461a28c5c977613046360093673991f26d886c',
    },
  },
}
