import { DefaultProviders, FullRpcUrlMainnet } from '@cetusprotocol/common-sdk'
import type { SdkOptions } from '..'

export const margin_trading_mainnet: SdkOptions = {
  full_rpc_url: FullRpcUrlMainnet,
  env: 'mainnet',
  aggregator_url: 'https://api-sui.cetus.zone/router_v3',
  margin_trading: {
    package_id: '0x51bfedf86b5e18076f844bf0e1f82b14667bce59e2c38a8b5c8752ba3314bbd3',
    published_at: '0x51bfedf86b5e18076f844bf0e1f82b14667bce59e2c38a8b5c8752ba3314bbd3',
    version: 0,
    config: {
      versioned_id: '0xdf21deea40ae40b2df5ef4b89a6d2d4bb487433b8fbc5af4f013c5d72e6fdc5f',
      admin_cap_id: '0x37727c2a5135bdf5b0d02f58dc119d3f3f3a778603690f8ecbb9ca9ecb2f0699',
      global_config_id: '0x3f0c7d3295ec74b465e944f9bad4310a8ce7f7fbeb76abf11933e43bb708bcd1',
      markets: '0x7d8797b6f177a8820e8b03ca81edf0818bc3ab2739df6800011b79c02d93f3ef',
      markets_table_id: '0xaf0d0a53740d02f6ace10a07a60763f8e079ee646913062e8392da3a96af3500',
    },
  },
  suilend: {
    package_id: '0xf95b06141ed4a174f239417323bde3f209b972f5930d8521ea38a52aff3a6ddf',
    published_at: '0xe37cc7bb50fd9b6dbd3873df66fa2c554e973697f50ef97707311dc78bd08444',
    config: {
      lending_market: [
        {
          name: 'Main market',
          slug: 'main',
          id: '0x84030d26d85eaa7035084a057f2f11f701b7e2e4eda87551becbc7c97505ece1',
          type: '0xf95b06141ed4a174f239417323bde3f209b972f5930d8521ea38a52aff3a6ddf::suilend::MAIN_POOL',
          owner_cap_id: '0xf7a4defe0b6566b6a2674a02a0c61c9f99bd012eed21bc741a069eaa82d35927',
        },
        {
          name: 'STEAMM LM',
          slug: 'steamm-lm',
          id: '0xc1888ec1b81a414e427a44829310508352aec38252ee0daa9f8b181b6947de9f',
          type: '0x0a071f4976abae1a7f722199cf0bfcbe695ef9408a878e7d12a7ca87b7e582a6::lp_rewards::LP_REWARDS',
          owner_cap_id: '0x55a0f33b24e091830302726c8cfbff8cf8abd2ec1f83a4e6f4bf51c7ba3ad5ab',
          is_hidden: true, // Only visible in the admin panel
        },
      ],
      lending_market_id: '0x84030d26d85eaa7035084a057f2f11f701b7e2e4eda87551becbc7c97505ece1',
      lending_market_type: '0xf95b06141ed4a174f239417323bde3f209b972f5930d8521ea38a52aff3a6ddf::suilend::MAIN_POOL',
      api_url: 'https://d10td5ybgrf39v.cloudfront.net',
    },
  },
}
