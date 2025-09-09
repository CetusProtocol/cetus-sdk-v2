import CetusClmmSDK from '@cetusprotocol/sui-clmm-sdk'
import type { SdkOptions } from '../sdk'
import { FullRpcUrlTestnet } from '@cetusprotocol/common-sdk'
export const farmsTestnet: SdkOptions = {
  env: 'testnet',
  full_rpc_url: FullRpcUrlTestnet,
  farms: {
    package_id: '0x5f64435f1496e51e0b7b3d686cafdff0cbfa2cded7f3e4c579deb5d0a0338123',
    published_at: '0x5f64435f1496e51e0b7b3d686cafdff0cbfa2cded7f3e4c579deb5d0a0338123',
    version: 1,
    config: {
      global_config_id: '0x92aa3ffab80fe7ed518442413aa26d91d13c5e95aca6c3d9c03bdc7663119fd5',
      rewarder_manager_id: '0x8b356e02ffbcab52abba7e6ef0a4b822779cccb695d42fc15d3cb8eb3ed1b624',
      rewarder_manager_handle: '0x710ef7560cb9bfaa69024356297324ef1558b1a81a1a3ae4840915d3a203e7b7',
      admin_cap_id: '0x69a2261cd2bb4bad1c23dd0ff13b9e891c95393b76813658d463af75fae62735',
    },
  },
}
