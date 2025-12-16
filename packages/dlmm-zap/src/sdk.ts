import { AggregatorClient, Env } from '@cetusprotocol/aggregator-sdk'
import { SuiClient } from '@mysten/sui/client'
import { normalizeSuiAddress } from '@mysten/sui/utils'
import { CetusDlmmSDK } from '@cetusprotocol/dlmm-sdk'
import { BaseSdkOptions, SdkWrapper } from '@cetusprotocol/common-sdk'
import { zapMainnet } from './config/mainnet'
import { zapTestnet } from './config/testnet'
import { ZapModule } from './modules/zapModule'
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
 * The entry class of CetusDlmmZapSDK, which is almost responsible for all interactions with dlmm zap.
 */
export class CetusDlmmZapSDK extends SdkWrapper<SdkOptions> {
  /**
   * Module for managing vaults.
   */
  protected _zapModule: ZapModule

  protected _dlmmSDK: CetusDlmmSDK

  /**
   * Client for interacting with the Aggregator service.
   */
  protected _aggregatorClient: AggregatorClient

  constructor(options: SdkOptions, dlmmSDK?: CetusDlmmSDK) {
    super(options)

    /**
     * Initialize the ZapModule.
     */
    this._zapModule = new ZapModule(this)

    /**
     * Initialize the DlmmSDK.
     */
    this._dlmmSDK = dlmmSDK || CetusDlmmSDK.createSDK({ env: options.env, full_rpc_url: options.full_rpc_url })

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
    this._dlmmSDK.setSenderAddress(value)
  }

  getSenderAddress(validate: boolean = true): string {
    return this._dlmmSDK.getSenderAddress(validate)
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
    this._dlmmSDK.updateFullRpcUrl(url)
    this._aggregatorClient = new AggregatorClient({
      signer: normalizeSuiAddress('0x0'),
      client: new SuiClient({ url: url }),
      env: this._sdkOptions.env === 'testnet' ? Env.Testnet : Env.Mainnet,
      pythUrls: this._sdkOptions.pyth_urls,
    })
  }

  /**
   * Getter for the DlmmSDK property.
   * @returns {CetusDlmmSDK} The DlmmSDK property value.
   */
  get DlmmSDK(): CetusDlmmSDK {
    return this._dlmmSDK
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
   * Static factory method to initialize the SDK
   * @param options SDK initialization options
   * @param clmm_sdk Optional CLMM SDK instance
   * @returns An instance of CetusZapSDK
   */
  static createSDK(options: BaseSdkOptions, dlmm_sdk?: any): CetusDlmmZapSDK {
    const { env = 'mainnet', full_rpc_url } = options
    return env === 'mainnet'
      ? CetusDlmmZapSDK.createCustomSDK({ ...zapMainnet, ...options }, dlmm_sdk)
      : CetusDlmmZapSDK.createCustomSDK({ ...zapTestnet, ...options }, dlmm_sdk)
  }

  /**
   * Create a custom SDK instance with the given options
   * @param options The options for the SDK
   * @returns An instance of CetusBurnSDK
   */
  static createCustomSDK<T extends BaseSdkOptions>(options: T & SdkOptions, dlmm_sdk?: CetusDlmmSDK): CetusDlmmZapSDK {
    return new CetusDlmmZapSDK(options, dlmm_sdk)
  }
}
