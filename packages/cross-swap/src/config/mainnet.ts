import type { SdkOptions } from '../sdk'
import { FullRpcUrlMainnet } from '@cetusprotocol/common-sdk'
// mainnet
export const CrossSwapMainnet: SdkOptions = {
  env: 'mainnet',
  full_rpc_url: FullRpcUrlMainnet,
  mayan: {
    referrer_addresses: {},
  },
  lifi: {
    integrator: 'cetus',
  },
}
