import type { BaseSdkOptions, Package } from '@cetusprotocol/common-sdk'
import { SdkWrapper } from '@cetusprotocol/common-sdk'
import { xcetus_mainnet, xcetus_testnet } from './config'
import { XCetusModule } from './modules/xcetusModule'
import type { DividendConfig, XcetusConfig } from './types/xcetus_type'

/**
 * Represents options and configurations for an SDK.
 */
export interface SdkOptions extends BaseSdkOptions {
  env: 'mainnet' | 'testnet'
  xcetus: Package<XcetusConfig>
  xcetus_dividends: Package<DividendConfig>
  cetus_faucet: Package
}

/**
 * The entry class of CetusXcetusSDK, which is almost responsible for all interactions with Xcetus.
 */
export class CetusXcetusSDK extends SdkWrapper<SdkOptions> {
  /**
   * Provide interact with Xcetus interface.
   */
  protected _xcetusModule: XCetusModule

  constructor(options: SdkOptions) {
    super(options)

    this._xcetusModule = new XCetusModule(this)
  }

  /**
   * Getter for the Xcetus property.
   * @returns {XCetusModule} The Xcetus property value.
   */
  get XCetusModule() {
    return this._xcetusModule
  }

  /**
   * Static factory method to initialize the SDK
   * @param options SDK initialization options
   * @returns An instance of CetusXcetusSDK
   */
  static createSDK(options: BaseSdkOptions): CetusXcetusSDK {
    const { env = 'mainnet', full_rpc_url } = options
    return env === 'mainnet'
      ? CetusXcetusSDK.createCustomSDK({ ...xcetus_mainnet, ...options })
      : CetusXcetusSDK.createCustomSDK({ ...xcetus_testnet, ...options })
  }

  /**
   * Create a custom SDK instance with the given options
   * @param options The options for the SDK
   * @returns An instance of CetusBurnSDK
   */
  static createCustomSDK<T extends BaseSdkOptions>(options: T & SdkOptions): CetusXcetusSDK {
    return new CetusXcetusSDK(options)
  }
}
