import { Transaction } from "@mysten/sui/transactions"
import { PythConfigs } from "../modules/pythPriceModule"

export type FeedInfo = {
  coin_type: string // Coin type for the price feed
  price_feed_id: string // ID of the price feed
  coin_decimals: number // Decimal precision of the coin in the price feed
}

export type Price = {
  coin_type: string // Coin type (e.g., A or B)
  price: string // Current price of the coin
  oracle_price: bigint
  coin_decimals: number // Decimal precision of the coin
  last_update_time: number
}

// A constant multiplier for the Oracle price, used for price formatting or adjustments
export const oraclePriceMultiplierDecimal = 10n

export const defaultPythConfigs: PythConfigs = {
  pyth_package_id: "0x04e20ddf36af412a4096f9014f4a565af9e812db9a05cc40254846cf6ed0ad91",
  pyth_published_at: "0x04e20ddf36af412a4096f9014f4a565af9e812db9a05cc40254846cf6ed0ad91",
  pyth_state_id: "0x1f9310238ee9298fb703c3419030b35b22bb1cc37113e3bb5007c99aec79e5b8",
  wormhole_state_id: "0xaeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c",
  hermes_service_urls: [],
}

export const feed_map_mainnet: Record<string, FeedInfo> = {
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC': {
    coin_type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    price_feed_id: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
    coin_decimals: 6,
  },
  '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI': {
    coin_type: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
    price_feed_id: '0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744',
    coin_decimals: 9,
  },
  '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS': {
    coin_type: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS',
    price_feed_id: '0xe5b274b2611143df055d6e7cd8d93fe1961716bcd4dca1cad87a83bc1e78c1ef',
    coin_decimals: 9,
  },
  '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP': {
    coin_type: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
    price_feed_id: '0x29bdd5248234e33bd93d3b81100b5fa32eaa5997843847e2c2cb16d7c6d9f7ff',
    coin_decimals: 6,
  },
  '0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX': {
    coin_type: '0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX',
    price_feed_id: '0x88250f854c019ef4f88a5c073d52a18bb1c6ac437033f5932cd017d24917ab46',
    coin_decimals: 9,
  },
  // BTC
  '0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881::coin::COIN': {
    coin_type: '0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881::coin::COIN',
    price_feed_id: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
    coin_decimals: 9,
  },
  '0xbde4ba4c2e274a60ce15c1cfff9e5c42e41654ac8b6d906a57efa4bd3c29f47d::hasui::HASUI': {
    coin_type: '0xbde4ba4c2e274a60ce15c1cfff9e5c42e41654ac8b6d906a57efa4bd3c29f47d::hasui::HASUI',
    price_feed_id: '0x6120ffcf96395c70aa77e72dcb900bf9d40dccab228efca59a17b90ce423d5e8',
    coin_decimals: 9,
  },
  '0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH': {
    coin_type: '0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH',
    price_feed_id: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    coin_decimals: 8,
  },
  '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL': {
    coin_type: '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL',
    price_feed_id: '0xeba0732395fae9dec4bae12e52760b35fc1c5671e2da8b449c9af4efe5d54341',
    coin_decimals: 9,
  },
  '0x3e8e9423d80e1774a7ca128fccd8bf5f1f7753be658c5e645929037f7c819040::lbtc::LBTC': {
    coin_type: '0x3e8e9423d80e1774a7ca128fccd8bf5f1f7753be658c5e645929037f7c819040::lbtc::LBTC',
    price_feed_id: '0x8f257aab6e7698bb92b15511915e593d6f8eae914452f781874754b03d0c612b',
    coin_decimals: 8,
  },
  '0x3a304c7feba2d819ea57c3542d68439ca2c386ba02159c740f7b406e592c62ea::haedal::HAEDAL': {
    coin_type: '0x3a304c7feba2d819ea57c3542d68439ca2c386ba02159c740f7b406e592c62ea::haedal::HAEDAL',
    price_feed_id: '0xe67d98cc1fbd94f569d5ba6c3c3c759eb3ffc5d2b28e64538a53ae13efad8fd1',
    coin_decimals: 9,
  },
}

/**
 * Adjusts the oracle price by applying the specified decimal (expo) to it.
 * The price is scaled based on the expo value, which determines whether to scale the price up or down.
 *
 * @param pythPrice - The raw price value from the oracle (in bigint).
 * @param expo - The decimal exponent (in bigint) that determines how to adjust the price.
 *             A negative value means scaling up the price, while a positive value means scaling it down.
 * @returns The price adjusted by the expo in bigint format.
 * @throws Error if the `oraclePriceMultiplierDecimal` is not defined or the price is zero.
 */
export function getPriceWithFormattedDecimals(
  pythPrice: bigint,
  expo: bigint // expo represents the decimal exponent
): bigint {
  // Check if the required price multiplier is defined
  if (!oraclePriceMultiplierDecimal) {
    throw new Error('oraclePriceMultiplierDecimal is required')
  }

  // Price must be greater than 0
  if (pythPrice === 0n) {
    throw new Error('Invalid oracle price')
  }

  // If expo is negative, the price needs to be scaled up
  if (expo < 0n) {
    // Calculate the scale factor for negative expo values
    const scaleFactor = 10n ** (oraclePriceMultiplierDecimal - -expo) // Convert expo to a positive number
    return pythPrice * scaleFactor // Scale up the price
  }

  // If expo is positive, the price needs to be scaled down
  return pythPrice / 10n ** (expo + oraclePriceMultiplierDecimal)
}

export type PythUpdateOraclePriceCallback = (params: {
  tx: Transaction
  coinType: string
  priceUpdatesHotPotato: any
  priceInfoObjectId: string
}) => any

