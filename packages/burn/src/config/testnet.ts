import { FullRpcUrlTestnet, GraphRpcUrlTestnet } from '@cetusprotocol/common-sdk'
import type { SdkOptions } from '../sdk'
import { CetusBurnSDK } from '../sdk'

export const burnTestnet: SdkOptions = {
  env: 'testnet',
  full_rpc_url: FullRpcUrlTestnet,
  graph_rpc_url: GraphRpcUrlTestnet,
  burn: {
    package_id: '0xf871bf6b73e30a740b44abfbbcac697b9c891a1d075f5ef8dd5092288dd52a7a',
    published_at: '0xf871bf6b73e30a740b44abfbbcac697b9c891a1d075f5ef8dd5092288dd52a7a',
    version: 1,
    config: {
      manager_id: '0xa30881ce34af31ec06a3c490ca6ffce24d280114c4d919037a28a518c9b8abd4',
      clmm_global_config: '0xd38f21b0eefc839785996e4a8909d2215a99516cad3b5263fe0c452b5e0f668d',
      clmm_global_vault_id: '0x286d508782f4834c40ad9bfaf798f830597836358afd2f45774d854aa797e464',
      burn_pool_handle: '0xcf895b33cd7ab532f1eba3e9ec9a442666e2dede3aaf8c785a69fcb0ca68d2e2',
    },
  },
}
