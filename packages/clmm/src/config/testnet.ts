import { FullRpcUrlTestnet, GraphRpcUrlTestnet } from '@cetusprotocol/common-sdk'
import { CetusClmmSDK, SdkOptions } from '../sdk'
const SDKConfig = {
  clmmConfig: {
    pools_id: '0xe54890bdb721cf2ee12c6327039bf3aaab900ae5ed4e0ffcc528c4a0c539edf0',
    global_config_id: '0x88b0bc51163ad221218be14a0e614342db9a11d54bb54670a82e07049ec77396',
    global_vault_id: '0xe962b50e2da5bb7ad17ef75fa377fc516dd84c5a477947fdef09b36e133bce8c',
    admin_cap_id: '0xdcb9424f5996bcbe8e20ead25420364981681d48054d9916849b3fec7f300c71',
    partners_id: '0x7699f3e3165509db1d1e83c6b7fa95e38db399fae2c2eee6b5dfadaee3c4f2c1',
  },
  cetusConfig: {
    coin_list_id: '0x257eb2ba592a5480bba0a97d05338fab17cc3283f8df6998a0e12e4ab9b84478',
    launchpad_pools_id: '0xdc3a7bd66a6dcff73c77c866e87d73826e446e9171f34e1c1b656377314f94da',
    clmm_pools_id: '0x26c85500f5dd2983bf35123918a144de24e18936d0b234ef2b49fbb2d3d6307d',
    admin_cap_id: '0x1a496f6c67668eb2c27c99e07e1d61754715c1acf86dac45020c886ac601edb8',
    global_config_id: '0xe1f3db327e75f7ec30585fa52241edf66f7e359ef550b533f89aa1528dd1be52',
    coin_list_handle: '0x3204350fc603609c91675e07b8f9ac0999b9607d83845086321fca7f469de235',
    launchpad_pools_handle: '0xae67ff87c34aceea4d28107f9c6c62e297a111e9f8e70b9abbc2f4c9f5ec20fd',
    clmm_pools_handle: '0xd28736923703342b4752f5ed8c2f2a5c0cb2336c30e1fed42b387234ce8408ec',
  },
}

// origin testnet
// export const clmmTestnet: SdkOptions = {
//   env: 'testnet',
//   full_rpc_url: FullRpcUrlTestnet,
//   cetus_config: {
//     package_id: '0xf5ff7d5ba73b581bca6b4b9fa0049cd320360abd154b809f8700a8fd3cfaf7ca',
//     published_at: '0xf5ff7d5ba73b581bca6b4b9fa0049cd320360abd154b809f8700a8fd3cfaf7ca',
//     config: SDKConfig.cetusConfig,
//   },
//   clmm_pool: {
//     package_id: '0x0c7ae833c220aa73a3643a0d508afa4ac5d50d97312ea4584e35f9eb21b9df12',
//     published_at: '0x85e61285a10efc6602ab00df70a0c06357c384ef4c5633ecf73016df1500c704',
//     config: SDKConfig.clmmConfig,
//   },
//   integrate: {
//     package_id: '0x2918cf39850de6d5d94d8196dc878c8c722cd79db659318e00bff57fbb4e2ede',
//     published_at: '0x19dd42e05fa6c9988a60d30686ee3feb776672b5547e328d6dab16563da65293',
//   },
//   stats_pools_url: 'https://api-sui.devcetus.com/v2/sui/stats_pools',
// }

// testnet test compensation
export const clmmTestnet: SdkOptions = {
  env: 'testnet',
  full_rpc_url: FullRpcUrlTestnet,
  graph_rpc_url: GraphRpcUrlTestnet,
  cetus_config: {
    package_id: '0x2933975c3f74ef7c31f512edead6c6ce3f58f8e8fdbea78770ec8d5abd8ff700',
    published_at: '0xb50a626294f743b40ea51c9cb75190f0e38c71f580981b5613aef910b67a2691',
    config: {
      coin_list_id: '',
      launchpad_pools_id: '',
      clmm_pools_id: '',
      admin_cap_id: '0x774656a83f4f625fcc4e4dbf103eb77caf2d8b8f114ad33f55b848be068267b9',
      global_config_id: '0x95275a022123c66682278e9df6b5bac4da9abcc29ab698b7b2a6213262a592fe',
      coin_list_handle: '',
      launchpad_pools_handle: '',
      clmm_pools_handle: '',
    },
  },
  clmm_pool: {
    package_id: '0x5372d555ac734e272659136c2a0cd3227f9b92de67c80dc11250307268af2db8',
    published_at: '0x5372d555ac734e272659136c2a0cd3227f9b92de67c80dc11250307268af2db8',
    config: {
      pools_id: '0x20a086e6fa0741b3ca77d033a65faf0871349b986ddbdde6fa1d85d78a5f4222',
      global_config_id: '0xc6273f844b4bc258952c4e477697aa12c918c8e08106fac6b934811298c9820a',
      global_vault_id: '0x71e74a999dd7959e483f758ddf573e85fa4c24944db33ff6763c9d85a9c045fe',
      admin_cap_id: '0xbf4c48590f403c38351de0e8aa13d6d91bf78fd8c04e93ac1d0269c44d70ae02',
      partners_id: '0xb5ae5ed3f403654ae1307aadc0140f746db41efb7bda92235257c84d90a1397e',
    },
  },
  integrate: {
    package_id: '0x36187418dd79415d50e2e5903f9b3caca582052005f062959c86da64e82107a9',
    published_at: '0x36187418dd79415d50e2e5903f9b3caca582052005f062959c86da64e82107a9',
    version: 1,
  },
  stats_pools_url: 'https://api-sui.devcetus.com/v2/sui/stats_pools',
  clmm_vest: {
    package_id: '0xa46d9c66e7b24ab14c5fc5f0d08fa257d833718f0295a6343556ea2f2fdfbd7f',
    published_at: '0xa46d9c66e7b24ab14c5fc5f0d08fa257d833718f0295a6343556ea2f2fdfbd7f',
    config: {
      clmm_vest_id: '0x308b24963e5992f699e32db2f7088b812566a0cae580317fd3b8bf61de7f5508',
      versioned_id: '0x1cfb684d8ff581416a56caba2aa419bee45fe98a23cbf28e2c6c1021b14cab7c',
      cetus_coin_type: '0xc6c51938da9a5cf6d6dca692783ea7bdf4478f7b1fef693f58947848f84bcf89::cetus::CETUS',
    },
  },
}

export const eventTestnetContractMaps = [
  '0x5372d555ac734e272659136c2a0cd3227f9b92de67c80dc11250307268af2db8',
  '0x5372d555ac734e272659136c2a0cd3227f9b92de67c80dc11250307268af2db8',
]
