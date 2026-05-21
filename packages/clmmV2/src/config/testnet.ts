import { FullRpcUrlTestnet, GraphRpcUrlTestnet } from '@cetusprotocol/common-sdk'
import { SdkOptions } from '../sdk'


// testnet test compensation
export const clmmTestnet: SdkOptions = {
  env: 'testnet',
  full_rpc_url: FullRpcUrlTestnet,
  graph_rpc_url: GraphRpcUrlTestnet,
  clmm_pool: {
    package_id: '0x67e34e0cea715da4ce74a51b3fa9b32f9bec2f211ab35ea2556e755a52c84dae',
    published_at: '0x67e34e0cea715da4ce74a51b3fa9b32f9bec2f211ab35ea2556e755a52c84dae',
    version: 1,
    config: {
      global_config_id: '0xc5409c4fd988ce1f465acd4d82164a8ef773e4026616092ae6a6580105e833be',
      registry_id: '0x6e439f15661c50a5b588432e08f147b780c67026bf7fb87da485449426eb7d66',
      admin_cap_id: '0x21422db9d71fc87bfbd32b84b464ee4ac9269bff2b9979b7012448820316d1c5',
      partners_id: '0xc1e9c62b29fdd7adca501ace9a4b804391ad354196ccc01fb6ffc01469e4a343',
      versioned_id: '0xa7ce37c886b654a137059afb1b5a68d75660eec400303342510dec590d59c908',
    },
  },
  router: {
    package_id: '0x9d30511058c4111e10afa4e8c6108d13594d0475ecb103f4ff99259d1c9e038f',
    published_at: '0x9d30511058c4111e10afa4e8c6108d13594d0475ecb103f4ff99259d1c9e038f',
    version: 1,
  },
}
