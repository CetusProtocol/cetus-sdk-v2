import { FullRpcUrlTestnet, GraphRpcUrlTestnet } from '@cetusprotocol/common-sdk'
import { SdkOptions } from '../sdk'
export const limitTestnet: SdkOptions = {
  env: 'testnet',
  full_rpc_url: FullRpcUrlTestnet,
  graph_rpc_url: GraphRpcUrlTestnet,
  limit_order: {
    package_id: '0xc65bc51d2bc2fdbce8c701f8d812da80fb37dba9cdf97ce38f60ab18c5202b17',
    published_at: '0xc65bc51d2bc2fdbce8c701f8d812da80fb37dba9cdf97ce38f60ab18c5202b17',
    config: {
      rate_orders_indexer_id: '0xeaa7dc3a4b70c14b434aed2cef0bdd272a781c630ea3c54c25fa53c72fb3cf96',
      rate_orders_indexer_handle: '0x62eea7ce7be125e6b43fac6158d0ac8a6b0f263446d4631ad5a3629d82fef2ed',
      global_config_id: '0xd4d98f126233057b3a01f17adfb5bc77d7bdb0332fe982ab44c6c7a2f66443dc',
      token_list_handle: '0x81233cdf2165f013a57c3ab180b079e0f411483ba7f80dd6fbcb74426d2045f9',
      user_orders_indexer_id: '0x18ff28ae25ea50c703a0dfcc49653cc7dd7035207e26c8f86fa9e4aea49037d0',
      user_orders_indexer_handle: '0xbe3301b85fb0fc99deacb68c31d971837ae23a65c38680cf79a6b8562518b4c7',
    },
  },
}
