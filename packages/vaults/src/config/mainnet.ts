import { DefaultProviders, FullRpcUrlMainnet, GraphRpcUrlMainnet } from '@cetusprotocol/common-sdk'
import { SdkOptions } from '../sdk'
// mainnet
export const vaultsMainnet: SdkOptions = {
  env: 'mainnet',
  full_rpc_url: FullRpcUrlMainnet,
  graph_rpc_url: GraphRpcUrlMainnet,
  aggregator_url: 'https://api-sui.cetus.zone/router_v3',
  providers: [],
  vaults: {
    /**
     * https://www.moveregistry.com/package/@cetuspackages/vaults
     */
    package_id: '0xd3453d9be7e35efe222f78a810bb3af1859fd1600926afced8b4936d825c9a05',
    published_at: '0x7d0ef2da63f62ad6af72f17664f3f32e9e8de73ac3bcb59012294a7c5c67b3d3',
    version: 12,
    config: {
      admin_cap_id: '0x78a42978709c4032fab7b33b782b5bcef64c1c6603250bf23644650b72144375',
      vaults_manager_id: '0x25b82dd2f5ee486ed1c8af144b89a8931cd9c29dee3a86a1bfe194fdea9d04a6',
      vaults_pool_handle: '0x9036bcc5aa7fd2cceec1659a6a1082871f45bc400c743f50063363457d1738bd',
    },
  },
  vest: {
    package_id: '0x27f936160f66ffaad15c775507f30d7634e4287054846f13c9c43df9cb1f9fdf',
    published_at: '0x27f936160f66ffaad15c775507f30d7634e4287054846f13c9c43df9cb1f9fdf',
    version: 1,
    config: {
      versioned_id: '0xf7e434830156d653bd8e3219e1a849aeda22248f73dda20d73f988a1daf001db',
      create_event_list: [
        {
          clmm_vester_id: '0xe255c47472470c03bbefb1fc883459c2b978d3ad29aa8ee0c8c1ec9753fa7d01',
          lp_coin_type: '0x828b452d2aa239d48e4120c24f4a59f451b8cd8ac76706129f4ac3bd78ac8809::lp_token::LP_TOKEN',
          pool_id: '0x871d8a227114f375170f149f7e9d45be822dd003eba225e83c05ac80828596bc',
          position_id: '0x1f37fa2d4211d4ad15c9e287ca6b2afc00f20b8817344eee8246a6805c4ac74d',
          vault_id: '0xde97452e63505df696440f86f0b805263d8659b77b8c316739106009d514c270',
          vault_vester_id: '0x83445cdfd2347d034a41b05ad2e1f13372539fc8520d9f76159eb9bf0d100880',
        },
        {
          clmm_vester_id: '0xe255c47472470c03bbefb1fc883459c2b978d3ad29aa8ee0c8c1ec9753fa7d01',
          lp_coin_type: '0xb490d6fa9ead588a9d72da07a02914da42f6b5b1339b8118a90011a42b67a44f::lp_token::LP_TOKEN',
          pool_id: '0x6c545e78638c8c1db7a48b282bb8ca79da107993fcb185f75cedc1f5adb2f535',
          position_id: '0xcdea9160482915b121b57092e81561a86d48c1eef7af6fcc9ed3b47f700cf4af',
          vault_id: '0x5732b81e659bd2db47a5b55755743dde15be99490a39717abc80d62ec812bcb6',
          vault_vester_id: '0xc328913ff1139469c690675e95e8ef8c9f794799b5007a55981207772f917e63',
        },
        {
          clmm_vester_id: '0xe255c47472470c03bbefb1fc883459c2b978d3ad29aa8ee0c8c1ec9753fa7d01',
          lp_coin_type: '0x0c8a5fcbe32b9fc88fe1d758d33dd32586143998f68656f43f3a6ced95ea4dc3::lp_token::LP_TOKEN',
          pool_id: '0xa528b26eae41bcfca488a9feaa3dca614b2a1d9b9b5c78c256918ced051d4c50',
          position_id: '0x50e524d15444cf90be2db67961c7fbcda45ffbb2f632d4ccee20f3f20f561efe',
          vault_id: '0xff4cc0af0ad9d50d4a3264dfaafd534437d8b66c8ebe9f92b4c39d898d6870a3',
          vault_vester_id: '0x17369fc35b47756da62405b6eb70e9fe1176fb8761e362c5f1aa38858bbfd15b',
        },
      ],
    },
  },
}
