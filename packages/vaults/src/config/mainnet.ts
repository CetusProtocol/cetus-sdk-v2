import CetusClmmSDK from '@cetusprotocol/sui-clmm-sdk'
import { DefaultProviders, FullRpcUrlMainnet, GraphRpcUrlMainnet } from '@cetusprotocol/common-sdk'
import { SdkOptions } from '../sdk'
// mainnet
export const vaultsMainnet: SdkOptions = {
  env: 'mainnet',
  full_rpc_url: FullRpcUrlMainnet,
  graph_rpc_url: GraphRpcUrlMainnet,
  aggregator_url: 'https://api-sui.cetus.zone/router_v3',
  providers: DefaultProviders,
  vaults: {
    /**
     * https://www.moveregistry.com/package/@cetuspackages/vaults
     */
    package_id: '0xd3453d9be7e35efe222f78a810bb3af1859fd1600926afced8b4936d825c9a05',
    published_at: '0x92efb523574a0c60b0f5bd794b2f5abfb26f5ddec3818dde8336abb6e0b07c21',
    version: 11,
    config: {
      admin_cap_id: '0x78a42978709c4032fab7b33b782b5bcef64c1c6603250bf23644650b72144375',
      vaults_manager_id: '0x25b82dd2f5ee486ed1c8af144b89a8931cd9c29dee3a86a1bfe194fdea9d04a6',
      vaults_pool_handle: '0x9036bcc5aa7fd2cceec1659a6a1082871f45bc400c743f50063363457d1738bd',
      /**
       * https://www.moveregistry.com/package/@haedal/hasui?tab=versions
       */
      haedal: {
        package_id: '0xbde4ba4c2e274a60ce15c1cfff9e5c42e41654ac8b6d906a57efa4bd3c29f47d',
        published_at: '0x19e6ea7f5ced4f090e20da794cc80349a03e638940ddb95155a4e301f5f4967c',
        version: 7,
        config: {
          staking_id: '0x47b224762220393057ebf4f70501b6e657c3e56684737568439a04f80849b2ca',
          coin_type: '0xbde4ba4c2e274a60ce15c1cfff9e5c42e41654ac8b6d906a57efa4bd3c29f47d::hasui::HASUI',
        },
      },
      volo: {
        package_id: '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55',
        published_at: '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55',
        version: 1,
        config: {
          native_pool: '0x7fa2faa111b8c65bea48a23049bfd81ca8f971a262d981dcd9a17c3825cb5baf',
          vsui_metadata: '0x680cd26af32b2bde8d3361e804c53ec1d1cfe24c7f039eb7f549e8dfde389a60',
          coin_type: '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT',
        },
      },
      aftermath: {
        package_id: '0x7f6ce7ade63857c4fd16ef7783fed2dfc4d7fb7e40615abdb653030b76aef0c6',
        published_at: '0x7f6ce7ade63857c4fd16ef7783fed2dfc4d7fb7e40615abdb653030b76aef0c6',
        version: 1,
        config: {
          staked_sui_vault: '0x2f8f6d5da7f13ea37daa397724280483ed062769813b6f31e9788e59cc88994d',
          referral_vault: '0x4ce9a19b594599536c53edb25d22532f82f18038dc8ef618afd00fbbfb9845ef',
          safe: '0xeb685899830dd5837b47007809c76d91a098d52aabbf61e8ac467c59e5cc4610',
          validator_address: '0xd30018ec3f5ff1a3c75656abf927a87d7f0529e6dc89c7ddd1bd27ecb05e3db2',
          coin_type: '0xf325ce1300e8dac124071d3152c5c5ee6174914f8bc2161e88329cf579246efc::afsui::AFSUI',
        },
      },
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
