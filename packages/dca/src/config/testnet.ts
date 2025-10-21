import { FullRpcUrlTestnet, GraphRpcUrlTestnet } from '@cetusprotocol/common-sdk'
import type { SdkOptions } from '../sdk'
import { CetusDcaSDK } from '../sdk'
export const dcaTestnet: SdkOptions = {
  env: 'testnet',
  full_rpc_url: FullRpcUrlTestnet,
  graph_rpc_url: GraphRpcUrlTestnet,
  dca: {
    package_id: '0x484d2be08b58b8dc00a08c0ff8a2a9cd0542c4249ea2d5934ef9b15a10585d88',
    published_at: '0x484d2be08b58b8dc00a08c0ff8a2a9cd0542c4249ea2d5934ef9b15a10585d88',
    config: {
      admin_cap_id: '0xf54334a5cf41874d151cc610f7575f2b9ca8aab32103be3ed87f07f73388dcf2',
      global_config_id: '0xdac150723df0b51c1407ea942036d7f9d4e3b064ff35a4136dd31ffb397497e0',
      indexer_id: '0xacd0ab94883a8785c5258388618b6252f0c2e9384b23f91fc23f6c8ef44d445c',
      user_indexer_id: '0xc4ca05342746468383922650a3137bd3efc49d4c7a37431ed11a94c08dbfb677',
      in_coin_whitelist_id: '0xe72cdb8a0777bbcb5105b7045b90f5fdc8c7b946d48fd4cec0607d201a45a9b7',
      out_coin_whitelist_id: '0xbe67538ca0e4683fef704b374d034f5a4f79cdc756ea47cec82df55b37d4ff0a',
    },
  },
}
