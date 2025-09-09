import { FullRpcUrlTestnet } from '@cetusprotocol/common-sdk'
import { SdkOptions } from '../sdk'

export const vaultsTestnet: SdkOptions = {
  env: 'testnet',
  full_rpc_url: FullRpcUrlTestnet,
  aggregator_url: 'https://api-sui.devcetus.com/router_v3',
  providers: ['CETUS', 'DEEPBOOK', 'KRIYA', 'KRIYAV3', 'FLOWX', 'FLOWXV3', 'AFTERMATH', 'TURBOS', 'HAEDAL', 'VOLO', 'AFSUI'],
  vaults: {
    package_id: '0x10faa43183603ad756d84d4d2f67bf761b87384bb11c00526166664ae85ddfac',
    published_at: '0x10faa43183603ad756d84d4d2f67bf761b87384bb11c00526166664ae85ddfac',
    config: {
      admin_cap_id: '0x804c552b25adb4a532347956ae9992e9d4a1bd4727034d18a55d0a91caa1579d',
      vaults_manager_id: '0x72647044a12098594c6fa53baabcc82c1675ea5bd0a0a2725511d8edca68e476',
      vaults_pool_handle: '0x25d32be8892c28ab2845b91bcd95ece1b75f191a39dfd1f9681ba3212070c6c2',
      haedal: {
        package_id: '0xac2afb455cbcdc2ff1a2e9bbb8aa4ccb4506a544b08c740886892a5cdf92f472',
        published_at: '0x9dac9c5770e5f930d2223ff68782958701acfaee9337e8d8363978ce7670dffb',
        version: 1,
        config: {
          staking_id: '0x6e384d2da5b040b27f973155e25bbe4beb0ad5ca8ee0a36e20dff356094c9fc0',
          coin_type: '0xac2afb455cbcdc2ff1a2e9bbb8aa4ccb4506a544b08c740886892a5cdf92f472::hasui::HASUI',
        },
      },
      aftermath: {
        package_id: '0x5e8c0fc2b3d8aa1b06eec36c08d9d835c73c0626a1efaebc0fb03aa52f1a3ff4',
        published_at: '0x5e8c0fc2b3d8aa1b06eec36c08d9d835c73c0626a1efaebc0fb03aa52f1a3ff4',
        version: 1,
        config: {
          staked_sui_vault: '0xe498a8c07ec62200c519a0092eda233abdab879e8f332c11bdc1819eb7b12fbb',
          referral_vault: '0x8d357115058f22976cd01c5415116d9aca806d1ded37eecd75d87978f404e927',
          safe: '0x38710a6e0bd885c158e52ec7a42c8a9a1826c6696b626b4a5e2d1dcb15cfd9b7',
          validator_address: '0x9336c4c9d891e263cfac99adc397853a7392e5cf84cbd5df92207a57c7fbdadc',
          coin_type: '0x5e8c0fc2b3d8aa1b06eec36c08d9d835c73c0626a1efaebc0fb03aa52f1a3ff4::afsui::AFSUI',
        },
      },
    },
  },
  vest: {
    package_id: '0xdbd4b632249dd75d5d5b8edc2bfd886884350a9092ede60d041428e98d49f010',
    published_at: '0xdbd4b632249dd75d5d5b8edc2bfd886884350a9092ede60d041428e98d49f010',
    version: 1,
    config: {
      versioned_id: '0xde62520ddad81f81bf89462b85817cc4078f7071874477f9584f38a7b1552dd9',
      create_event_list: [
        {
          clmm_vester_id: '0x308b24963e5992f699e32db2f7088b812566a0cae580317fd3b8bf61de7f5508',
          lp_coin_type: '0xb0c18dcd849d4b47528831c64707f2f7f6aa1b7fd9ed5e1ac2f8ab356e031f25::lp_token::LP_TOKEN',
          pool_id: '0x3bb4c2bcb90efd0286de46c64df2c4a9251bac034a215b9412f35efc7baab454',
          position_id: '0x90328ae7a00e746a19158cc2f4a05ff242476f30ae984d47be61376d4d2bb031',
          vault_id: '0xde97452e63505df696440f86f0b805263d8659b77b8c316739106009d514c270',
          vault_vester_id: '0xb73c846f24ba74986cdb348713b13d1c81f39e32e8c0536a4e9042cc890fef30',
        },
      ],
    },
  },
}
