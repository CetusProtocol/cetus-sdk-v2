import { FullRpcUrlMainnet, GraphRpcUrlMainnet } from '@cetusprotocol/common-sdk'
import type { SdkOptions } from '../sdk'
import { CetusBurnSDK } from '../sdk'
// mainnet
export const burnMainnet: SdkOptions = {
  env: 'mainnet',
  full_rpc_url: FullRpcUrlMainnet,
  graph_rpc_url: GraphRpcUrlMainnet,
  burn: {
    /**
     * https://www.moveregistry.com/package/@cetuspackages/lpburn
     */
    package_id: '0x12d73de9a6bc3cb658ec9dc0fe7de2662be1cea5c76c092fcc3606048cdbac27',
    published_at: '0xa235e50f9eb9b9a869b343d9de09f54038a7ac39a5d9cf784a3a7bfa6819a3c1',
    version: 6,
    config: {
      manager_id: '0x1d94aa32518d0cb00f9de6ed60d450c9a2090761f326752ffad06b2e9404f845',
      clmm_global_config: '0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f',
      clmm_global_vault_id: '0xce7bceef26d3ad1f6d9b6f13a953f053e6ed3ca77907516481ce99ae8e588f2b',
      burn_pool_handle: '0xc9aacf74bd7cc8da8820ae28ca4473b7e01c87be19bc35bf81c9c7311e1b299e',
    },
  },
}
