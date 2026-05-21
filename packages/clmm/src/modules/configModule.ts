import { fromHex, normalizeSuiObjectId, toHex } from '@mysten/sui/utils'
import type { SuiAddressType, SuiResource } from '@cetusprotocol/common-sdk'
import { bcs as suiBcs } from '@mysten/sui/bcs';
import {
  CACHE_TIME_24H,
  CACHE_TIME_5MIN,
  CachedContent,
  DETAILS_KEYS,
  extractStructTagFromType,
  fixCoinType,
  getFutureTime,
  getPackagerConfigs,
  IModule,
  normalizeCoinType,
} from '@cetusprotocol/common-sdk'
import { Base64 } from 'js-base64'
import { ConfigErrorCode, handleMessageError, PoolErrorCode } from '../errors/errors'
import type { CetusClmmSDK } from '../sdk'
import type { CetusConfigs, ClmmPoolConfig, CoinConfig, LaunchpadPoolConfig } from '../types'
import { bcs } from '@mysten/sui/bcs'


const TypeName = bcs.struct('TypeName', {
  name: bcs.string(),
});

const StringStringEntry = bcs.struct('Entry<String, String>', {
  key: bcs.string(),
  value: bcs.string(),
});

const StringStringVecMap = bcs.struct('VecMap<String, String>', {
  contents: bcs.vector(StringStringEntry),
});

export const Coin = bcs.struct('Coin', {
  name: bcs.string(),
  symbol: bcs.string(),
  coingecko_id: bcs.string(),
  pyth_id: bcs.string(),
  decimals: bcs.u8(),
  logo_url: bcs.string(),
  project_url: bcs.string(),
  coin_type: TypeName,
  extension_fields: StringStringVecMap,
});

const Address = bcs.bytes(32).transform({
  input: (val: string) => fromHex(val),
  output: (val) => toHex(val),
});

export const ClmmPool = bcs.struct('Pool', {
  pool_address: Address,      // address
  pool_type: bcs.string(),          // String
  project_url: bcs.string(),        // String
  is_closed: bcs.bool(),
  is_show_rewarder: bcs.bool(),
  show_rewarder_1: bcs.bool(),
  show_rewarder_2: bcs.bool(),
  show_rewarder_3: bcs.bool(),
  extension_fields: StringStringVecMap,
});

export const MediaInfo = bcs.struct('MediaInfo', {
  name: bcs.string(),
  link: bcs.string(),
});

const StringMediaInfoEntry = bcs.struct('Entry<String, MediaInfo>', {
  key: bcs.string(),
  value: MediaInfo,
});

const StringMediaInfoVecMap = bcs.struct('VecMap<String, MediaInfo>', {
  contents: bcs.vector(StringMediaInfoEntry),
});

export const LaunchpadPool = bcs.struct('LaunchpadPool', {
  pool_address: Address,          // address -> 32 bytes
  is_closed: bcs.bool(),
  show_settle: bcs.bool(),
  coin_symbol: bcs.string(),
  coin_name: bcs.string(),
  coin_icon: bcs.string(),
  banners: bcs.vector(bcs.string()),    // vector<String>
  introduction: bcs.string(),
  website: bcs.string(),
  tokenomics: bcs.string(),
  social_media: StringMediaInfoVecMap,  // VecMap<String, MediaInfo>
  terms: bcs.string(),
  white_list_terms: bcs.string(),
  regulation: bcs.string(),
  project_details: bcs.string(),
  extension_fields: StringStringVecMap, // VecMap<String, String>
});

/**
 * Helper class to help interact with clmm pool and coin and launchpad pool config.
 */
export class ConfigModule implements IModule<CetusClmmSDK> {
  protected _sdk: CetusClmmSDK

  private readonly _cache: Record<string, CachedContent> = {}

  constructor(sdk: CetusClmmSDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  /**
   * Set default token list cache.
   * @param {CoinConfig[]}coin_list
   */
  setTokenListCache(coin_list: CoinConfig[]) {
    const { coin_list_handle } = getPackagerConfigs(this.sdk.sdkOptions.cetus_config)
    const cacheKey = `${coin_list_handle}_getCoinConfigs`
    const cacheData = this.getCache<CoinConfig[]>(cacheKey)
    const updatedCacheData = cacheData ? [...cacheData, ...coin_list] : coin_list
    this.updateCache(cacheKey, updatedCacheData)
  }

  /**
   * Get token config list by coin type list.
   * @param {SuiAddressType[]} coin_types Coin type list.
   * @returns {Promise<Record<string, CoinConfig>>} Token config map.
   */
  async getTokenListByCoinTypes(coin_types: SuiAddressType[]): Promise<Record<string, CoinConfig>> {
    const tokenMap: Record<string, CoinConfig> = {}
    const { coin_list_handle } = getPackagerConfigs(this.sdk.sdkOptions.cetus_config)
    const cacheKey = `${coin_list_handle}_getCoinConfigs`
    const cacheData = this.getCache<CoinConfig[]>(cacheKey)

    if (cacheData !== undefined) {
      const tokenList = cacheData
      for (const coinType of coin_types) {
        for (const token of tokenList) {
          if (normalizeCoinType(coinType) === normalizeCoinType(token.address)) {
            tokenMap[coinType] = token
            continue
          }
        }
      }
    }

    const unFoundArray = coin_types.filter((coinType: string) => {
      return tokenMap[coinType] === undefined
    })

    for (const coinType of unFoundArray) {
      const metadataKey = `${coinType}_metadata`
      const metadata = this.getCache<CoinConfig>(metadataKey)
      if (metadata !== undefined) {
        tokenMap[coinType] = metadata as CoinConfig
      } else {
        const data = await this._sdk.FullClient.getCoinMetadata({
          coinType,
        })
        if (data.coinMetadata) {
          const { id, name, symbol, decimals, iconUrl } = data.coinMetadata
          const token: CoinConfig = {
            id: id as string,
            pyth_id: '',
            name: name,
            symbol: symbol,
            official_symbol: symbol,
            coingecko_id: '',
            decimals: decimals,
            project_url: '',
            logo_url: iconUrl as string,
            address: coinType,
          }
          tokenMap[coinType] = token

          this.updateCache(metadataKey, token, CACHE_TIME_24H)
        } else {
          console.log(`not found ${coinType}`)
        }
      }
    }

    return tokenMap
  }

  /**
   * Get coin config list.
   * @param {boolean} force_refresh Whether to force a refresh of the cache entry.
   * @param {boolean} transform_extensions Whether to transform extensions.
   * @returns {Promise<CoinConfig[]>} Coin config list.
   */
  async getCoinConfigs(force_refresh = false, transform_extensions = true): Promise<CoinConfig[]> {
    const { coin_list_handle } = getPackagerConfigs(this.sdk.sdkOptions.cetus_config)
    const cacheKey = `${coin_list_handle}_getCoinConfigs`
    const cacheData = this.getCache<CoinConfig[]>(cacheKey, force_refresh)
    if (cacheData) {
      return cacheData
    }
    const res = await this._sdk.FullClient.getDynamicFieldsByPage(coin_list_handle)
    const warpIds = res.data.map((item: any) => {
      return item.fieldId
    })
    const objects = await this._sdk.FullClient.batchGetObjects(warpIds, { json: true })
    const coinList: CoinConfig[] = []
    objects.forEach((object) => {
      const coin = this.buildCoinConfig(object, transform_extensions)
      this.updateCache(`${coin_list_handle}_${coin.address}_getCoinConfig`, coin, CACHE_TIME_24H)
      coinList.push({ ...coin })
    })
    this.updateCache(cacheKey, coinList, CACHE_TIME_24H)
    return coinList
  }

  /**
   * Get coin config by coin type.
   * @param {string} coin_type Coin type.
   * @param {boolean} force_refresh Whether to force a refresh of the cache entry.
   * @param {boolean} transform_extensions Whether to transform extensions.
   * @returns {Promise<CoinConfig>} Coin config.
   */
  async getCoinConfig(coin_type: string, force_refresh = false, transform_extensions = true): Promise<CoinConfig> {
    const { coin_list_handle } = getPackagerConfigs(this.sdk.sdkOptions.cetus_config)
    const cacheKey = `${coin_list_handle}_${coin_type}_getCoinConfig`
    const cacheData = this.getCache<CoinConfig>(cacheKey, force_refresh)
    if (cacheData) {
      return cacheData
    }
    const object = await this._sdk.FullClient.getDynamicField({
      parentId: coin_list_handle,
      name: {
        type: '0x1::type_name::TypeName',
        bcs: bcs.String.serialize(fixCoinType(coin_type, true)).toBytes(),
      },
    })

    const coinRaw = Coin.parse(object.dynamicField.value.bcs)
    const coin: CoinConfig = {
      id: object.dynamicField.fieldId,
      address: extractStructTagFromType(coinRaw.coin_type.name).full_address,
      name: coinRaw.name,
      symbol: coinRaw.symbol,
      pyth_id: coinRaw.pyth_id,
      project_url: coinRaw.project_url,
      logo_url: coinRaw.logo_url,
      decimals: coinRaw.decimals,
    }
    if (coin.pyth_id) {
      coin.pyth_id = normalizeSuiObjectId(coin.pyth_id)
    }
    this.transformExtensions(coin, coinRaw.extension_fields.contents, transform_extensions)

    delete coin.coin_type
    this.updateCache(cacheKey, coin, CACHE_TIME_24H)
    return coin
  }

  /**
   * Build coin config.
   * @param {boolean} transform_extensions Whether to transform extensions.
   * @returns {CoinConfig} Coin config.
   */
  private buildCoinConfig(object: any, transform_extensions = true) {
    let { json, objectId } = object

    const fields = json.value
    const coin: any = { ...fields }

    coin.id = objectId
    coin.address = extractStructTagFromType(fields.coin_type.name).full_address
    if (fields.pyth_id) {
      coin.pyth_id = normalizeSuiObjectId(fields.pyth_id)
    }

    this.transformExtensions(coin, fields.extension_fields.contents, transform_extensions)

    delete coin.coin_type
    return coin
  }

  /**
   * Get clmm pool config list.
   * @param force_refresh
   * @param transform_extensions
   * @returns
   */
  async getClmmPoolConfigs(force_refresh = false, transform_extensions = true): Promise<ClmmPoolConfig[]> {
    const { clmm_pools_handle } = getPackagerConfigs(this.sdk.sdkOptions.cetus_config)
    const cacheKey = `${clmm_pools_handle}_getClmmPoolConfigs`
    const cacheData = this.getCache<ClmmPoolConfig[]>(cacheKey, force_refresh)
    if (cacheData) {
      return cacheData
    }
    const res = await this._sdk.FullClient.getDynamicFieldsByPage(clmm_pools_handle)
    const warpIds = res.data.map((item: any) => {
      return item.fieldId
    })
    const objects = await this._sdk.FullClient.batchGetObjects(warpIds, { json: true })
    const poolList: ClmmPoolConfig[] = []
    objects.forEach((object) => {

      const pool = this.buildClmmPoolConfig(object, transform_extensions)
      this.updateCache(`${pool.pool_address}_getClmmPoolConfig`, pool, CACHE_TIME_24H)
      poolList.push({ ...pool })
    })
    this.updateCache(cacheKey, poolList, CACHE_TIME_24H)
    return poolList
  }

  async getClmmPoolConfig(pool_id: string, force_refresh = false, transform_extensions = true): Promise<ClmmPoolConfig> {
    const { clmm_pools_handle } = getPackagerConfigs(this.sdk.sdkOptions.cetus_config)
    const cacheKey = `${pool_id}_getClmmPoolConfig`
    const cacheData = this.getCache<ClmmPoolConfig>(cacheKey, force_refresh)
    if (cacheData) {
      return cacheData
    }
    const object = await this._sdk.FullClient.getDynamicField({
      parentId: clmm_pools_handle,
      name: {
        type: 'address',
        bcs: bcs.Address.serialize(pool_id).toBytes(),
      },
    })

    const poolRaw = ClmmPool.parse(object.dynamicField.value.bcs)
    const pool: ClmmPoolConfig = {
      id: object.dynamicField.fieldId,
      pool_address: normalizeSuiObjectId(poolRaw.pool_address),
      pool_type: poolRaw.pool_type,
      project_url: poolRaw.project_url,
      is_closed: poolRaw.is_closed,
      is_show_rewarder: poolRaw.is_show_rewarder,
      show_rewarder_1: poolRaw.show_rewarder_1,
      show_rewarder_2: poolRaw.show_rewarder_2,
      show_rewarder_3: poolRaw.show_rewarder_3,
    }
    this.transformExtensions(pool, poolRaw.extension_fields.contents, transform_extensions)
    this.updateCache(cacheKey, pool, CACHE_TIME_24H)
    return pool
  }

  private buildClmmPoolConfig(object: any, transform_extensions = true) {
    let { json, objectId } = object
    const pool: any = { ...json.value }

    pool.id = objectId
    pool.pool_address = normalizeSuiObjectId(json.value.pool_address)

    this.transformExtensions(pool, json.value.extension_fields.contents, transform_extensions)
    return pool
  }

  /**
   * Get launchpad pool config list.
   * @param force_refresh
   * @returns
   */
  async getLaunchpadPoolConfigs(force_refresh = false, transform_extensions = true): Promise<LaunchpadPoolConfig[]> {
    const { launchpad_pools_handle } = getPackagerConfigs(this.sdk.sdkOptions.cetus_config)
    const cacheKey = `${launchpad_pools_handle}_getLaunchpadPoolConfigs`
    const cacheData = this.getCache<LaunchpadPoolConfig[]>(cacheKey, force_refresh)
    if (cacheData) {
      return cacheData
    }
    const res = await this._sdk.FullClient.getDynamicFieldsByPage(launchpad_pools_handle)
    const warpIds = res.data.map((item: any) => {
      return item.fieldId
    })
    const objects = await this._sdk.FullClient.batchGetObjects(warpIds, { json: true })
    const poolList: LaunchpadPoolConfig[] = []
    objects.forEach((object) => {

      const pool = this.buildLaunchpadPoolConfig(object, transform_extensions)
      this.updateCache(`${pool.pool_address}_getLaunchpadPoolConfig`, pool, CACHE_TIME_24H)
      poolList.push({ ...pool })
    })
    this.updateCache(cacheKey, poolList, CACHE_TIME_24H)
    return poolList
  }

  async getLaunchpadPoolConfig(pool_id: string, force_refresh = false, transform_extensions = true): Promise<LaunchpadPoolConfig> {
    const { launchpad_pools_handle } = getPackagerConfigs(this.sdk.sdkOptions.cetus_config)
    const cacheKey = `${pool_id}_getLaunchpadPoolConfig`
    const cacheData = this.getCache<LaunchpadPoolConfig>(cacheKey, force_refresh)
    if (cacheData) {
      return cacheData
    }
    const object = await this._sdk.FullClient.getDynamicField({
      parentId: launchpad_pools_handle,
      name: {
        type: 'address',
        bcs: bcs.Address.serialize(pool_id).toBytes(),
      },
    })

    const poolRaw = LaunchpadPool.parse(object.dynamicField.value.bcs)
    const pool: LaunchpadPoolConfig = {
      ...poolRaw,
      id: object.dynamicField.fieldId,
      pool_address: normalizeSuiObjectId(poolRaw.pool_address),
      social_media: poolRaw.social_media.contents.map((item: any) => ({
        name: item.value.name,
        link: item.value.link,
      })),
    }
    this.transformExtensions(pool, poolRaw.extension_fields.contents, transform_extensions)
    try {
      pool.regulation = decodeURIComponent(Base64.decode(pool.regulation).replace(/%/g, '%25'))
    } catch (error) {
      pool.regulation = Base64.decode(pool.regulation)
    }
    this.updateCache(cacheKey, pool, CACHE_TIME_24H)
    return pool
  }

  private buildLaunchpadPoolConfig(object: any, transform_extensions = true) {
    let { json, objectId } = object
    const pool: any = { ...json.value }

    pool.id = objectId
    pool.pool_address = normalizeSuiObjectId(pool.pool_address)

    this.transformExtensions(pool, pool.extension_fields.contents, transform_extensions)
    const social_medias: {
      name: string
      link: string
    }[] = []
    pool.social_media.contents.forEach((item: any) => {
      social_medias.push({
        name: item.value.name,
        link: item.value.link,
      })
    })
    pool.social_media = social_medias
    try {
      pool.regulation = decodeURIComponent(Base64.decode(pool.regulation).replace(/%/g, '%25'))
    } catch (error) {
      pool.regulation = Base64.decode(pool.regulation)
    }

    return pool
  }

  private transformExtensions(coin: any, data_array: any[], transform_extensions = true) {
    const extensions: any[] = []
    for (const item of data_array) {
      const { key } = item
      let value = item.value
      if (key === 'labels') {
        try {
          const decodedValue = decodeURIComponent(Base64.decode(value))
          try {
            value = JSON.parse(decodedValue)
          } catch {
            value = decodedValue
          }
        } catch (error) { }
      }
      if (transform_extensions) {
        coin[key] = value
      }
      extensions.push({
        key,
        value,
      })
    }
    delete coin.extension_fields

    if (!transform_extensions) {
      coin.extensions = extensions
    }
  }

  /**
   * Get the token config event.
   *
   * @param force_refresh Whether to force a refresh of the event.
   * @returns The token config event.
   */
  async getCetusConfig(force_refresh = false): Promise<CetusConfigs> {
    const packageObjectId = this._sdk.sdkOptions.cetus_config.package_id
    const cacheKey = `${packageObjectId}_getCetusConfig`

    const cacheData = this.getCache<CetusConfigs>(cacheKey, force_refresh)

    if (cacheData !== undefined) {
      return cacheData
    }

    const packageObject: any = await this._sdk.FullClient.getObject({
      objectId: packageObjectId,
      include: {
        effects: true,
        previousTransaction: true,
        previousTxDigest: true,
      },
    })

    const previousTx = packageObject.object!.previousTransaction as string
    const objects: any = await this._sdk.FullClient.queryEventsByPage({ Transaction: previousTx })
    let tokenConfig: CetusConfigs = {
      coin_list_id: '',
      launchpad_pools_id: '',
      clmm_pools_id: '',
      admin_cap_id: '',
      global_config_id: '',
      coin_list_handle: '',
      launchpad_pools_handle: '',
      clmm_pools_handle: '',
    }

    if (objects.data.length > 0) {
      for (const item of objects.data) {
        const formatType = extractStructTagFromType(item.type)
        switch (formatType.name) {
          case `InitCoinListEvent`:
            tokenConfig.coin_list_id = item.parsedJson.coin_list_id
            break
          case `InitLaunchpadPoolsEvent`:
            tokenConfig.launchpad_pools_id = item.parsedJson.launchpad_pools_id
            break
          case `InitClmmPoolsEvent`:
            tokenConfig.clmm_pools_id = item.parsedJson.pools_id
            break
          case `InitConfigEvent`:
            tokenConfig.global_config_id = item.parsedJson.global_config_id
            tokenConfig.admin_cap_id = item.parsedJson.admin_cap_id
            break
          default:
            break
        }
      }
    }
    tokenConfig = await this.getCetusConfigHandle(tokenConfig)
    if (tokenConfig.clmm_pools_id.length > 0) {
      this.updateCache(cacheKey, tokenConfig, CACHE_TIME_24H)
    }
    return tokenConfig
  }

  private async getCetusConfigHandle(token_config: CetusConfigs): Promise<CetusConfigs> {
    const warpIds = [token_config.clmm_pools_id, token_config.coin_list_id, token_config.launchpad_pools_id]

    const res = await this._sdk.FullClient.batchGetObjects(warpIds, { json: true })

    res.forEach((item: any) => {
      const fields = item.data?.json
      const type = item.data?.type as string
      switch (extractStructTagFromType(type).name) {
        case 'ClmmPools':
          token_config.clmm_pools_handle = fields.pools.id
          break
        case 'CoinList':
          token_config.coin_list_handle = fields.coins.id
          break
        case 'LaunchpadPools':
          token_config.launchpad_pools_handle = fields.pools.id
          break
        default:
          break
      }
    })

    return token_config
  }

  /**
   * Updates the cache for the given key.
   * @param key The key of the cache entry to update.
   * @param data The data to store in the cache.
   * @param time The time in minutes after which the cache entry should expire.
   */
  updateCache(key: string, data: SuiResource, time = CACHE_TIME_5MIN) {
    let cacheData = this._cache[key]
    if (cacheData) {
      cacheData.overdue_time = getFutureTime(time)
      cacheData.value = data
    } else {
      cacheData = new CachedContent(data, getFutureTime(time))
    }
    this._cache[key] = cacheData
  }

  /**
   * Gets the cache entry for the given key.
   * @param key The key of the cache entry to get.
   * @param force_refresh Whether to force a refresh of the cache entry.
   * @returns The cache entry for the given key, or undefined if the cache entry does not exist or is expired.
   */
  getCache<T>(key: string, force_refresh = false): T | undefined {
    try {
      const cacheData = this._cache[key]
      if (!cacheData) {
        return undefined // No cache data available
      }

      if (force_refresh || !cacheData.isValid()) {
        delete this._cache[key]
        return undefined
      }

      return cacheData.value as T
    } catch (error) {
      console.error(`Error accessing cache for key ${key}:`, error)
      return undefined
    }
  }
}
