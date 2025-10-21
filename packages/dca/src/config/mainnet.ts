import { FullRpcUrlMainnet, GraphRpcUrlMainnet } from '@cetusprotocol/common-sdk'
import type { SdkOptions } from '../sdk'
import { CetusDcaSDK } from '../sdk'
// mainnet
export const dcaMainnet: SdkOptions = {
  env: 'mainnet',
  full_rpc_url: FullRpcUrlMainnet,
  graph_rpc_url: GraphRpcUrlMainnet,
  dca: {
    /**
     * https://www.moveregistry.com/package/@cetuspackages/dca?tab=versions
     */
    package_id: '0x587614620d0d30aed66d86ffd3ba385a661a86aa573a4d579017068f561c6d8f',
    published_at: '0xbeb32dee947006e0c22374d11af3fec2af862d380dea69488939dc4398d3daa9',
    version: 2,
    config: {
      admin_cap_id: '0xbcdd7391245dd8d6118a39bc83e6d9a7cfca899d06cc283c1a4cae41b2508574',
      global_config_id: '0x5db218756f8486fa2ac26fab590c4be4e439be54e6d932c9a30b20573a5b706a',
      indexer_id: '0x713f0968d042b48f4ec57e4e21bd7e346d06355f59776faedc9497ca990a9f77',
      user_indexer_id: '0x0ae365f60f2fa692831f9496c9e49b2440c74f14e8eab6f88dbb418c443b5020',
      in_coin_whitelist_id: '0x845643253afdfef9c4202e7af5e2de374b7f4766f78694903e8b2c0f83dab3ce',
      out_coin_whitelist_id: '0xe398b24a2b28f1ffd18394eaa78538d6ec8111dcb5fd919424bd3d42764c19f7',
    },
  },
}
