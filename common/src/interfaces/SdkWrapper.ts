import { isValidSuiAddress } from '@mysten/sui/utils'
import { CommonErrorCode, handleMessageError } from '../errors/errors'
import { FullClient, FullRpcUrlMainnet, FullRpcUrlTestnet, type BaseSdkOptions, type SuiAddressType, type SuiResource } from '../type/sui'
import { CACHE_TIME_24H, CachedContent, getFutureTime } from '../utils/cachedContent'
import { patchFixSuiObjectId } from '../utils/contracts'
import { SuiClient } from '@mysten/sui/client'
import { createFullClient } from '../modules/extendedSuiClient'

export abstract class SdkWrapper<T extends BaseSdkOptions> {
  readonly _cache: Record<string, CachedContent> = {}
  private _fullClient: FullClient
  private _senderAddress: SuiAddressType = ''
  /**
   *  Provide sdk options
   */
  protected _sdkOptions: T

  constructor(options: T) {
    const { sui_client, env = 'mainnet' } = options
    this._sdkOptions = options
    if (sui_client) {
      this._fullClient = createFullClient(sui_client)
    } else {
      const full_rpc_url = options.full_rpc_url || (env === 'mainnet' ? FullRpcUrlMainnet : FullRpcUrlTestnet)
      this._sdkOptions.full_rpc_url = full_rpc_url
      this._fullClient = createFullClient(new SuiClient({ url: full_rpc_url }))
    }
  }

  /**
   * Getter for the sdkOptions property.
   * @returns {SdkOptions} The sdkOptions property value.
   */
  get sdkOptions(): T {
    return this._sdkOptions
  }

  /**
   * Getter for the fullClient property.
   * @returns {FullClient} The fullClient property value.
   */
  get FullClient(): FullClient {
    return this._fullClient
  }

  /**
   * Update the full RPC URL
   * @param full_rpc_url - The new full RPC URL
   */
  updateFullRpcUrl(full_rpc_url: string): void {
    this._sdkOptions.full_rpc_url = full_rpc_url
    this._fullClient = createFullClient(new SuiClient({ url: full_rpc_url }))
  }

  updateSuiClient(sui_client: SuiClient): void {
    this._fullClient = createFullClient(sui_client)
  }

  /**
   * Static factory method to initialize the SDK
   * @param options SDK initialization options
   * @param clmm_sdk Optional CLMM SDK instance
   * @returns An instance of the SDK
   */
  static createSDK(options: BaseSdkOptions, clmm_sdk?: any): any {
    throw new Error('createSDK must be implemented in derived class')
  }

  /**
   * Create a custom SDK instance with the given options
   * @param options The options for the SDK
   * @param clmm_sdk Optional CLMM SDK instance
   * @returns An instance of the SDK
   */
  static createCustomSDK<T extends BaseSdkOptions>(options: T, clmm_sdk?: any): any {
    throw new Error('createCustomSDK must be implemented in derived class')
  }

  /**
   * Getter for the sender address property.
   * @param {boolean} validate - Whether to validate the sender address. Default is true.
   * @returns The sender address value.
   */
  getSenderAddress(validate = true) {
    if (validate && !isValidSuiAddress(this._senderAddress)) {
      handleMessageError(
        CommonErrorCode.InvalidSenderAddress,
        'Invalid sender address: sdk requires a valid sender address. Please set it using sdk.setSenderAddress("0x...")'
      )
    }
    return this._senderAddress
  }

  /**
   * Setter for the sender address property.
   * @param {string} value - The new sender address value.
   */
  setSenderAddress(value: string) {
    this._senderAddress = value
  }

  /**
   * Updates the cache for the given key.
   *
   * @param key The key of the cache entry to update.
   * @param data The data to store in the cache.
   * @param time The time in minutes after which the cache entry should expire.
   */
  updateCache(key: string, data: SuiResource, time = CACHE_TIME_24H): void {
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
   *
   * @param key The key of the cache entry to get.
   * @param force_refresh Whether to force a refresh of the cache entry.
   * @returns The cache entry for the given key, or undefined if the cache entry does not exist or is expired.
   */
  getCache<T>(key: string, force_refresh = false): T | undefined {
    const cacheData = this._cache[key]
    const isValid = cacheData?.isValid()
    if (!force_refresh && isValid) {
      return cacheData.value as T
    }
    if (!isValid) {
      delete this._cache[key]
    }
    return undefined
  }
}
