import { isValidSuiAddress } from '@mysten/sui/utils'
import { CommonErrorCode, handleMessageError } from '../errors/errors'
import { FullClient, FullRpcUrlMainnet, FullRpcUrlTestnet, type BaseSdkOptions, type SuiAddressType, type SuiResource } from '../type/sui'
import { CACHE_TIME_24H, CachedContent, getFutureTime } from '../utils/cachedContent'
import { patchFixSuiObjectId } from '../utils/contracts'
import { SuiGraphQLClient } from '@mysten/sui/graphql'
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc'
import { createFullClient } from '../modules/extendedSuiClient'
import { SuiGrpcClient } from '@mysten/sui/grpc'

export abstract class SdkWrapper<T extends BaseSdkOptions> {
  readonly _cache: Record<string, CachedContent> = {}
  private _fullClient: FullClient
  private _graphClient: SuiGraphQLClient | undefined
  private _suiGrpcClient: SuiGrpcClient | undefined
  private _senderAddress: SuiAddressType = ''
  private _env: 'mainnet' | 'testnet' = 'mainnet'
  /**
   *  Provide sdk options
   */
  protected _sdkOptions: T

  constructor(options: T) {
    const { sui_client, graph_client, env = 'mainnet', full_rpc_url, graph_rpc_url, sui_grpc_client } = options
    this._sdkOptions = options
    this._env = env
    this._sdkOptions.full_rpc_url = full_rpc_url
    this._sdkOptions.graph_rpc_url = graph_rpc_url
    this._suiGrpcClient = sui_grpc_client ? sui_grpc_client : full_rpc_url ? new SuiGrpcClient({ baseUrl: full_rpc_url, network: env }) : undefined

    const suiClient = sui_client ? sui_client : full_rpc_url ? new SuiJsonRpcClient({ url: full_rpc_url, network: env }) : undefined
    this._graphClient = graph_client
      ? graph_client
      : graph_rpc_url
        ? new SuiGraphQLClient({
          network: env,
          url: graph_rpc_url,
        })
        : undefined

    if (!suiClient) {
      throw new Error('sui_client or full_rpc_url is required')
    }

    this._fullClient = createFullClient<SuiJsonRpcClient>(suiClient, this._graphClient, this._suiGrpcClient, env)
  }

  /**
   * Getter for the sdkOptions property.
   * @returns {SdkOptions} The sdkOptions property value.
   */
  get sdkOptions(): T {
    return this._sdkOptions
  }

  /**
   * Getter for the FullClient property.
   * @returns {FullClient} The SuiJsonRpcClient property value.
   */
  get FullClient(): FullClient {
    return this._fullClient
  }

  get GraphClient(): SuiGraphQLClient | undefined {
    return this._graphClient
  }

  /**
   * Update the full RPC URL
   * @param full_rpc_url - The new full RPC URL
   */
  updateFullRpcUrl(full_rpc_url: string): void {
    this._sdkOptions.full_rpc_url = full_rpc_url
    this._fullClient = createFullClient<SuiJsonRpcClient>(new SuiJsonRpcClient({ url: full_rpc_url, network: this._env }), this._graphClient, this._suiGrpcClient, this._env)
  }

  updateSuiClient(sui_client: SuiJsonRpcClient): void {
    this._fullClient = createFullClient<SuiJsonRpcClient>(sui_client, this._graphClient, this._suiGrpcClient, this._env)
  }

  updateGraphRpcUrl(graph_rpc_url: string): void {
    this._sdkOptions.graph_rpc_url = graph_rpc_url
    this._graphClient = new SuiGraphQLClient({
      network: this._env,
      url: graph_rpc_url,
    })
    this._fullClient = createFullClient<SuiJsonRpcClient>(this._fullClient._client, this._graphClient, this._suiGrpcClient, this._env)
  }

  updateGraphClient(graph_client: SuiGraphQLClient): void {
    this._graphClient = graph_client
    this._fullClient = createFullClient(this._fullClient._client, this._graphClient, this._suiGrpcClient, this._env)
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
