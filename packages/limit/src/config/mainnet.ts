import { FullRpcUrlMainnet, GraphRpcUrlMainnet } from '@cetusprotocol/common-sdk'
import { SdkOptions } from '../sdk'
// mainnet
export const limitMainnet: SdkOptions = {
  env: 'mainnet',
  full_rpc_url: FullRpcUrlMainnet,
  graph_rpc_url: GraphRpcUrlMainnet,
  limit_order: {
    /**
     * https://www.moveregistry.com/package/@cetuspackages/limit-order
     */
    package_id: '0x533fab9a116080e2cb1c87f1832c1bf4231ab4c32318ced041e75cc28604bba9',
    published_at: '0x37d6284f2c6cdeb5663124be7e44016399b1b657bc51564d67ec480bdff15491',
    version: 3,
    config: {
      rate_orders_indexer_id: '0xe7fa62b6fc095ed5659b85c735f4322059e1f4616dcf3343adece6e7eb52bf47',
      rate_orders_indexer_handle: '0x81a95c812cab1c9cc7a1c10446d93d2d9517097211c72b544f7efed33b540bcc',
      global_config_id: '0xd3403f23a053b52e5c4ef0c2a8be316120c435ec338f2596647b6befd569fd9c',
      token_list_handle: '0x644a7f05eff2a1b4c266d7ce849c8494fb068a4e29037c7c523e5eb822389d8d',
      user_orders_indexer_id: '0x7f851ac19e438f97e78a5335eed4f12766a3a0ae94340bab7956a402f0e6212e',
      user_orders_indexer_handle: '0x84703679acd2eeaee8de4945be79d029ab94966bc22e0f6cfd696032fd31bbc7',
    },
  },
}
