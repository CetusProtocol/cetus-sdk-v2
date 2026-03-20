import type { SuiObjectResponse } from '@mysten/sui/jsonRpc'
import { normalizeSuiObjectId } from '@mysten/sui/utils'
import type { SuiAddressType, SuiResource } from '@cetusprotocol/common-sdk'
import {
  CACHE_TIME_24H,
  CACHE_TIME_5MIN,
  CachedContent,
  DETAILS_KEYS,
  extractStructTagFromType,
  fixCoinType,
  getFutureTime,
  getObjectFields,
  getObjectId,
  getObjectPreviousTransactionDigest,
  getObjectType,
  getPackagerConfigs,
  IModule,
  normalizeCoinType,
} from '@cetusprotocol/common-sdk'
import { Base64 } from 'js-base64'
import { ConfigErrorCode, handleMessageError, PoolErrorCode } from '../errors/errors'
import type { CetusClmmSDK } from '../sdk'
import type { CetusConfigs, ClmmPoolConfig, CoinConfig, LaunchpadPoolConfig } from '../types'
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
        if (data) {
          const token: CoinConfig = {
            id: data.id as string,
            pyth_id: '',
            name: data.name,
            symbol: data.symbol,
            official_symbol: data.symbol,
            coingecko_id: '',
            decimals: data.decimals,
            project_url: '',
            logo_url: data.iconUrl as string,
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
      return item.objectId
    })
    const objects = await this._sdk.FullClient.batchGetObjects(warpIds, { showContent: true })
    const coinList: CoinConfig[] = []
    objects.forEach((object) => {
      if (object.error != null || object.data?.content?.dataType !== 'moveObject') {
        handleMessageError(
          PoolErrorCode.FetchError,
          `when getCoinConfigs get objects error: ${object.error}, please check the rpc and contracts address config.`,
          {
            [DETAILS_KEYS.METHOD_NAME]: 'getCoinConfigs',
          }
        )
      }

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
    const object = await this._sdk.FullClient.getDynamicFieldObject({
      parentId: coin_list_handle,
      name: {
        type: '0x1::type_name::TypeName',
        value: {
          name: fixCoinType(coin_type),
        },
      },
    })

    if (object.error != null || object.data?.content?.dataType !== 'moveObject') {
      handleMessageError(
        PoolErrorCode.FetchError,
        `when getCoinConfig get object error: ${object.error}, please check the rpc and contracts address config.`,
        {
          [DETAILS_KEYS.METHOD_NAME]: 'getCoinConfig',
        }
      )
    }

    const coin = this.buildCoinConfig(object, transform_extensions)
    this.updateCache(cacheKey, coin, CACHE_TIME_24H)
    return coin
  }

  /**
   * Build coin config.
   * @param {SuiObjectResponse} object Coin object.
   * @param {boolean} transform_extensions Whether to transform extensions.
   * @returns {CoinConfig} Coin config.
   */
  private buildCoinConfig(object: SuiObjectResponse, transform_extensions = true) {
    let fields = getObjectFields(object)

    fields = fields.value.fields
    const coin: any = { ...fields }

    coin.id = getObjectId(object)
    coin.address = extractStructTagFromType(fields.coin_type.fields.name).full_address
    if (fields.pyth_id) {
      coin.pyth_id = normalizeSuiObjectId(fields.pyth_id)
    }

    this.transformExtensions(coin, fields.extension_fields.fields.contents, transform_extensions)

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
      return item.objectId
    })
    const objects = await this._sdk.FullClient.batchGetObjects(warpIds, { showContent: true })
    const poolList: ClmmPoolConfig[] = []
    objects.forEach((object) => {
      if (object.error != null || object.data?.content?.dataType !== 'moveObject') {
        handleMessageError(
          PoolErrorCode.FetchError,
          `when getClmmPoolsConfigs get objects error: ${object.error}, please check the rpc and contracts address config.`,
          {
            [DETAILS_KEYS.METHOD_NAME]: 'getClmmPoolConfigs',
          }
        )
      }

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
    const object = await this._sdk.FullClient.getDynamicFieldObject({
      parentId: clmm_pools_handle,
      name: {
        type: 'address',
        value: pool_id,
      },
    })
    const pool = this.buildClmmPoolConfig(object, transform_extensions)
    this.updateCache(cacheKey, pool, CACHE_TIME_24H)
    return pool
  }

  private buildClmmPoolConfig(object: SuiObjectResponse, transform_extensions = true) {
    let fields = getObjectFields(object)
    fields = fields.value.fields
    const pool: any = { ...fields }

    pool.id = getObjectId(object)
    pool.pool_address = normalizeSuiObjectId(fields.pool_address)

    this.transformExtensions(pool, fields.extension_fields.fields.contents, transform_extensions)
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
      return item.objectId
    })
    const objects = await this._sdk.FullClient.batchGetObjects(warpIds, { showContent: true })
    const poolList: LaunchpadPoolConfig[] = []
    objects.forEach((object) => {
      if (object.error != null || object.data?.content?.dataType !== 'moveObject') {
        handleMessageError(
          PoolErrorCode.FetchError,
          `when getCoinConfigs get objects error: ${object.error}, please check the rpc and contracts address config.`,
          {
            [DETAILS_KEYS.METHOD_NAME]: 'getLaunchpadPoolConfigs',
          }
        )
      }

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
    const object = await this._sdk.FullClient.getDynamicFieldObject({
      parentId: launchpad_pools_handle,
      name: {
        type: 'address',
        value: pool_id,
      },
    })
    const pool = this.buildLaunchpadPoolConfig(object, transform_extensions)
    this.updateCache(cacheKey, pool, CACHE_TIME_24H)
    return pool
  }

  private buildLaunchpadPoolConfig(object: SuiObjectResponse, transform_extensions = true) {
    let fields = getObjectFields(object)
    fields = fields.value.fields
    const pool: any = { ...fields }

    pool.id = getObjectId(object)
    pool.pool_address = normalizeSuiObjectId(fields.pool_address)

    this.transformExtensions(pool, fields.extension_fields.fields.contents, transform_extensions)
    const social_medias: {
      name: string
      link: string
    }[] = []
    fields.social_media.fields.contents.forEach((item: any) => {
      social_medias.push({
        name: item.fields.value.fields.name,
        link: item.fields.value.fields.link,
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
      const { key } = item.fields
      let { value } = item.fields
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

    const packageObject = await this._sdk.FullClient.getObject({
      id: packageObjectId,
      options: {
        showPreviousTransaction: true,
      },
    })

    const previousTx = getObjectPreviousTransactionDigest(packageObject) as string
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

    const res = await this._sdk.FullClient.multiGetObjects({ ids: warpIds, options: { showContent: true } })

    res.forEach((item) => {
      if (item.error != null || item.data?.content?.dataType !== 'moveObject') {
        handleMessageError(
          ConfigErrorCode.InvalidConfigHandle,
          `when getCetusConfigHandle get objects error: ${item.error}, please check the rpc and contracts address config.`,
          {
            [DETAILS_KEYS.METHOD_NAME]: 'getCetusConfigHandle',
          }
        )
      }

      const fields = getObjectFields(item)
      const type = getObjectType(item) as string
      switch (extractStructTagFromType(type).name) {
        case 'ClmmPools':
          token_config.clmm_pools_handle = fields.pools.fields.id.id
          break
        case 'CoinList':
          token_config.coin_list_handle = fields.coins.fields.id.id
          break
        case 'LaunchpadPools':
          token_config.launchpad_pools_handle = fields.pools.fields.id.id
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
