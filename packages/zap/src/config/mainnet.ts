import CetusClmmSDK from '@cetusprotocol/sui-clmm-sdk'
import { CetusZapSDK, SdkOptions } from '../sdk'
import { DefaultProviders, FullRpcUrlMainnet, GraphRpcUrlMainnet } from '@cetusprotocol/common-sdk'
// mainnet
export const zapMainnet: SdkOptions = {
  env: 'mainnet',
  full_rpc_url: FullRpcUrlMainnet,
  graph_rpc_url: GraphRpcUrlMainnet,
  aggregator_url: 'https://api-sui.cetus.zone/router_v3',
  providers: DefaultProviders,
}
