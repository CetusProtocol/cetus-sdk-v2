import { AggregatorClient, Env } from '@cetusprotocol/aggregator-sdk'
import { SuiClient } from '@mysten/sui/client'
import { normalizeSuiAddress } from '@mysten/sui/utils'
import { CetusClmmSDK } from '@cetusprotocol/sui-clmm-sdk'
import { BaseSdkOptions, SdkWrapper } from '@cetusprotocol/common-sdk'
import { CetusFarmsSDK } from '@cetusprotocol/farms-sdk'
import { zapMainnet } from './config/mainnet'
import { zapTestnet } from './config/testnet'
import { ZapModule } from './modules/zapModule'
import { CompoundModule } from './modules/compoundModule'
/**
 * Represents options and configurations for an SDK.
 */
export interface SdkOptions extends BaseSdkOptions {
  /**
   * The URL of the aggregator service.
   */
  aggregator_url: string
  /**
   * A list of  aggregator providers.
   */
  providers: string[]

  /**
   * A list of Pyth price ID.
   */
  pyth_urls?: string[]
}

/**
 * The entry class of CetusFarmsSDK, which is almost responsible for all interactions with farms.
 */
export class CetusZapSDK extends SdkWrapper<SdkOptions> {
  /**
   * Module for managing vaults.
   */
  protected _zapModule: ZapModule

  protected _compoundModule: CompoundModule

  protected _clmmSDK: CetusClmmSDK

  protected _farmsSDK: CetusFarmsSDK

  /**
   * Client for interacting with the Aggregator service.
   */
  protected _aggregatorClient: AggregatorClient

  constructor(options: SdkOptions, clmmSDK?: CetusClmmSDK) {
    super(options)

    /**
     * Initialize the ZapModule.
     */
    this._zapModule = new ZapModule(this)

    /**
     * Initialize the CompoundModule.
     */
    this._compoundModule = new CompoundModule(this)

    /**
     * Initialize the ClmmSDK.
     */
    this._clmmSDK = clmmSDK || CetusClmmSDK.createSDK({ env: options.env, full_rpc_url: options.full_rpc_url })

    /**
     * Initialize the FarmsSDK.
     */
    this._farmsSDK = CetusFarmsSDK.createSDK({ env: options.env, full_rpc_url: options.full_rpc_url }, this._clmmSDK)

    /**
     * Initialize the AggregatorClient.
     */
    this._aggregatorClient = new AggregatorClient({
      signer: normalizeSuiAddress('0x0'),
      client: options.sui_client || new SuiClient({ url: options.full_rpc_url! }),
      env: options.env === 'testnet' ? Env.Testnet : Env.Mainnet,
      pythUrls: options.pyth_urls,
    })
  }

  setSenderAddress(value: string): void {
    this._farmsSDK.setSenderAddress(value)
  }

  getSenderAddress(validate: boolean = true): string {
    return this._farmsSDK.getSenderAddress(validate)
  }

  /**
   * Updates the providers for the AggregatorClient.
   * @param providers - The new providers to set.
   */
  updateProviders(providers: string[]) {
    if (providers.length === 0) {
      throw new Error('providers is empty')
    }
    this._sdkOptions.providers = providers
  }

  updateFullRpcUrl(url: string): void {
    super.updateFullRpcUrl(url)
    this._farmsSDK.updateFullRpcUrl(url)
    this._aggregatorClient = new AggregatorClient({
      signer: normalizeSuiAddress('0x0'),
      client: new SuiClient({ url: url }),
      env: this._sdkOptions.env === 'testnet' ? Env.Testnet : Env.Mainnet,
      pythUrls: this._sdkOptions.pyth_urls,
    })
  }

  /**
   * Getter for the ClmmSDK property.
   * @returns {CetusClmmSDK} The ClmmSDK property value.
   */
  get ClmmSDK(): CetusClmmSDK {
    return this._clmmSDK
  }

  /**
   * Getter for the FarmsSDK property.
   * @returns {CetusFarmsSDK} The FarmsSDK property value.
   */
  get FarmsSDK(): CetusFarmsSDK {
    return this._farmsSDK
  }

  /**
   * Getter for the AggregatorClient property.
   * @returns {AggregatorClient} The AggregatorClient property value.
   */
  get AggregatorClient(): AggregatorClient {
    return this._aggregatorClient
  }

  /**
   * Getter for the ZapModule property.
   * @returns {ZapModule} The ZapModule property value.
   */
  get Zap(): ZapModule {
    return this._zapModule
  }

  /**
   * Getter for the CompoundModule property.
   * @returns {CompoundModule} The CompoundModule property value.
   */
  get Compound(): CompoundModule {
    return this._compoundModule
  }

  /**
   * Static factory method to initialize the SDK
   * @param options SDK initialization options
   * @param clmm_sdk Optional CLMM SDK instance
   * @returns An instance of CetusZapSDK
   */
  static createSDK(options: BaseSdkOptions, clmm_sdk?: any): CetusZapSDK {
    const { env = 'mainnet', full_rpc_url } = options
    return env === 'mainnet'
      ? CetusZapSDK.createCustomSDK({ ...zapMainnet, ...options }, clmm_sdk)
      : CetusZapSDK.createCustomSDK({ ...zapTestnet, ...options }, clmm_sdk)
  }

  /**
   * Create a custom SDK instance with the given options
   * @param options The options for the SDK
   * @returns An instance of CetusBurnSDK
   */
  static createCustomSDK<T extends BaseSdkOptions>(options: T & SdkOptions, clmm_sdk?: CetusClmmSDK): CetusZapSDK {
    return new CetusZapSDK(options, clmm_sdk)
  }
}
