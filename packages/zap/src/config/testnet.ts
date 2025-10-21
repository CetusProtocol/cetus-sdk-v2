import CetusClmmSDK from '@cetusprotocol/sui-clmm-sdk'
import { FullRpcUrlTestnet, GraphRpcUrlTestnet } from '@cetusprotocol/common-sdk'
import { CetusZapSDK, SdkOptions } from '../sdk'
export const zapTestnet: SdkOptions = {
  env: 'testnet',
  full_rpc_url: FullRpcUrlTestnet,
  graph_rpc_url: GraphRpcUrlTestnet,
  aggregator_url: 'https://api-sui.devcetus.com/router_v3',
  providers: ['CETUS', 'DEEPBOOK', 'KRIYA', 'KRIYAV3', 'FLOWX', 'FLOWXV3', 'AFTERMATH', 'TURBOS', 'HAEDAL', 'VOLO', 'AFSUI'],
}
