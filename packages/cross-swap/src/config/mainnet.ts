import type { SdkOptions } from '../sdk'
import { FullRpcUrlMainnet, GraphRpcUrlMainnet } from '@cetusprotocol/common-sdk'
// mainnet
export const CrossSwapMainnet: SdkOptions = {
  env: 'mainnet',
  full_rpc_url: FullRpcUrlMainnet,
  graph_rpc_url: GraphRpcUrlMainnet,
  mayan: {
    referrer_addresses: {},
  },
  lifi: {
    integrator: 'cetus',
  },
}
