import { FullRpcUrlTestnet, GraphRpcUrlTestnet } from '@cetusprotocol/common-sdk'
import type { SdkOptions } from '../../src'
const SDKConfig = {
  xcetusConfig: {
    xcetus_manager_id: '0x3be34cbad122c8b100ed7157d762b9610e68b3c65734e08bc3c3baf857da807d',
    lock_manager_id: '0x7c67e805182e3fecd098bd68a6b06c317f28f8c6249bd771e07904a10b424e60',
    lock_handle_id: '0xc5f3bbfefe9a45c13da7a34bc72cac122ee45d633690476a8ac56bd2c4e78c86',
  },
  xcetusDividendsConfig: {
    dividend_manager_id: '0x9d1be1a6b1146b30448a266bc87127466c0bae1585750c42adffce3e25e1ab6d',
    dividend_admin_id: '0x36d63c1a588bd93775aff8f47538a0063960564f0a171d100a9f49526a872b92',
    dividend_settle_id: '0x9eb78595419560b1dcaa9fb0ca307921ab1664a5f63c877c6887ab696344b400',
    venft_dividends_id: '0xc31a85fa5a77fc1def0dc5b2aadc5317a9d744ffda24b472e56a646711770676',
    venft_dividends_id_v2: '0x53b24031120730f6e4a733526147917650b1ecd3c56b43164b69eaa74f9b9ff7',
  },
}

export const xcetus_testnet: SdkOptions = {
  full_rpc_url: FullRpcUrlTestnet,
  graph_rpc_url: GraphRpcUrlTestnet,
  xcetus: {
    package_id: '0xdebaab6b851fd3414c0a62dbdf8eb752d6b0d31f5cfce5e38541bc6c6daa8966',
    published_at: '0xdebaab6b851fd3414c0a62dbdf8eb752d6b0d31f5cfce5e38541bc6c6daa8966',
    version: 1,
    config: SDKConfig.xcetusConfig,
  },
  xcetus_dividends: {
    package_id: '0x4061e279415a3c45cfd31554d38c5b3bb0e06c65833811a98a66f469e04c69c3',
    published_at: '0xfeda040996e722ba532ab2203d13333484024456ca38bf4adeb526ce1457332d',
    version: 1,
    config: SDKConfig.xcetusDividendsConfig,
  },
  cetus_faucet: {
    package_id: '0x1a69aee6be709054750949959a67aedbb4200583b39586d5e3eabe57f40012c7',
    published_at: '0x1a69aee6be709054750949959a67aedbb4200583b39586d5e3eabe57f40012c7',
  },
  env: 'testnet',
}
